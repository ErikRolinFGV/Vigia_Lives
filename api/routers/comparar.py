"""Ficha de cada live coletada e comparacao entre lives."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from .. import ficha
from ..deps import conexao, escopo
from ..escopo import Escopo

router = APIRouter(tags=["comparar"])

MAX_COMPARAR = 4


def _visiveis(con, e):
    """As fichas que a conta ve: ranking e comparacao so entre elas."""
    return [f for f in ficha.todas(con) if e.live(f["id"], f["canal_id"])]


def _base():
    return {"metricas": ficha.definicoes(), "grupos": ficha.GRUPOS, "versao": ficha.VERSAO}


@router.get("/fichas")
def fichas(con: sqlite3.Connection = Depends(conexao), e: Escopo = Depends(escopo)):
    """Toda live coletada, com a ficha: e a lista de onde se escolhe o que comparar."""
    return {**_base(), "fichas": _visiveis(con, e)}


@router.get("/lives/{video_id}/ficha")
def ficha_da_live(video_id: str, con: sqlite3.Connection = Depends(conexao), e: Escopo = Depends(escopo)):
    todas = _visiveis(con, e)
    alvo = next((f for f in todas if f["id"] == video_id), None)
    if not alvo:
        raise HTTPException(404, "Só transmissões com coleta encerrada têm ficha.")
    return {**_base(), "ficha": alvo, "posicoes": ficha.posicoes(todas, alvo)}


@router.get("/comparar")
def comparar(ids: str, con: sqlite3.Connection = Depends(conexao), e: Escopo = Depends(escopo)):
    """Fichas e curvas de 2 a 4 lives, na ordem pedida."""
    pedidos = list(dict.fromkeys(i for i in ids.split(",") if i))[:MAX_COMPARAR]
    todas = {f["id"]: f for f in _visiveis(con, e)}
    faltam = [i for i in pedidos if i not in todas]
    if faltam:
        raise HTTPException(404, f"Sem ficha (coleta não encerrada ou id errado): {', '.join(faltam)}")
    return {
        **_base(),
        "fichas": [todas[i] for i in pedidos],
        "detalhes": {i: ficha.detalhe_comparacao(con, i) for i in pedidos},
    }
