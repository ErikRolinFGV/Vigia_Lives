"""Uma transmissao: cabecalho, serie, previsao de custo."""
import sqlite3
import statistics
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from collector import yt

from ..deps import conexao
from ..transmissoes import lives_do_canal, resumo_live, serie

router = APIRouter(tags=["lives"])

COTA_DIA = 10000
# Usada so quando nao ha coleta medida para estimar custo por hora.
UNIDADES_HORA_PADRAO = 609
# Sem historico do canal, a duracao estimada de uma live agendada.
DURACAO_PADRAO_S = 2 * 3600


def _live_ou_404(con, video_id):
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
        "url": f"https://youtube.com/watch?v={video_id}",
    }


@router.get("/lives/{video_id}/serie")
def serie_live(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    _live_ou_404(con, video_id)
    s = serie(con, video_id)
    if not s:
        raise HTTPException(404, "esta transmissão não tem série minuto a minuto")
    return s


def unidades_por_hora(con):
    """
    Custo medido, nao suposto: unidades gastas nas coletas feitas, dividido
    pelo tempo em que o coletor esteve ligado.
    """
    rows = con.execute(
        """SELECT l.coleta_inicio, l.coleta_fim,
                  (SELECT SUM(custo_unidades) FROM coleta_log g WHERE g.video_id = l.video_id) u
           FROM live l WHERE l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NOT NULL""").fetchall()
    horas = unidades = 0.0
    for r in rows:
        a, b = yt.parse_ts(r["coleta_inicio"]), yt.parse_ts(r["coleta_fim"])
        if a and b and r["u"]:
            horas += (b - a).total_seconds() / 3600
            unidades += r["u"]
    if horas < 0.25:
        return UNIDADES_HORA_PADRAO, False
    return round(unidades / horas), True


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


@router.get("/lives/{video_id}/previsao")
def previsao(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    """Custo estimado de uma live agendada e a cota ja reservada no mesmo dia."""
    l = _live_ou_404(con, video_id)
    un_h, medido = unidades_por_hora(con)

    def estimar(canal_id):
        dur, do_canal = _duracao_estimada(con, canal_id)
        return dur, do_canal, round(un_h * dur / 3600)

    dur, dur_do_canal, custo = estimar(l["canal_id"])
    dia = _dia_cota(l["agendada_para"])
    outras = []
    if dia:
        rows = con.execute(
            """SELECT l.video_id, l.titulo, l.agendada_para, l.canal_id, c.nome canal
               FROM live l JOIN canal c ON c.canal_id = l.canal_id
               WHERE l.status = 'agendada' AND l.video_id != ? AND c.vigiado = 1
                 AND c.removido_em IS NULL AND l.agendada_para IS NOT NULL""",
            (video_id,)).fetchall()
        for o in rows:
            if _dia_cota(o["agendada_para"]) == dia:
                outras.append({"id": o["video_id"], "titulo": o["titulo"], "canal": o["canal"],
                               "agendada_para": o["agendada_para"], "custo": estimar(o["canal_id"])[2]})
    outras.sort(key=lambda o: o["agendada_para"])
    reservado = custo + sum(o["custo"] for o in outras)
    return {
        "unidades_hora": un_h, "unidades_hora_medida": medido,
        "duracao_estimada_s": dur, "duracao_do_canal": dur_do_canal,
        "custo": custo, "cota_dia": COTA_DIA, "dia_cota": dia,
        "outras": outras, "reservado": reservado,
    }
