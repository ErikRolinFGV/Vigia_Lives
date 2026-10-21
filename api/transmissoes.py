"""
Leituras de transmissao que mais de um router usa: estado, numeracao e a
serie minuto a minuto.

O estado nao e uma coluna: e derivado do que o banco sabe. Assim uma coleta
que caiu sem atualizar `live.status` nao aparece como "no ar" para sempre.
"""
from datetime import datetime, timedelta, timezone

from collector import yt

from . import trechos

# Abaixo disso a coleta e PARCIAL: ficou um buraco que o relatorio precisa
# declarar. Acima, COLETADA.
LIMIAR_PARCIAL = 90.0
JANELA = 60


def _ts(s):
    return yt.parse_ts(s) if s else None


def vai_coletar(l):
    """
    A live entra na coleta? Escolha explicita (live.coletar) vale sobre o
    modo do canal; sem escolha, segue o modo ('todas' coleta, 'escolhidas' nao).
    """
    if l["coletar"] is not None:
        return bool(l["coletar"])
    return (l["modo_coleta"] or "todas") == "todas"


def estado(l):
    """
    no_ar          coletor rodando agora
    coletada       coleta feita, cobertura >= LIMIAR_PARCIAL
    parcial        coleta feita, cobertura abaixo do limiar
    agendada       anunciada, ainda nao comecou (escolhida ou nao: ver
                   `coletar` no resumo)
    perdida        devia ser coletada e ninguem coletou (vigia parado, PC
                   desligado, cota): uma falha, e a tela diz isso
    nao_escolhida  no ar ou encerrada sem coleta porque ninguem escolheu
                   coletar: decisao, nao falha
    None           live que so foi descoberta depois de acabar: nao vigiada,
                   fica fora da lista do canal (aparece so na comparacao)
    """
    if l["coleta_inicio"] and not l["coleta_fim"]:
        return "no_ar"
    if l["coleta_inicio"]:
        cob = l["cobertura_pct"]
        acomp = acompanhada_pct(l)
        # coleta fechada com a live ainda no ar: o resto da transmissao ja
        # esta ficando sem coleta, mesmo antes de saber a duracao final
        if l["status"] == "ao_vivo":
            return "parcial"
        if (cob is not None and cob < LIMIAR_PARCIAL) or (acomp is not None and acomp < LIMIAR_PARCIAL):
            return "parcial"
        return "coletada"
    if l["status"] == "agendada":
        return "agendada"
    detectada, fim = _ts(l["detectada_em"]), _ts(l["fim_real"])
    sem_coleta = "perdida" if vai_coletar(l) else "nao_escolhida"
    if l["status"] == "ao_vivo":
        return sem_coleta
    if detectada and fim and detectada <= fim:
        return sem_coleta
    return None


def janela_coletada_s(l):
    """Segundos em que o coletor esteve ligado durante a transmissao."""
    a = max(filter(None, [_ts(l["coleta_inicio"]), _ts(l["inicio_real"])]), default=None)
    b = min(filter(None, [_ts(l["coleta_fim"]), _ts(l["fim_real"])]), default=None)
    if not a or not b or b <= a:
        return None
    return int((b - a).total_seconds())


def acompanhada_pct(l):
    """
    Quanto da transmissao inteira a coleta acompanhou. Diferente de
    cobertura_pct, que mede so a janela em que o coletor estava ligado: uma
    coleta perfeita de 1h48 numa live de 6h51 tem cobertura 99,7% e
    acompanhou 26% da transmissao. A tela mostra os dois.
    """
    janela, dur = janela_coletada_s(l), l["duracao_segundos"]
    if not janela or not dur:
        return None
    return round(min(100.0, 100.0 * janela / dur), 1)


def _ordem(l):
    return l["inicio_real"] or l["agendada_para"] or l["criado_em"] or ""


def lives_do_canal(con, canal_id):
    """
    Transmissoes listaveis do canal, com estado e numero sequencial
    (#1 = mais antiga). Agendadas entram no fim da sequencia.
    """
    # main.*: numa requisicao de trecho as visoes temp mudam essas tabelas
    linhas = con.execute(
        """SELECT l.*, c.modo_coleta,
                  (SELECT MAX(espectadores) FROM main.snapshot_audiencia s
                   WHERE s.video_id = l.video_id) AS pico,
                  (SELECT COUNT(*) FROM main.mensagem m
                   WHERE m.video_id = l.video_id) AS n_msgs
           FROM main.live l JOIN canal c ON c.canal_id = l.canal_id
           WHERE l.canal_id = ?""",
        (canal_id,)).fetchall()
    lista = []
    for l in linhas:
        # video que carregou mais de uma transmissao: entra cada trecho
        ts = trechos.trechos(con, l)
        partes = [trechos.linha_trecho(l, t, len(ts)) for t in ts] if ts else [dict(l)]
        for d in partes:
            if ts:
                lo = f"offset_segundos >= {d['_ini']}" if d["_trecho"] > 1 else "1"
                hi = f"offset_segundos < {d['_fim']}" if d["_fim"] is not None else "1"
                d["pico"] = con.execute(f"SELECT MAX(espectadores) FROM main.snapshot_audiencia WHERE video_id=? AND {lo} AND {hi}",
                                        (l["video_id"],)).fetchone()[0]
                d["n_msgs"] = con.execute(f"SELECT COUNT(*) FROM main.mensagem WHERE video_id=? AND {lo} AND {hi}",
                                          (l["video_id"],)).fetchone()[0]
            e = estado(d)
            if e is None:
                continue
            d["estado"] = e
            lista.append(d)
    lista.sort(key=_ordem)
    for i, d in enumerate(lista, 1):
        d["numero"] = i
    return lista


