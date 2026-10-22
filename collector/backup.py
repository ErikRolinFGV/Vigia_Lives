"""
Copia do banco, segura com o vigia e os coletores gravando.

    python -m collector.backup                    # data/backups/lives-AAAA-MM-DD.db
    python -m collector.backup --para copia.db    # num arquivo escolhido
    python -m collector.backup --manter 14        # apaga as diarias mais velhas

Usa a API de backup do SQLite: copiar o arquivo lives.db direto, com o
banco em uso, pode pegar uma pagina pela metade e as alteracoes que ainda
estao no -wal. E o que leva o banco do PC para o servidor
(deploy/README.md) e o que o timer diario do servidor roda.
"""
import argparse
import sqlite3
import sys
from datetime import date
from pathlib import Path

try:  # instalado como pacote
    from . import config
except ImportError:  # rodando o arquivo direto
    import config

PASTA = config.RAIZ / "data" / "backups"


def copiar(destino: Path) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    tmp = destino.with_suffix(destino.suffix + ".parcial")
    origem = sqlite3.connect(f"file:{config.CAMINHO_DB}?mode=ro", uri=True, timeout=60)
    alvo = sqlite3.connect(tmp)
    try:
        # em blocos, soltando o banco entre eles: um coletor nao espera
        origem.backup(alvo, pages=256, sleep=0.05)
        ok = alvo.execute("PRAGMA integrity_check").fetchone()[0]
        if ok != "ok":
            raise RuntimeError(f"copia com defeito: {ok}")
    finally:
        alvo.close()
        origem.close()
    tmp.replace(destino)
    return destino


def limpar(manter: int):
    """Apaga as copias diarias alem das `manter` mais novas."""
    diarias = sorted(PASTA.glob("lives-????-??-??.db"))
    for velha in diarias[:-manter] if manter > 0 else []:
        velha.unlink()


def main():
    p = argparse.ArgumentParser(description="Copia segura do banco do Vigia")
    p.add_argument("--para", type=Path, help="arquivo de destino (padrao: data/backups/lives-<data>.db)")
    p.add_argument("--manter", type=int, default=0, help="copias diarias a manter (0 = nao apaga nenhuma)")
    a = p.parse_args()
    if not config.CAMINHO_DB.exists():
        sys.exit(f"banco nao encontrado: {config.CAMINHO_DB}")
    destino = copiar(a.para or PASTA / f"lives-{date.today().isoformat()}.db")
    if not a.para and a.manter:
        limpar(a.manter)
    print(f"copia em {destino} ({destino.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
