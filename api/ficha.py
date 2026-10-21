"""
Ficha da transmissao: os mesmos numeros, do mesmo jeito, para toda live
coletada. E a base da comparacao entre lives (e, depois, do dossie por
modelo e do chatbot): quem compara le daqui, nunca recalcula por conta.

Regras de comparacao:
  - total (pico, mensagens, apoio...) de coleta PARCIAL nao entra no
    ranking: mede a janela coletada, nao a live. A taxa (por minuto, por
    espectador) entra;
  - numero do video inteiro (views, comentarios) nao entra no ranking de um
    trecho: o YouTube nao separa views por trecho;
  - coleta com menos de JANELA_MINIMA nao entra em ranking nenhum: uma
    taxa medida em 21 s (CNN Madrugada, 140 msg/min) e ruido;
  - com poucas lives, a comparacao e posicao e faixa (menor, mediana,
    maior), nao media com pretensao estatistica.

Nenhum texto de chat e nenhum autor entra na ficha: so agregados.
"""
import json
import statistics

from . import dossie, secoes, trechos
from .transmissoes import LIMIAR_PARCIAL, lives_do_canal, serie as serie_live

VERSAO = "ficha-v1"
JANELA_MINIMA = 15 * 60

# chave, grupo, rotulo, formato, escopo, descricao
# escopo: total (fora do ranking em coleta parcial), taxa, video (fora do
# ranking em trecho), contexto (mostrado, nao ranqueado)
METRICAS = [
    ("pico", "audiencia", "Pico de espectadores", "int", "total", "Maior leitura de espectadores simultâneos na janela coletada."),
    ("media", "audiencia", "Média de espectadores", "int", "taxa", "Média das leituras de espectadores, minuto a minuto."),
    ("crescimento", "audiencia", "Crescimento da audiência", "x", "taxa", "Média dos últimos minutos coletados ÷ média dos primeiros."),
    ("mensagens", "conversa", "Mensagens", "int", "total", "Mensagens escritas durante a transmissão, sem eventos de moderação."),
    ("pessoas", "conversa", "Pessoas no chat", "int", "total", "Autores distintos que escreveram ao menos uma vez."),
    ("mpm", "conversa", "Mensagens por minuto", "dec1", "taxa", "Mensagens ÷ minutos em que o coletor esteve ligado."),
    ("participacao", "conversa", "Participação", "pct2", "taxa", "Pessoas que escreveram ÷ pico de espectadores."),
    ("msgs_pessoa", "conversa", "Mensagens por pessoa", "dec1", "taxa", "Mensagens ÷ pessoas que escreveram."),
    ("concentracao", "conversa", "Chat nos picos de reação", "pct", "taxa", "Fatia das mensagens nas janelas em torno dos picos de reação detectados."),
    ("momentos", "conversa", "Picos de reação", "int", "total", "Janelas de 60 s em que o chat passou do limiar de detecção."),
    ("apagadas", "conversa", "Mensagens apagadas", "pct1", "taxa", "Mensagens apagadas pela moderação ÷ mensagens."),
    ("apoio_brl", "apoio", "Apoio pago", "brl", "total", "Super Chat e Super Sticker, convertidos para reais."),
    ("apoio_mil", "apoio", "Apoio por mil espectadores", "brl", "taxa", "Apoio pago ÷ (pico de espectadores ÷ 1.000)."),
    ("novos_membros", "apoio", "Novos membros", "int", "total", "Pessoas que viraram membro do canal durante a live."),
    ("enquetes", "comunidade", "Enquetes", "int", "total", "Enquetes abertas no chat durante a live."),
    ("views_24h", "depois", "Views em +24 h", "int", "video", "Visualizações do vídeo lidas 24 h depois do fim."),
    ("comentarios_24h", "depois", "Comentários em +24 h", "int", "video", "Comentários do vídeo lidos 24 h depois do fim."),
    ("duracao", "coleta", "Duração no ar", "dur", "contexto", "Do início ao fim da transmissão."),
    ("acompanhada", "coleta", "Transmissão acompanhada", "pct1", "contexto", "Quanto da transmissão a coleta acompanhou."),
]
GRUPOS = {"audiencia": "Audiência", "conversa": "Conversa", "apoio": "Apoio", "comunidade": "Comunidade",
          "depois": "Depois da live", "coleta": "Coleta"}

_cache: dict[str, tuple[str, dict]] = {}


def definicoes():
    return [{"chave": k, "grupo": g, "rotulo": r, "formato": f, "escopo": e, "descricao": d}
            for k, g, r, f, e, d in METRICAS]


