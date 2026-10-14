"""Plano, saude e cota: o lado operacional da plataforma."""
import sqlite3

from fastapi import APIRouter, Depends

from ..deps import LIMITE_SLOTS, conexao

router = APIRouter(tags=["operacao"])


@router.get("/plano")
def plano(con: sqlite3.Connection = Depends(conexao)):
    em_uso = con.execute(
        "SELECT COUNT(*) FROM canal WHERE vigiado = 1 AND removido_em IS NULL"
    ).fetchone()[0]
    return {"nome": "Pesquisa", "limite_slots": LIMITE_SLOTS, "em_uso": em_uso}


@router.get("/operacao/saude")
def saude(con: sqlite3.Connection = Depends(conexao)):
    ultima = con.execute("SELECT MAX(chamado_em) FROM coleta_log").fetchone()[0]
    return {"api": "ok", "ultima_chamada_youtube": ultima}
