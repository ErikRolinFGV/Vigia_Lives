"""Dependencias compartilhadas pelos routers."""
import sqlite3

from fastapi import Depends, Request

from collector import db

from .escopo import Escopo

# Plano de pesquisa: quantos canais podem ser vigiados ao mesmo tempo (todas
# as contas somadas; cada visitante tem ainda o proprio limite, em escopo.py).
LIMITE_SLOTS = 10


def conexao():
    """Uma conexao SQLite por request, fechada no fim."""
    con = db.conectar(multithread=True)
    try:
        yield con
    finally:
        con.close()


def escopo(req: Request, con: sqlite3.Connection = Depends(conexao)) -> Escopo:
    """O que a conta da requisicao enxerga (o middleware de login ja a pos em req.state)."""
    return Escopo(con, req.state.conta)
