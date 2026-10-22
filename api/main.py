"""
API do Vigia.

    lives-api                 # http://127.0.0.1:8000, docs em /api/docs
    lives-api --porta 8080
    lives-api --host 0.0.0.0  # aceita conexao de outras maquinas (cuidado:
                              # o login ainda e de demonstracao)

No servidor, a API fica em 127.0.0.1 atras do nginx (deploy/README.md);
VIGIA_HOST e VIGIA_PORTA no .env valem como padrao.

Em desenvolvimento o front roda no Vite (web/, porta 5173) com proxy para
/api. Se web/dist existir, esta API tambem serve o front construido.
"""
import argparse
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from collector import config

from .routers import canais, comparar, lives, operacao, relatorio

app = FastAPI(title="Vigia", docs_url="/api/docs", openapi_url="/api/openapi.json")
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
