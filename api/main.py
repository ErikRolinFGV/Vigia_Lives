"""
API do Vigia.

    lives-api                 # http://127.0.0.1:8000, docs em /api/docs
    lives-api --porta 8080

Em desenvolvimento o front roda no Vite (web/, porta 5173) com proxy para
/api. Se web/dist existir, esta API tambem serve o front construido.
"""
import argparse
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from collector import config

from .routers import canais, lives, operacao

app = FastAPI(title="Vigia", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(operacao.router, prefix="/api")
app.include_router(canais.router, prefix="/api")
app.include_router(lives.router, prefix="/api")

DIST = Path(config.RAIZ) / "web" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def spa(caminho: str):
        # rotas do front (/yt/canais/...) caem no index.html; o router do
        # React resolve o resto
        alvo = DIST / caminho
        if caminho and alvo.is_file():
            return FileResponse(alvo)
        return FileResponse(DIST / "index.html")


def main():
    import uvicorn
    p = argparse.ArgumentParser(description="API do Vigia")
    p.add_argument("--porta", type=int, default=8000)
    p.add_argument("--reload", action="store_true", help="recarrega ao editar o codigo")
    a = p.parse_args()
    uvicorn.run("api.main:app", host="127.0.0.1", port=a.porta, reload=a.reload)


if __name__ == "__main__":
    main()
