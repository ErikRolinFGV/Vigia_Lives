"""Plano, saude e cota: o lado operacional da plataforma."""
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from collector import yt

from ..deps import LIMITE_SLOTS, conexao

router = APIRouter(tags=["operacao"])


@router.get("/plano")
def plano(con: sqlite3.Connection = Depends(conexao)):
    em_uso = con.execute(
        "SELECT COUNT(*) FROM canal WHERE vigiado = 1 AND removido_em IS NULL"
    ).fetchone()[0]
    return {"nome": "Pesquisa", "limite_slots": LIMITE_SLOTS, "em_uso": em_uso}


# Sem batimento ha mais que isso, o vigia e considerado parado.
BATIMENTO_MAX = timedelta(minutes=5)


@router.get("/operacao/saude")
def saude(con: sqlite3.Connection = Depends(conexao)):
    ultima = con.execute("SELECT MAX(chamado_em) FROM coleta_log").fetchone()[0]
    b = con.execute("SELECT iniciado_em, ultimo_ciclo FROM vigia_batimento WHERE id = 1").fetchone()
    de_pe = False
    if b:
        t = yt.parse_ts(b["ultimo_ciclo"])
        de_pe = bool(t and datetime.now(timezone.utc) - t <= BATIMENTO_MAX)
    ativas = con.execute(
        "SELECT COUNT(*) FROM live WHERE coleta_inicio IS NOT NULL AND coleta_fim IS NULL"
    ).fetchone()[0]
    return {
        "api": "ok",
        "vigia": {
            "de_pe": de_pe,
            "desde": b["iniciado_em"] if b and de_pe else None,
            "ultimo_ciclo": b["ultimo_ciclo"] if b else None,
        },
        "coletas_ativas": ativas,
        "ultima_chamada_youtube": ultima,
    }
