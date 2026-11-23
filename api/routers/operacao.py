"""Plano, saude e cota: o lado operacional da plataforma."""
import os
import shlex
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from collector import config, db, processo, registro, yt

from ..deps import LIMITE_SLOTS, conexao, escopo
from ..escopo import NOME_PLANO, Escopo

router = APIRouter(tags=["operacao"])
log = registro.Registro("api")


def _nao_subiu(msg):
    """O vigia nao subiu pelo botao: vai para o Registro e volta como erro para a tela."""
    log.erro(msg)
    return HTTPException(500, msg)


@router.get("/plano")
def plano(con: sqlite3.Connection = Depends(conexao), e: Escopo = Depends(escopo)):
    vigiados = [r[0] for r in con.execute("SELECT canal_id FROM canal WHERE vigiado = 1 AND removido_em IS NULL")]
    if e.admin:
        return {"nome": "Pesquisa", "limite_slots": LIMITE_SLOTS, "em_uso": len(vigiados)}
    nome = "Visitante" if e.papel == "visitante" else NOME_PLANO.get(e.plano or "gratuito", "Gratuito")
    return {"nome": nome, "limite_slots": e.limite_proprio or LIMITE_SLOTS,
            "em_uso": sum(1 for c in vigiados if c in e.proprios)}


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
def saude(con: sqlite3.Connection = Depends(conexao), e: Escopo = Depends(escopo)):
    return _saude(con, e)


def _saude(con, e: Escopo | None = None):
    ultima = con.execute("SELECT MAX(chamado_em) FROM coleta_log").fetchone()[0]
    b = _batimento(con)
    de_pe = _de_pe(b)
    # um coletor por video: a lista mostra o que esta rodando e quanto gasta,
    # para nao parecer que a mesma live esta sendo coletada duas vezes
    hora = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec="seconds")
    coletas = [dict(r) for r in con.execute(
        """SELECT l.video_id id, l.canal_id, l.titulo, l.coleta_inicio desde, c.nome canal,
                  (SELECT COALESCE(SUM(custo_unidades), 0) FROM coleta_log g WHERE g.video_id = l.video_id) unidades,
                  (SELECT COALESCE(SUM(custo_unidades), 0) FROM coleta_log g
                   WHERE g.video_id = l.video_id AND g.chamado_em >= ?) ultima_hora
           FROM live l JOIN canal c ON c.canal_id = l.canal_id
           WHERE l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NULL ORDER BY l.coleta_inicio""", (hora,))]
    # visitante: so as coletas do espaco dele (o vigia e o mesmo para todos)
    if e is not None:
        coletas = [c for c in coletas if e.live(c["id"], c["canal_id"])]
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
    # no servidor o vigia e um servico do sistema (deploy/README.md): o
    # botao liga o servico. Um processo solto ficaria no grupo do servico
    # da API e morreria junto quando ela reiniciasse.
    cmd = os.environ.get("VIGIA_LIGAR_CMD")
    if cmd:
        r = subprocess.run(shlex.split(cmd), capture_output=True, text=True, timeout=30)
        if r.returncode != 0:
            raise _nao_subiu(f"O vigia não subiu: {(r.stderr or r.stdout).strip()[-300:]}")
        for _ in range(20):
            time.sleep(0.5)
            if _de_pe(_batimento(con)):
                break
        return _saude(con)
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
        raise _nao_subiu(f"O vigia não subiu: {(r.stderr or r.stdout).strip()[-300:]}")
    _vigia = int(r.stdout.strip())
    # o primeiro batimento sai logo no inicio do primeiro ciclo
    for _ in range(20):
        time.sleep(0.5)
        if _de_pe(_batimento(con)):
            return _saude(con)
        if not _processo_vivo(_vigia):
            raise _nao_subiu("O vigia saiu logo ao subir. Veja data/vigia.log.")
    return _saude(con)


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
    return _saude(con)


# ---------------------------------------------------------------- registro

def _so_admin(req: Request):
    if req.state.conta["papel"] != "admin":
        raise HTTPException(403, "Só o administrador vê o registro do sistema.")


@router.get("/operacao/eventos")
def eventos(req: Request, nivel: str | None = None, origem: str | None = None, limite: int = 200,
            con: sqlite3.Connection = Depends(conexao)):
    """Avisos e erros do vigia, dos coletores e da API, do mais recente para o mais antigo."""
    _so_admin(req)
    filtros, args = [], []
    if nivel == "erro":  # "erro" inclui o critico (processo que caiu)
        filtros.append("nivel IN ('erro', 'critico')")
    elif nivel:
        filtros.append("nivel = ?"); args.append(nivel)
    if origem:
        filtros.append("origem = ?"); args.append(origem)
    onde = ("WHERE " + " AND ".join(filtros)) if filtros else ""
    linhas = con.execute(
        f"""SELECT e.*, l.titulo FROM evento e LEFT JOIN live l ON l.video_id = e.video_id
            {onde} ORDER BY e.ultimo_em DESC LIMIT ?""", (*args, max(1, min(limite, 1000)))).fetchall()
    return {"eventos": [dict(r) for r in linhas], "guardados_dias": registro.GUARDAR.days}


@router.get("/operacao/eventos/resumo")
def eventos_resumo(req: Request, con: sqlite3.Connection = Depends(conexao)):
    """Para o selo do cabecalho: quantos erros nas ultimas 24 h e quando foi o ultimo."""
    _so_admin(req)
    dia = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat(timespec="seconds")
    n = con.execute("SELECT COUNT(*) FROM evento WHERE nivel IN ('erro', 'critico') AND ultimo_em >= ?", (dia,)).fetchone()[0]
    ultimo = con.execute("SELECT MAX(ultimo_em) FROM evento WHERE nivel IN ('erro', 'critico')").fetchone()[0]
    return {"erros_24h": n, "ultimo_erro_em": ultimo}
