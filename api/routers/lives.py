"""Uma transmissao: cabecalho, serie, previsao de custo."""
import sqlite3
import statistics
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from collector import config, vigilancia, yt

from .. import secoes
from ..deps import conexao
from .. import trechos
from ..transmissoes import lives_do_canal, mapa_links, mesmo_conteudo, resumo_live, serie

router = APIRouter(tags=["lives"])

COTA_DIA = 10000
# Usada so quando nao ha coleta medida para estimar custo por hora.
UNIDADES_HORA_PADRAO = 609
# Sem historico do canal, a duracao estimada de uma live agendada.
DURACAO_PADRAO_S = 2 * 3600


def _live_ou_404(con, video_id):
    # trecho ("V~2"): cria as visoes da janela dele nesta conexao (api/trechos.py)
    if trechos.preparar(con, video_id) is None:
        raise HTTPException(404, "trecho não encontrado")
    l = con.execute(
        """SELECT l.*, c.nome AS canal_nome, c.handle AS canal_handle
           FROM live l JOIN canal c ON c.canal_id = l.canal_id WHERE l.video_id = ?""",
        (video_id,)).fetchone()
    if not l:
        raise HTTPException(404, "transmissão não encontrada")
    return l


def _resumo(con, l):
    """A linha da transmissao como a lista do canal a ve (estado, numero)."""
    for d in lives_do_canal(con, l["canal_id"]):
        if d["video_id"] == l["video_id"]:
            return resumo_live(d)
    # live que nao entra na lista (nao vigiada): sem numero
    return None


def _momentos(con, video_id):
    rows = con.execute(
        """SELECT offset_segundos t, tipo, magnitude, url_timestamp url FROM momento
           WHERE video_id = ? AND offset_segundos >= 0 ORDER BY offset_segundos""",
        (video_id,)).fetchall()
    return [dict(r) for r in rows]


