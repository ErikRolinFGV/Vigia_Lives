"""Entrar, sair e quem sou eu. A trava das outras rotas fica em api/main.py."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from .. import acessos
from ..deps import conexao

router = APIRouter(tags=["acesso"])


class Credenciais(BaseModel):
    usuario: str
    senha: str


def ip_de(req: Request):
    # atras do nginx (deploy/README.md) o IP de verdade vem no cabecalho
    xff = req.headers.get("x-forwarded-for")
    if xff and req.client and req.client.host in ("127.0.0.1", "::1"):
        return xff.split(",")[0].strip()
    return req.client.host if req.client else "?"


def _https(req: Request):
    return req.url.scheme == "https" or req.headers.get("x-forwarded-proto") == "https"


@router.post("/auth/entrar")
def entrar(corpo: Credenciais, req: Request, resp: Response, con: sqlite3.Connection = Depends(conexao)):
    ip = ip_de(req)
    if acessos.travado(ip):
        raise HTTPException(429, "Muitas tentativas erradas. Espere um minuto e tente de novo.")
    c = acessos.conta(con, corpo.usuario)
    if not c or not acessos.confere_senha(corpo.senha, c["senha_hash"]):
        acessos.registrar_falha(ip)
        raise HTTPException(401, "Usuário ou senha incorretos.")
    acessos.limpar_falhas(ip)
    # so com a senha certa a tela diz que o acesso acabou
    if acessos.situacao(c) != "ativo":
        raise HTTPException(403, "Este acesso não vale mais. Peça um novo a quem enviou o link.")
    valor, segundos = acessos.emitir(c)
    resp.set_cookie(acessos.COOKIE, valor, max_age=segundos, httponly=True, samesite="lax", secure=_https(req), path="/")
    return acessos.publica(c)


@router.post("/auth/sair", status_code=204)
def sair(resp: Response):
    resp.delete_cookie(acessos.COOKIE, path="/")


@router.get("/auth/eu")
def eu(req: Request, con: sqlite3.Connection = Depends(conexao)):
    c = acessos.valida(con, req.cookies.get(acessos.COOKIE))
    if not c:
        raise HTTPException(401, "Entre com sua conta.")
    return acessos.publica(c)
