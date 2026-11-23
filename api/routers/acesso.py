"""Entrar (senha ou Google), sair e quem sou eu. A trava das outras rotas fica em api/main.py."""
import hmac
import os
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from collector import registro

from .. import acessos, google
from ..deps import conexao

router = APIRouter(tags=["acesso"])
log = registro.Registro("api")


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


def _sessao(resp: Response, req: Request, c):
    valor, segundos = acessos.emitir(c)
    resp.set_cookie(acessos.COOKIE, valor, max_age=segundos, httponly=True, samesite="lax", secure=_https(req), path="/")


@router.get("/auth/config")
def config_entrada():
    """O que a tela de entrada oferece."""
    return {"google": google.configurado()}


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
    _sessao(resp, req, c)
    return acessos.publica(c)


# ---------------------------------------------------------------- Google

def _base(req: Request):
    # o endereco de volta precisa ser identico ao cadastrado no Google Cloud
    pub = os.environ.get("URL_PUBLICA", "").strip()
    if pub:
        return pub
    host = req.headers.get("x-forwarded-host") or req.headers.get("host") or req.url.netloc
    return f"{'https' if _https(req) else req.url.scheme}://{host}"


def _voltar(destino, req: Request):
    r = RedirectResponse(destino, status_code=303)
    r.delete_cookie(google.COOKIE, path=google.CAMINHO_COOKIE)
    return r


@router.get("/auth/google")
def google_ir(req: Request):
    if not google.configurado():
        return _voltar("/login?erro=google-desligado", req)
    url, cookie = google.iniciar(google.retorno(_base(req)), acessos._segredo())
    r = RedirectResponse(url, status_code=303)
    r.set_cookie(google.COOKIE, cookie, max_age=google.VALIDADE, httponly=True, samesite="lax",
                 secure=_https(req), path=google.CAMINHO_COOKIE)
    return r


@router.get("/auth/google/retorno")
def google_volta(req: Request, code: str | None = None, state: str | None = None, error: str | None = None,
                 con: sqlite3.Connection = Depends(conexao)):
    if error:
        # a pessoa fechou ou negou a tela do Google: so volta para a entrada
        return _voltar("/login", req)
    lido = google.ler_cookie(req.cookies.get(google.COOKIE), acessos._segredo())
    if not lido or not code or not state or not hmac.compare_digest(state, lido[0]):
        return _voltar("/login?erro=google-falhou", req)
    try:
        dados = google.trocar_codigo(code, lido[2], google.retorno(_base(req)))
        email, sub = google.conferir(dados, lido[1])
    except ValueError as e:
        log.aviso(f"entrada com o Google falhou: {e}")
        return _voltar("/login?erro=google-falhou", req)
    c = acessos.pelo_google(con, email, sub)
    if not c:
        return _voltar("/login?erro=sem-acesso", req)
    if acessos.situacao(c) != "ativo":
        return _voltar("/login?erro=expirado", req)
    r = _voltar("/plataformas", req)
    _sessao(r, req, c)
    return r


@router.post("/auth/sair", status_code=204)
def sair(resp: Response):
    resp.delete_cookie(acessos.COOKIE, path="/")


@router.get("/auth/eu")
def eu(req: Request, con: sqlite3.Connection = Depends(conexao)):
    c = acessos.valida(con, req.cookies.get(acessos.COOKIE))
    if not c:
        raise HTTPException(401, "Entre com sua conta.")
    return acessos.publica(c)
