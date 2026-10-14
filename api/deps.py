"""Dependencias compartilhadas pelos routers."""
from collector import db

# Plano de pesquisa: quantos canais podem ser vigiados ao mesmo tempo.
LIMITE_SLOTS = 10


def conexao():
    """Uma conexao SQLite por request, fechada no fim."""
    con = db.conectar(multithread=True)
    try:
        yield con
    finally:
        con.close()