COM_COLETA = ("coletada", "parcial", "no_ar")
SEM_COLETA = ("perdida", "nao_escolhida")


def mesmo_conteudo(resumos, video_id, titulo, inicio):
    """
    Outras transmissoes do canal com o mesmo conteudo (resumos de
    resumo_live): mesmo nucleo de titulo, comecando a menos de 12 h, sem
    ser trecho do proprio video. E o link de reserva, ou o canal que marca
    um link para o pos-jogo e o transmite tambem no link do jogo.
    """
    nuc = trechos.nucleo(titulo)
    if not nuc or not inicio:
        return []
    perto = lambda x: x["inicio"] and abs((_ts(x["inicio"]) - _ts(inicio)).total_seconds()) < 12 * 3600
    link = trechos.separar(video_id)[0]
    return [{"id": x["id"], "titulo": x["titulo"], "estado": x["estado"], "inicio": x["inicio"], "fim": x["fim"],
             "trecho": x["trecho"], "link": x["link"]}
            for x in resumos if x["link"]["video_id"] != link and x["nucleo"] == nuc and perto(x)]


SOBREPOE_MIN = timedelta(minutes=15)


def mapa_links(resumos, video_id, max_links=6):
    """
    Os links (videos do YouTube) em volta de uma transmissao, para a tela
    dizer quem e quem: o link dela, com todos os trechos, e os outros links
    do canal que passaram o mesmo conteudo ou que foram coletados no mesmo
    horario. Cada link: como comecou, quando esteve no ar e os trechos.
    """
    por_link = {}
    for x in resumos:
        if x["inicio"]:
            por_link.setdefault(x["link"]["video_id"], []).append(x)
    proprio = trechos.separar(video_id)[0]
    meus = por_link.get(proprio, [])
    if not meus:
        return []
    nucs = {x["nucleo"] for x in meus if x["nucleo"]}
    agora = datetime.now(timezone.utc)
    fim_de = lambda x: _ts(x["fim"]) if x["fim"] else agora
    a, b = min(_ts(x["inicio"]) for x in meus), max(fim_de(x) for x in meus)
    perto = timedelta(hours=12)

    def entra(segs):
        for x in segs:
            if x["nucleo"] in nucs and a - perto < _ts(x["inicio"]) < b + perto:
                return True  # o mesmo conteudo em outro link
            # outra coleta no mesmo horario; encostar na virada (um link
            # acaba quando o outro abre) nao conta
            if x["estado"] in COM_COLETA and min(b, fim_de(x)) - max(a, _ts(x["inicio"])) >= SOBREPOE_MIN:
                return True
        return False

    outros = sorted((v for v, segs in por_link.items() if v != proprio and entra(segs)),
                    key=lambda v: min(_ts(x["inicio"]) for x in por_link[v]))
    out = []
    for v in [proprio] + outros[:max_links - 1]:
        segs = sorted(por_link[v], key=lambda x: (x["trecho"] or {}).get("n", 0))
        out.append({
            "video_id": v, "comecou_como": segs[0]["link"]["comecou_como"],
            "inicio": segs[0]["link"]["inicio"], "fim": segs[0]["link"]["fim"],
            "trechos": [{"id": x["id"], "n": (x["trecho"] or {}).get("n"), "titulo": x["titulo"], "nucleo": x["nucleo"],
                         "estado": x["estado"], "inicio": x["inicio"], "fim": x["fim"]} for x in segs],
        })
    return out


def outro_link(estado_live, outras):
    """
    O que a lista diz do mesmo conteudo em outro link: "sem_coleta" se esta
    foi coletada e a outra nao (o chat de la ficou de fora), "coletado" se
    esta nao foi coletada mas a outra sim (os dados estao la), senao None.
    """
    if estado_live in COM_COLETA and any(o["estado"] in SEM_COLETA for o in outras):
        return "sem_coleta"
    if estado_live in SEM_COLETA and any(o["estado"] in COM_COLETA for o in outras):
        return "coletado"
    return None