def _assinatura(con, video_id):
    """Muda quando algo que a ficha le muda: fim da coleta, leituras de depois, corte."""
    v = trechos.separar(video_id)[0]
    r = con.execute(
        """SELECT l.coleta_fim, l.status, l.duracao_segundos,
                  (SELECT COUNT(*) || MAX(coletado_em) FROM main.video_snapshot s WHERE s.video_id = l.video_id AND s.fase != 'durante'),
                  (SELECT atualizado_em FROM divisao d WHERE d.video_id = l.video_id),
                  (SELECT COUNT(*) FROM main.enquete e WHERE e.video_id = l.video_id),
                  (SELECT COUNT(*) FROM main.momento m WHERE m.video_id = l.video_id),
                  (SELECT COUNT(*) FROM janela_agregada j WHERE j.video_id = l.video_id)
           FROM main.live l WHERE l.video_id = ?""", (v,)).fetchone()
    return VERSAO + "|" + "|".join(str(x) for x in (r or []))


def _categoria(con, video_id):
    r = con.execute("""SELECT bruto FROM video_snapshot WHERE video_id=? AND bruto IS NOT NULL
                       ORDER BY coletado_em DESC LIMIT 1""", (video_id,)).fetchone()
    try:
        cid = (json.loads(r["bruto"]).get("snippet") or {}).get("categoryId") if r else None
    except ValueError:
        cid = None
    return cid, secoes.CATEGORIAS.get(cid, cid)


def _pos(con, video_id, rotulo):
    return con.execute("SELECT views, comentarios FROM video_snapshot WHERE video_id=? AND fase='pos' AND rotulo=?",
                       (video_id, rotulo)).fetchone()


def calcular(con, video_id, resumo):
    """A ficha de uma live coletada. `resumo` e a linha dela em lives_do_canal."""
    trechos.preparar(con, video_id)
    m = dossie.metricas(con, video_id)
    s = m["serie"]
    janela_min = (m["janela_s"] or 0) / 60
    esp = [v for v in (s["esp"] if s else []) if v is not None]
    a = m["apoio"]
    pos24 = _pos(con, video_id, "+24 h")
    mod = secoes.moderacao(con, video_id, "publica")
    cat_id, cat = _categoria(con, video_id)
    pico = m["pico"]
    # a deteccao de momentos roda quando a coleta fecha; sem ela (ou com
    # serie curta demais para a media movel), "0 picos" seria mentira
    detectou = s and con.execute("SELECT 1 FROM janela_agregada WHERE video_id=? LIMIT 1",
                                 (trechos.separar(video_id)[0],)).fetchone()
    v = {
        "pico": pico,
        "media": round(statistics.fmean(esp)) if esp else None,
        "crescimento": round(m["esp_fim"] / m["esp_ini"], 2) if s and m.get("esp_ini") and m.get("esp_fim") else None,
        "mensagens": m["mensagens"],
        "pessoas": m["pessoas"],
        "mpm": round(m["mensagens"] / janela_min, 1) if janela_min else None,
        "participacao": round(100 * m["pessoas"] / pico, 2) if pico else None,
        "msgs_pessoa": round(m["mensagens"] / m["pessoas"], 1) if m["pessoas"] else None,
        "concentracao": (round(m["pct_em_momentos"], 1) if m.get("n_momentos_chat") else 0.0) if detectou else None,
        "momentos": m.get("n_momentos_chat") if detectou else None,
        "apagadas": mod.get("pct_apagadas"),
        "apoio_brl": round(a["total_brl"], 2),
        "apoio_mil": round(a["total_brl"] / (pico / 1000), 2) if pico else None,
        "novos_membros": a["novos_membros"],
        "enquetes": sum(1 for e in secoes.comunidade(con, video_id, "publica")["enquetes"]),
        "views_24h": pos24["views"] if pos24 else None,
        "comentarios_24h": pos24["comentarios"] if pos24 else None,
        "duracao": m["duracao_s"],
        "acompanhada": m["acompanhada"],
    }
    parcial = resumo["estado"] == "parcial" or (m["acompanhada"] is not None and m["acompanhada"] < LIMIAR_PARCIAL)
    return {
        "versao": VERSAO,
        "id": video_id,
        "titulo": resumo["titulo"],
        "nucleo": resumo["nucleo"],
        "canal_id": resumo["canal_id"],
        "canal": resumo["canal"],
        "inicio": resumo["inicio"],
        "estado": resumo["estado"],
        "categoria_id": cat_id,
        "categoria": cat,
        "parcial": parcial,
        "curta": (m["janela_s"] or 0) < JANELA_MINIMA,
        "trecho": resumo["trecho"] is not None,
        # trecho: de que link veio (como o link comecou), para a tela dizer quem e quem
        "trecho_n": resumo["trecho"],
        "link": {"comecou_como": resumo["link_titulo"], "inicio": resumo["link_inicio"]} if resumo["trecho"] else None,
        "valores": v,
    }