@router.get("/lives/{video_id}")
def detalhe(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    l = _live_ou_404(con, video_id)
    r = _resumo(con, l)
    lista = [resumo_live(d) for d in lives_do_canal(con, l["canal_id"])]
    # o mesmo conteudo em outra transmissao do canal (link de reserva, trecho
    # de outro video): a tela liga as duas para nao parecerem duplicadas, e
    # avisa quando uma delas ficou sem coleta
    mesmo = mesmo_conteudo(lista, video_id, l["titulo"], l["inicio_real"])
    # trechos do mesmo video; aberto pelo id do video inteiro, lista os dele
    pai = r["trecho"]["video_id"] if r and r["trecho"] else video_id
    irmaos = [{"id": x["id"], "titulo": x["titulo"], "estado": x["estado"], "inicio": x["inicio"], "fim": x["fim"],
               "trecho": x["trecho"]}
              for x in lista if x["trecho"] and x["trecho"]["video_id"] == pai]
    tot = con.execute(
        """SELECT COUNT(*) n, COUNT(DISTINCT autor_pid) p FROM mensagem
           WHERE video_id = ? AND offset_segundos >= 0""", (video_id,)).fetchone()
    cota = con.execute(
        "SELECT COALESCE(SUM(custo_unidades), 0) u FROM coleta_log WHERE video_id = ?",
        (video_id,)).fetchone()["u"]
    tem_serie = con.execute(
        "SELECT 1 FROM snapshot_audiencia WHERE video_id = ? AND espectadores IS NOT NULL LIMIT 1",
        (video_id,)).fetchone() is not None
    tem_chat = tot["n"] > 0

    subs = ["resumo"]
    if tem_serie:
        subs += ["audiencia", "chat"]
    if tem_chat:
        subs += ["pessoas", "contexto", "qualidade"]
    # coleta encerrada tem ficha, e a ficha se compara com as outras
    if r and r["estado"] in ("coletada", "parcial"):
        subs.append("comparar")

    return {
        "id": video_id,
        "canal": {"id": l["canal_id"], "nome": l["canal_nome"], "handle": l["canal_handle"]},
        **(r or {"numero": None, "estado": None}),
        "titulo": l["titulo"],
        "agendada_para": l["agendada_para"],
        "inicio": l["inicio_real"],
        "fim": l["fim_real"],
        "duracao_s": l["duracao_segundos"],
        "pessoas": tot["p"],
        "mensagens_live": tot["n"],
        "cota_unidades": cota,
        "momentos": _momentos(con, video_id),
        "tem_serie": tem_serie,
        "tem_chat": tem_chat,
        "subabas": subs,
        "url": trechos.url_video(video_id, ini=r["trecho"]["ini"] if r and r["trecho"] else None),
        "mesmo_jogo": mesmo,
        "links": mapa_links(lista, video_id),
        "trechos": irmaos,
    }


@router.get("/lives/{video_id}/serie")
def serie_live(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    _live_ou_404(con, video_id)
    s = serie(con, video_id)
    if not s:
        raise HTTPException(404, "esta transmissão não tem série minuto a minuto")
    return s


def unidades_por_hora(con, canal_id=None):
    """
    Custo medido, nao suposto: unidades gastas nas coletas feitas, dividido
    pelo tempo em que o coletor esteve ligado. Com canal_id, mede so as
    coletas daquele canal (chat de futebol custa bem mais que telejornal) e,
    sem historico suficiente dele, cai na media geral.
    """
    if canal_id:
        r = _medir(con, "AND l.canal_id = ?", (canal_id,))
        if r:
            return r, True
    r = _medir(con, "", ())
    return (r, True) if r else (UNIDADES_HORA_PADRAO, False)


def _medir(con, filtro, args):
    rows = con.execute(
        # sem a busca de concorrencia: ela tem custo fixo por live (ver _estimar),
        # nao por hora, e ate 18/10 rodava a cada 15 min
        f"""SELECT l.coleta_inicio, l.coleta_fim,
                  (SELECT SUM(custo_unidades) FROM main.coleta_log g WHERE g.video_id = l.video_id
                   AND g.metodo != 'search.list') u
           FROM main.live l WHERE l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NOT NULL {filtro}""",
        args).fetchall()
    horas = unidades = 0.0
    for r in rows:
        a, b = yt.parse_ts(r["coleta_inicio"]), yt.parse_ts(r["coleta_fim"])
        if a and b and r["u"]:
            horas += (b - a).total_seconds() / 3600
            unidades += r["u"]
    if horas < 0.25:
        return None
    return round(unidades / horas)


def _duracao_estimada(con, canal_id):
    durs = [r[0] for r in con.execute(
        """SELECT duracao_segundos FROM live WHERE canal_id = ? AND status = 'encerrada'
           AND duracao_segundos BETWEEN 600 AND 6 * 3600""", (canal_id,))]
    if not durs:
        return DURACAO_PADRAO_S, False
    return int(statistics.median(durs)), True


def _dia_cota(iso):
    """A cota do YouTube zera a meia-noite do Pacifico."""
    t = yt.parse_ts(iso)
    if not t:
        return None
    try:
        from zoneinfo import ZoneInfo
        return t.astimezone(ZoneInfo("America/Los_Angeles")).date().isoformat()
    except Exception:
        return (t - timedelta(hours=8)).date().isoformat()


def buscas_concorrencia(dur):
    """Quantas buscas de concorrencia o coletor faz numa live de `dur` segundos."""
    if not config.CONCORRENCIA_LIGADA or dur < config.PRIMEIRA_CONCORRENCIA:
        return 0
    return min(config.CONCORRENCIA_MAX, 1 + int((dur - config.PRIMEIRA_CONCORRENCIA) // config.INTERVALO_CONCORRENCIA))


def _estimar(con, canal_id, cache):
    """
    (duracao estimada, duracao veio do canal, unidades/h, medida, custo).
    Custo = chat e audiencia (unidades/h medidas x duracao) + buscas de
    concorrencia (custo fixo por busca).
    """
    if canal_id not in cache:
        dur, dur_do_canal = _duracao_estimada(con, canal_id)
        un_h, medido = unidades_por_hora(con, canal_id)
        custo = round(un_h * dur / 3600) + buscas_concorrencia(dur) * config.CUSTO_CONCORRENCIA
        cache[canal_id] = (dur, dur_do_canal, un_h, medido, custo)
    return cache[canal_id]


# Leitura de agenda: videos.list em lote (1 un.) a cada 5 min por canal
# vigiado, mais a leitura diaria de uploads. ~300 un. por canal por dia.
AGENDA_DIA_POR_CANAL = 24 * 12 + 12


def _escolhidas_agendadas(con):
    """Lives agendadas que vao virar coleta: de canal vigiado ou coladas pelo link."""
    return con.execute(
        """SELECT l.video_id, l.titulo, l.agendada_para, l.canal_id, c.nome canal
           FROM live l JOIN canal c ON c.canal_id = l.canal_id
           WHERE l.status = 'agendada' AND ((c.vigiado = 1 AND c.removido_em IS NULL) OR l.avulsa = 1)
             AND l.agendada_para IS NOT NULL
             AND (l.coletar = 1 OR (l.coletar IS NULL AND c.modo_coleta = 'todas'))""").fetchall()


def gasto_no_dia(con, dia):
    """Unidades ja gastas no dia de cota (meia-noite a meia-noite do Pacifico)."""
    rows = con.execute(
        "SELECT chamado_em, custo_unidades FROM coleta_log WHERE chamado_em >= ?",
        ((datetime.now(timezone.utc) - timedelta(days=2)).isoformat(timespec="seconds"),)).fetchall()
    return sum(r["custo_unidades"] or 0 for r in rows if _dia_cota(r["chamado_em"]) == dia)


def cota_por_dia(con):
    """
    O que as lives escolhidas devem gastar em cada dia de cota, contra o
    limite diario: soma estimada, quantas ao mesmo tempo no pior momento e,
    no dia de hoje, o que ja foi gasto. Estimativa = duracao mediana das
    lives do canal x unidades/hora medidas nas coletas do canal.
    """
    cache, dias = {}, {}
    agora = datetime.now(timezone.utc)
    n_canais = con.execute("SELECT COUNT(*) FROM canal WHERE vigiado = 1 AND removido_em IS NULL").fetchone()[0]
    hoje = _dia_cota(agora.isoformat())
    for o in _escolhidas_agendadas(con):
        ini = yt.parse_ts(o["agendada_para"])
        # agendada que ja passou da hora e nao subiu: nao reserva cota
        if not ini or ini < agora - timedelta(hours=1):
            continue
        dur, _, _, _, custo = _estimar(con, o["canal_id"], cache)
        d = dias.setdefault(_dia_cota(o["agendada_para"]), [])
        d.append({"id": o["video_id"], "titulo": o["titulo"], "canal": o["canal"],
                  "agendada_para": o["agendada_para"], "custo": custo,
                  "fim_estimado": (ini + timedelta(seconds=dur)).isoformat(timespec="seconds")})
    saida = []
    for dia in sorted(dias):
        lives = sorted(dias[dia], key=lambda x: x["agendada_para"])
        # pico de simultaneas: varre inicios e fins
        eventos = sorted([(yt.parse_ts(x["agendada_para"]), 1) for x in lives]
                         + [(yt.parse_ts(x["fim_estimado"]), -1) for x in lives], key=lambda e: (e[0], e[1]))
        cur = pico = 0
        pico_em = None
        for t, dlt in eventos:
            cur += dlt
            if cur > pico:
                pico, pico_em = cur, t.isoformat(timespec="seconds")
        gasto = gasto_no_dia(con, dia) if dia == hoje else 0
        estimado = sum(x["custo"] for x in lives)
        # agenda: o que falta do dia (hoje) ou o dia inteiro
        resto = 1.0
        if dia == hoje:
            from zoneinfo import ZoneInfo
            pt = agora.astimezone(ZoneInfo("America/Los_Angeles"))
            resto = 1 - (pt.hour * 3600 + pt.minute * 60) / 86400
        agenda = round(n_canais * AGENDA_DIA_POR_CANAL * resto)
        saida.append({"dia": dia, "lives": lives, "estimado": estimado, "gasto": gasto, "agenda": agenda,
                      "total": estimado + gasto + agenda, "limite": COTA_DIA,
                      "pico_simultaneas": pico, "pico_em": pico_em})
    return saida


@router.get("/cota/previsao")
def previsao_cota(con: sqlite3.Connection = Depends(conexao)):
    return {"dias": cota_por_dia(con)}


@router.get("/lives/{video_id}/previsao")
def previsao(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    """Custo estimado de uma live agendada e a cota ja reservada no mesmo dia."""
    l = _live_ou_404(con, video_id)
    dur, dur_do_canal, un_h, medido, custo = _estimar(con, l["canal_id"], {})
    dia = _dia_cota(l["agendada_para"])
    outras = []
    if dia:
        cache = {}
        for o in _escolhidas_agendadas(con):
            if o["video_id"] != video_id and _dia_cota(o["agendada_para"]) == dia:
                outras.append({"id": o["video_id"], "titulo": o["titulo"], "canal": o["canal"],
                               "agendada_para": o["agendada_para"], "custo": _estimar(con, o["canal_id"], cache)[4]})
    outras.sort(key=lambda o: o["agendada_para"])
    r = _resumo(con, l)
    escolhida = bool(r and r["coletar"])
    # nao escolhida nao reserva cota: o custo mostra quanto custaria
    reservado = (custo if escolhida else 0) + sum(o["custo"] for o in outras)
    return {
        "escolhida": escolhida,
        "unidades_hora": un_h, "unidades_hora_medida": medido,
        "duracao_estimada_s": dur, "duracao_do_canal": dur_do_canal,
        "custo": custo, "cota_dia": COTA_DIA, "dia_cota": dia,
        "outras": outras, "reservado": reservado,
    }


class Escolha(BaseModel):
    coletar: bool | None  # None: volta a seguir o modo do canal


@router.put("/lives/{video_id}/coletar")
def escolher(video_id: str, corpo: Escolha, con: sqlite3.Connection = Depends(conexao)):
    """
    Marca a live para coletar ou nao. Vale para agendada e para live no ar
    sem coletor ("Coletar agora": o vigia sobe o coletor no proximo ciclo).
    Live encerrada ou com coleta feita nao muda: a escolha so faz sentido
    antes de o chat acabar.
    """
    video_id = trechos.separar(video_id)[0]
    l = _live_ou_404(con, video_id)
    if l["coleta_inicio"] and not l["coleta_fim"]:
        if corpo.coletar is False:
            raise HTTPException(409, "A coleta já está rodando. Use \"Encerrar coleta\" para parar.")
    elif l["status"] not in ("agendada", "ao_vivo"):
        raise HTTPException(409, "Esta transmissão já terminou: não dá mais para escolher coletar.")
    v = None if corpo.coletar is None else int(corpo.coletar)
    # "Coletar agora" depois de um "Encerrar coleta": a escolha nova vale
    limpa = ", parar_pedido_em = NULL" if corpo.coletar else ""
    con.execute(f"UPDATE live SET coletar = ?{limpa} WHERE video_id = ?", (v, video_id))
    con.commit()
    return _resumo(con, _live_ou_404(con, video_id))


# ------------------------------------------------------- live pelo link

# O que "Ler" trouxe fica aqui alguns minutos: confirmar nao gasta outra unidade.
_lidas: dict[str, tuple[datetime, dict]] = {}
LIDA_VALE = timedelta(minutes=15)


class Link(BaseModel):
    link: str


def _ler_video(con, video_id):
    if not config.API_KEY:
        raise HTTPException(503, "YT_API_KEY não configurada no .env do servidor.")
    try:
        itens = yt.videos(con, [video_id])
    except yt.ErroCota:
        raise HTTPException(503, "A cota diária da API do YouTube acabou. Tente de novo amanhã.")
    except (yt.ErroAPI, yt.ErroRede) as e:
        raise HTTPException(502, f"O YouTube não respondeu: {e}")
    if not itens:
        raise HTTPException(404, "Não achei esse vídeo. Ele pode ser privado ou ter sido apagado.")
    item = itens[0]
    lsd = item.get("liveStreamingDetails")
    if not lsd:
        raise HTTPException(422, "Esse link é de um vídeo comum, não de uma transmissão ao vivo.")
    if lsd.get("actualEndTime"):
        raise HTTPException(409, "Essa transmissão já acabou. O chat só pode ser coletado enquanto a live está no ar.")
    _lidas[video_id] = (datetime.now(timezone.utc), item)
    return item


@router.post("/lives/link/ler")
def ler_link(corpo: Link, con: sqlite3.Connection = Depends(conexao)):
    """O que o link e, antes de confirmar: titulo, canal, horario. 1 unidade."""
    video_id = vigilancia.id_do_link(corpo.link)
    if not video_id:
        raise HTTPException(422, "Não reconheci o link. Cole o endereço da live no YouTube (watch?v=…, youtu.be/… ou /live/…).")
    item = _ler_video(con, video_id)
    snip, lsd = item.get("snippet", {}), item["liveStreamingDetails"]
    c = con.execute("SELECT vigiado, removido_em FROM canal WHERE canal_id=?", (snip.get("channelId"),)).fetchone()
    ja = con.execute("SELECT coletar, avulsa FROM live WHERE video_id=?", (video_id,)).fetchone()
    return {
        "id": video_id,
        "titulo": snip.get("title"),
        "canal": snip.get("channelTitle"),
        "canal_vigiado": bool(c and c["vigiado"] and not c["removido_em"]),
        "agendada_para": lsd.get("scheduledStartTime"),
        "no_ar": bool(lsd.get("actualStartTime")),
        "ja_marcada": bool(ja and ja["coletar"]),
    }


@router.post("/lives/link", status_code=201)
def coletar_link(corpo: Link, con: sqlite3.Connection = Depends(conexao)):
    """
    Marca a live do link para coleta. Canal nao vigiado nao vira canal da
    lista nem ocupa slot: o vigia acompanha so esta live.
    """
    video_id = vigilancia.id_do_link(corpo.link)
    if not video_id:
        raise HTTPException(422, "Não reconheci o link.")
    lida = _lidas.pop(video_id, None)
    if lida and datetime.now(timezone.utc) - lida[0] <= LIDA_VALE:
        item = lida[1]
    else:
        item = _ler_video(con, video_id)
        _lidas.pop(video_id, None)
    try:
        avulsa = vigilancia.coletar_avulsa(con, item)
    except yt.ErroCota:
        raise HTTPException(503, "A cota diária da API do YouTube acabou. Tente de novo amanhã.")
    return {"id": video_id, "avulsa": avulsa}


@router.get("/lives/{video_id}/secoes/{secao}")
def secao(video_id: str, secao: str, versao: str = "interna", con: sqlite3.Connection = Depends(conexao)):
    """
    Uma secao da aba Dados. `versao=publica` tira texto de chat e qualquer
    identificador de autor: e a mesma projecao que o link publico usa.
    """
    _live_ou_404(con, video_id)
    f = secoes.SECOES.get(secao)
    if not f:
        raise HTTPException(404, f"seção desconhecida: {secao}")
    if versao not in ("interna", "publica"):
        raise HTTPException(422, "versao é 'interna' ou 'publica'")
    return f(con, video_id, versao)


@router.post("/lives/{video_id}/encerrar", status_code=202)
def encerrar(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    """
    Pede ao coletor que encerre. Ele confere o pedido a cada volta do loop,
    fecha o banco e calcula a cobertura; o que ja foi capturado fica.
    """
    video_id = trechos.separar(video_id)[0]  # trecho: o coletor e do video inteiro
    l = _live_ou_404(con, video_id)
    if not l["coleta_inicio"] or l["coleta_fim"]:
        raise HTTPException(409, "não há coleta em andamento nesta transmissão")
    con.execute("UPDATE live SET parar_pedido_em=? WHERE video_id=?", (datetime.now(timezone.utc).isoformat(timespec="seconds"), video_id))
    con.commit()
    return {"pedido": True}


class Divisao(BaseModel):
    # segundos desde o inicio do video; [] = sem divisao; None = automatica
    cortes: list[int] | None


@router.put("/lives/{video_id}/divisao")
def dividir(video_id: str, corpo: Divisao, con: sqlite3.Connection = Depends(conexao)):
    """
    Ajusta onde o video se divide em trechos. O dado bruto nao muda: o corte
    so diz que janela de tempo cada transmissao le.
    """
    video_id = trechos.separar(video_id)[0]
    l = _live_ou_404(con, video_id)
    dur = l["duracao_segundos"]
    if corpo.cortes is not None and any(c <= 0 or (dur and c >= dur) for c in corpo.cortes):
        raise HTTPException(422, "o corte precisa cair dentro da transmissão")
    trechos.gravar(con, video_id, corpo.cortes)
    return {"trechos": [{"id": f"{video_id}{trechos.SEP}{t['n']}", **t} for t in trechos.trechos(con, l)]}
