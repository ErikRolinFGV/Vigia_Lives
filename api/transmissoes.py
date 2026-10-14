"""
Leituras de transmissao que mais de um router usa: estado, numeracao e a
serie minuto a minuto.

O estado nao e uma coluna: e derivado do que o banco sabe. Assim uma coleta
que caiu sem atualizar `live.status` nao aparece como "no ar" para sempre.
"""
from datetime import datetime, timezone

from collector import yt

# Abaixo disso a coleta e PARCIAL: ficou um buraco que o relatorio precisa
# declarar. Acima, COLETADA.
LIMIAR_PARCIAL = 90.0
JANELA = 60


def _ts(s):
    return yt.parse_ts(s) if s else None


def estado(l):
    """
    no_ar      coletor rodando agora
    coletada   coleta feita, cobertura >= LIMIAR_PARCIAL
    parcial    coleta feita, cobertura abaixo do limiar
    agendada   anunciada, ainda nao comecou
    perdida    a plataforma sabia da live e ninguem coletou
    None       live que so foi descoberta depois de acabar: nao vigiada,
               fica fora da lista do canal (aparece so na comparacao)
    """
    if l["coleta_inicio"] and not l["coleta_fim"]:
        return "no_ar"
    if l["coleta_inicio"]:
        cob = l["cobertura_pct"]
        return "parcial" if cob is not None and cob < LIMIAR_PARCIAL else "coletada"
    if l["status"] == "agendada":
        return "agendada"
    detectada, fim = _ts(l["detectada_em"]), _ts(l["fim_real"])
    if l["status"] == "ao_vivo":
        return "perdida"
    if detectada and fim and detectada <= fim:
        return "perdida"
    return None


def _ordem(l):
    return l["inicio_real"] or l["agendada_para"] or l["criado_em"] or ""


def lives_do_canal(con, canal_id):
    """
    Transmissoes listaveis do canal, com estado e numero sequencial
    (#1 = mais antiga). Agendadas entram no fim da sequencia.
    """
    linhas = con.execute(
        """SELECT l.*,
                  (SELECT MAX(espectadores) FROM snapshot_audiencia s
                   WHERE s.video_id = l.video_id) AS pico,
                  (SELECT COUNT(*) FROM mensagem m
                   WHERE m.video_id = l.video_id) AS n_msgs
           FROM live l WHERE l.canal_id = ?""",
        (canal_id,)).fetchall()
    lista = []
    for l in linhas:
        e = estado(l)
        if e is None:
            continue
        d = dict(l)
        d["estado"] = e
        lista.append(d)
    lista.sort(key=_ordem)
    for i, d in enumerate(lista, 1):
        d["numero"] = i
    return lista


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
        "pico": d["pico"],
        "mensagens": d["n_msgs"],
        "detectada_em": d["detectada_em"],
        # o YouTube diz que esta no ar; com estado != no_ar, ninguem coleta
        "ao_vivo": d["status"] == "ao_vivo",
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
    return {"t": [(b0 + i) * JANELA for i in range(n)], "esp": esp, "mpm": mpm, "part": part}


def agora_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
