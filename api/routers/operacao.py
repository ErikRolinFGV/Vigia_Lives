"""Plano, saude e cota: o lado operacional da plataforma."""
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from collector import config, db, processo, yt

from ..deps import LIMITE_SLOTS, conexao

router = APIRouter(tags=["operacao"])


@router.get("/plano")
def plano(con: sqlite3.Connection = Depends(conexao)):
    em_uso = con.execute(
        "SELECT COUNT(*) FROM canal WHERE vigiado = 1 AND removido_em IS NULL"
    ).fetchone()[0]
    return {"nome": "Pesquisa", "limite_slots": LIMITE_SLOTS, "em_uso": em_uso}


# Sem batimento ha mais que isso, o vigia e considerado parado.
BATIMENTO_MAX = timedelta(minutes=5)


# Pid do vigia subido pela interface. Fica so em memoria: se a API reiniciar,
# o processo segue vivo (solto, sem janela) e o batimento continua valendo.
_vigia: int | None = None
LOG_VIGIA = config.RAIZ / "data" / "vigia.log"


def _batimento(con):
    return con.execute(
        "SELECT iniciado_em, ultimo_ciclo, parar_pedido_em, encerrado_em, pid FROM vigia_batimento WHERE id = 1"
    ).fetchone()


def _processo_vivo(pid) -> bool:
    return processo.vivo(pid)


def _de_pe(b) -> bool:
    if not b or b["encerrado_em"]:
        return False
    t = yt.parse_ts(b["ultimo_ciclo"])
    if not (t and datetime.now(timezone.utc) - t <= BATIMENTO_MAX):
        return False
    # morto sem se despedir (janela fechada, processo derrubado): nao espera
    # os 5 min do batimento para dizer que parou
    return _processo_vivo(b["pid"])


def _subindo() -> bool:
    return _vigia is not None and _processo_vivo(_vigia)


@router.get("/operacao/saude")
def saude(con: sqlite3.Connection = Depends(conexao)):
    ultima = con.execute("SELECT MAX(chamado_em) FROM coleta_log").fetchone()[0]
    b = _batimento(con)
    de_pe = _de_pe(b)
    # um coletor por video: a lista mostra o que esta rodando e quanto gasta,
    # para nao parecer que a mesma live esta sendo coletada duas vezes
    hora = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
    coletas = [dict(r) for r in con.execute(
        """SELECT l.video_id id, l.titulo, l.coleta_inicio desde, c.nome canal,
                  (SELECT COALESCE(SUM(custo_unidades), 0) FROM coleta_log g WHERE g.video_id = l.video_id) unidades,
                  (SELECT COALESCE(SUM(custo_unidades), 0) FROM coleta_log g
                   WHERE g.video_id = l.video_id AND g.chamado_em >= ?) ultima_hora
           FROM live l JOIN canal c ON c.canal_id = l.canal_id
           WHERE l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NULL ORDER BY l.coleta_inicio""", (hora,))]
    ativas = len(coletas)
    return {
        "api": "ok",
        "vigia": {
            "de_pe": de_pe,
            "desde": b["iniciado_em"] if b and de_pe else None,
            "ultimo_ciclo": b["ultimo_ciclo"] if b else None,
            # pedido de desligar feito, ainda sem o vigia sair
            "parando": bool(de_pe and b["parar_pedido_em"]),
            # processo subido pela interface, ainda sem o primeiro batimento
            "ligando": not de_pe and _subindo(),
        },
        "coletas_ativas": ativas,
        "coletas": coletas,
        "ultima_chamada_youtube": ultima,
    }


@router.post("/operacao/vigia/ligar")
def ligar_vigia(con: sqlite3.Connection = Depends(conexao)):
    global _vigia
    if _de_pe(_batimento(con)) or _subindo():
        raise HTTPException(409, "O vigia já está rodando.")
    if not config.API_KEY:
        raise HTTPException(400, "YT_API_KEY não configurada no .env: sem ela o vigia não sobe.")
    con.execute("UPDATE vigia_batimento SET parar_pedido_em = NULL WHERE id = 1")
    con.commit()
    LOG_VIGIA.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_VIGIA, "a", encoding="utf-8") as saida:
        saida.write(f"\n--- ligado pela interface em {db.agora()} ---\n")
        saida.flush()
    # pelo intermediario: o vigia sobe sem pai vivo, fora da arvore da API,
    # e reiniciar ou fechar a API nao derruba o vigia nem as coletas
    r = subprocess.run([sys.executable, "-m", "collector.lancar", str(LOG_VIGIA)], cwd=str(config.RAIZ),
                       capture_output=True, text=True, timeout=30,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0 or not r.stdout.strip().isdigit():
        raise HTTPException(500, f"O vigia não subiu: {(r.stderr or r.stdout).strip()[-300:]}")
    _vigia = int(r.stdout.strip())
    # o primeiro batimento sai logo no inicio do primeiro ciclo
    for _ in range(20):
        time.sleep(0.5)
        if _de_pe(_batimento(con)):
            return saude(con)
        if not _processo_vivo(_vigia):
            raise HTTPException(500, "O vigia saiu logo ao subir. Veja data/vigia.log.")
    return saude(con)


@router.post("/operacao/vigia/desligar")
def desligar_vigia(con: sqlite3.Connection = Depends(conexao)):
    if not _de_pe(_batimento(con)):
        raise HTTPException(409, "O vigia não está rodando.")
    con.execute("UPDATE vigia_batimento SET parar_pedido_em = ? WHERE id = 1", (db.agora(),))
    con.commit()
    # o vigia confere o pedido a cada 5 s; no meio de um ciclo, demora mais
    for _ in range(16):
        time.sleep(0.5)
        if not _de_pe(_batimento(con)):
            break
    return saude(con)
