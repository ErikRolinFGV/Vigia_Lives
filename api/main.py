"""
API do Vigia.

    lives-api                 # http://127.0.0.1:8000, docs em /api/docs
    lives-api --porta 8080
    lives-api --host 0.0.0.0  # aceita conexao de outras maquinas

No servidor, a API fica em 127.0.0.1 atras do nginx (deploy/README.md);
VIGIA_HOST e VIGIA_PORTA no .env valem como padrao.

Toda rota /api pede login (api/acessos.py), menos o proprio login e o link
publico de relatorio (/api/r/...). O que cada conta ve e muda esta em
api/escopo.py: o visitante tem um espaco proprio e o que o admin compartilhar.

Em desenvolvimento o front roda no Vite (web/, porta 5173) com proxy para
/api. Se web/dist existir, esta API tambem serve o front construido.
"""
import argparse
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from collector import config, db, registro

from . import acessos, escopo
from .routers import acesso, canais, comparar, lives, operacao, relatorio

app = FastAPI(title="Vigia", docs_url="/api/docs", openapi_url="/api/openapi.json")
log = registro.Registro("api")


@app.exception_handler(Exception)
async def erro_inesperado(req: Request, exc: Exception):
    # so o que nao foi previsto (HTTPException segue o caminho normal):
    # vai para a pagina Registro com o traceback
    log.erro(f"{req.method} {req.url.path} falhou", exc)
    return JSONResponse({"detail": "Erro inesperado no servidor. Ficou registrado para o administrador."}, status_code=500)

# sem login: entrar/sair e o link publico de relatorio (so agregados)
ABERTAS = ("/api/auth/", "/api/r/")


@app.middleware("http")
async def exige_login(req: Request, seguir):
    p = req.url.path
    if not p.startswith("/api/") or p.startswith(ABERTAS):
        return await seguir(req)
    con = db.conectar(multithread=True)
    try:
        c = acessos.valida(con, req.cookies.get(acessos.COOKIE))
        negado = c and escopo.autorizar(con, c, req.method, p, req.query_params)
    finally:
        con.close()
    if not c:
        return JSONResponse({"detail": "Entre com sua conta."}, status_code=401)
    if negado:
        return JSONResponse({"detail": negado[1]}, status_code=negado[0])
    req.state.conta = c
    return await seguir(req)


app.include_router(acesso.router, prefix="/api")
app.include_router(operacao.router, prefix="/api")
app.include_router(canais.router, prefix="/api")
app.include_router(lives.router, prefix="/api")
app.include_router(relatorio.router, prefix="/api")
app.include_router(comparar.router, prefix="/api")

DIST = Path(config.RAIZ) / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def spa(caminho: str):
        # rotas do front (/yt/canais/...) caem no index.html; o router do
        # React resolve o resto
        alvo = (DIST / caminho).resolve()
        # so arquivos de dentro do web/dist: "/../../.env" nao sai da pasta
        if caminho and alvo.is_file() and alvo.is_relative_to(DIST.resolve()):
            return FileResponse(alvo)
        return FileResponse(DIST / "index.html")


def main():
    import uvicorn
    p = argparse.ArgumentParser(description="API do Vigia")
    p.add_argument("--host", default=os.environ.get("VIGIA_HOST", "127.0.0.1"))
    p.add_argument("--porta", type=int, default=int(os.environ.get("VIGIA_PORTA", "8000")))
    p.add_argument("--reload", action="store_true", help="recarrega ao editar o codigo")
    a = p.parse_args()
    uvicorn.run("api.main:app", host=a.host, port=a.porta, reload=a.reload)


if __name__ == "__main__":
    main()