def resumo_live(d):
    """Campos que a lista do canal e a home mostram de uma transmissao."""
    duracao = d["duracao_segundos"]
    if not duracao and d["coleta_inicio"] and d["coleta_fim"]:
        a, b = _ts(d["coleta_inicio"]), _ts(d["coleta_fim"])
        if a and b:
            duracao = int((b - a).total_seconds())
    return {
        "id": d["video_id"],
        "numero": d["numero"],
        "estado": d["estado"],
        "titulo": d["titulo"],
        "agendada_para": d["agendada_para"],
        "inicio": d["inicio_real"],
        "fim": d["fim_real"],
        "coleta_inicio": d["coleta_inicio"],
        "coleta_fim": d["coleta_fim"],
        "duracao_s": duracao,
        "cobertura": d["cobertura_pct"],
        "janela_coletada_s": janela_coletada_s(d),
        "acompanhada": acompanhada_pct(d),
        "pico": d["pico"],
        "mensagens": d["n_msgs"],
        "detectada_em": d["detectada_em"],
        # o YouTube diz que esta no ar; com estado != no_ar, ninguem coleta
        "ao_vivo": d["status"] == "ao_vivo",
        # entra na coleta (escolha da live ou modo do canal) e se a escolha
        # foi feita na live (True/False) ou vem do canal (None)
        "coletar": vai_coletar(d),
        "coletar_escolha": None if d["coletar"] is None else bool(d["coletar"]),
        # trecho de um video que carregou mais de uma transmissao
        "trecho": {"n": d["_trecho"], "total": d["_total"], "video_id": d["_pai"], "ini": d["_ini"], "fim": d["_fim"]}
        if d.get("_trecho") else None,
        "nucleo": trechos.nucleo(d["titulo"]),
        # o link (video do YouTube) de onde a transmissao vem e como ele
        # comecou: e o que diz "quem e quem" quando o canal reaproveita links
        "link": {"video_id": d.get("_pai") or d["video_id"],
                 "comecou_como": d.get("_link_titulo", d["titulo"]),
                 "inicio": d.get("_link_inicio", d["inicio_real"]),
                 "fim": d.get("_link_fim", d["fim_real"])},
        # colada pelo link, de canal que nao e vigiado
        "avulsa": bool(d["avulsa"]),
    }


def serie(con, video_id):
    """
    Janelas de 60 s desde o inicio da live: espectadores (media das
    leituras da janela), mensagens por minuto e participacao (autores
    distintos na janela / espectadores). Janela sem leitura de audiencia
    devolve null: nunca interpolar.
    """
    snaps = con.execute(
        """SELECT offset_segundos o, espectadores e FROM snapshot_audiencia
           WHERE video_id=? AND offset_segundos >= 0 AND espectadores IS NOT NULL""",
        (video_id,)).fetchall()
    msgs = con.execute(
        """SELECT offset_segundos o, autor_pid a FROM mensagem
           WHERE video_id=? AND offset_segundos >= 0""",
        (video_id,)).fetchall()
    if not snaps:
        return None
    # A serie comeca no primeiro dado coletado, nao no inicio da live: uma
    # coleta que entrou 2 h depois nao vira 2 h de janelas vazias. O tempo
    # continua absoluto (segundos desde o inicio da live), entao link com
    # timestamp e momento detectado batem com o video.
    primeiro = min([s["o"] for s in snaps] + [m["o"] for m in msgs])
    b0 = primeiro // JANELA
    n = max(s["o"] for s in snaps) // JANELA - b0 + 1

    soma, cont = [0] * n, [0] * n
    for s in snaps:
        b = s["o"] // JANELA - b0
        soma[b] += s["e"]
        cont[b] += 1
    mpm = [0] * n
    autores = [set() for _ in range(n)]
    for m in msgs:
        b = m["o"] // JANELA - b0
        if b < n:
            mpm[b] += 1
            autores[b].add(m["a"])

    esp = [round(soma[i] / cont[i]) if cont[i] else None for i in range(n)]
    part = [round(len(autores[i]) / esp[i], 6) if esp[i] else None for i in range(n)]

    # unidades de cota gastas em cada janela, pelo horario de cada chamada.
    # E o que permite a tela ao vivo (e o replay) mostrar o custo acumulado
    # real em vez de uma regra de tres.
    cota = [0] * n
    l = con.execute("SELECT inicio_real FROM live WHERE video_id=?", (video_id,)).fetchone()
    t0 = _ts(l["inicio_real"]) if l else None
    if t0:
        for c in con.execute("SELECT chamado_em, custo_unidades FROM coleta_log WHERE video_id=?", (video_id,)):
            tc = _ts(c["chamado_em"])
            if not tc:
                continue
            b = int((tc - t0).total_seconds()) // JANELA - b0
            cota[min(max(b, 0), n - 1)] += c["custo_unidades"]
    return {"t": [(b0 + i) * JANELA for i in range(n)], "esp": esp, "mpm": mpm, "part": part, "cota": cota}


def agora_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