def _resumos(con):
    """Toda live coletada (coletada ou parcial) de qualquer canal, trechos separados."""
    canais = con.execute(
        """SELECT DISTINCT c.canal_id, c.nome FROM canal c JOIN main.live l ON l.canal_id = c.canal_id
           WHERE l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NOT NULL""").fetchall()
    out = []
    for c in canais:
        for d in lives_do_canal(con, c["canal_id"]):
            if d["estado"] in ("coletada", "parcial"):
                out.append({"id": d["video_id"], "titulo": d["titulo"], "nucleo": trechos.nucleo(d["titulo"]),
                            "canal_id": c["canal_id"], "canal": c["nome"], "inicio": d["inicio_real"],
                            "estado": d["estado"], "trecho": d.get("_trecho"),
                            "link_titulo": d.get("_link_titulo"), "link_inicio": d.get("_link_inicio")})
    return out


def todas(con):
    """Fichas de todas as lives coletadas, com cache por assinatura."""
    fichas = []
    for r in _resumos(con):
        ass = _assinatura(con, r["id"])
        hit = _cache.get(r["id"])
        if not hit or hit[0] != ass:
            hit = (ass, calcular(con, r["id"], r))
            _cache[r["id"]] = hit
        fichas.append(hit[1])
    fichas.sort(key=lambda f: f["inicio"] or "")
    return fichas


def comparavel(f, chave):
    escopo = next(e for k, _, _, _, e, _ in METRICAS if k == chave)
    if escopo == "contexto" or f["curta"]:
        return False
    if escopo == "total" and f["parcial"]:
        return False
    if escopo == "video" and f["trecho"]:
        return False
    return f["valores"].get(chave) is not None


def posicoes(fichas, alvo):
    """
    Onde a live fica entre as outras, em tres recortes: o mesmo canal, a
    mesma categoria do YouTube e todas as coletas. Posicao 1 = maior valor.
    """
    recortes = {
        "canal": [f for f in fichas if f["canal_id"] == alvo["canal_id"]],
        "categoria": [f for f in fichas if alvo["categoria_id"] and f["categoria_id"] == alvo["categoria_id"]],
        "todas": fichas,
    }
    out = {}
    for nome, grupo in recortes.items():
        por = {}
        for k, *_ in METRICAS:
            vals = sorted(((f["valores"][k], f["id"]) for f in grupo if comparavel(f, k)), reverse=True)
            nomes = {f["id"]: f["nucleo"] for f in grupo}
            if not vals:
                continue
            nums = [x for x, _ in vals]
            v = next((x for x, i in vals if i == alvo["id"]), None)
            por[k] = {
                # empate divide a posicao: 1 + quantas ficam estritamente acima
                "posicao": 1 + sum(1 for x in nums if x > v) if v is not None else None,
                "empatadas": sum(1 for x in nums if x == v) if v is not None else 0,
                "n": len(vals),
                "min": nums[-1], "mediana": statistics.median(nums), "max": nums[0],
                # todas as do recorte, da maior para a menor (mini grafico de barras)
                "valores": [{"id": i, "nome": nomes.get(i), "v": x} for x, i in vals],
            }
        out[nome] = {"n": len(grupo), "metricas": por}
    return out


def detalhe_comparacao(con, video_id):
    """
    O que a comparacao lado a lado desenha de cada live, alem da ficha:
    curvas minuto a minuto, picos de reacao, quem escreve quanto, enquetes e
    views depois da live. So agregados (versao publica das secoes).
    """
    trechos.preparar(con, video_id)
    s = serie_live(con, video_id)
    pe = secoes.pessoas(con, video_id, "publica")
    dep = secoes.depois(con, video_id, "publica")
    enq = secoes.comunidade(con, video_id, "publica")["enquetes"]
    return {
        "serie": {"t": s["t"], "esp": s["esp"], "mpm": s["mpm"], "part": s["part"]} if s else None,
        "momentos": [dict(r) for r in con.execute(
            """SELECT offset_segundos t, tipo, magnitude FROM momento
               WHERE video_id=? AND offset_segundos >= 0 ORDER BY offset_segundos""", (video_id,))],
        "pessoas": {"faixas": pe["faixas"], "top10pct": pe["top10pct"], "uma_vez": pe["uma_vez"],
                    "pessoas": pe["pessoas"]} if pe.get("disponivel") else None,
        "depois": {"pontos": [{"rotulo": p["rotulo"], "views": p["views"]} for p in dep["pontos"]],
                   "video_inteiro": dep["video_inteiro"]},
        "enquetes": [{"t": e["t"], "total": e["total"]} for e in enq],
    }
