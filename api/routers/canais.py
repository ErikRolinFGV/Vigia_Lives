"""Canais vigiados, agenda e foto do canal."""
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from collector import config, db, vigilancia, yt

from ..deps import LIMITE_SLOTS, conexao
from ..transmissoes import lives_do_canal, resumo_live, vai_coletar
from .lives import cota_por_dia

router = APIRouter(tags=["canais"])

DIR_FOTOS = Path(config.RAIZ) / "uploads" / "canais"
TIPOS_FOTO = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
MAX_FOTO = 5 * 1024 * 1024

# A agenda e relida em segundo plano quando fica velha. Quando o vigia
# (processo permanente) estiver de pe, e ele que faz isso; aqui e so para a
# tela nao mostrar agenda de ontem enquanto ele nao existe.
AGENDA_VALIDADE = timedelta(minutes=20)
_sincronizando: set[str] = set()
_trava = threading.Lock()


def _sincronizar_em_fundo(canal_id):
    if not config.API_KEY:
        return
    with _trava:
        if canal_id in _sincronizando:
            return
        _sincronizando.add(canal_id)

    def tarefa():
        con = db.conectar(multithread=True)
        try:
            vigilancia.sincronizar_agenda(con, canal_id)
        except Exception as e:  # rede, cota, pagina mudou: tenta no proximo ciclo
            print(f"[agenda] {canal_id}: {e}")
        finally:
            con.close()
            with _trava:
                _sincronizando.discard(canal_id)

    threading.Thread(target=tarefa, daemon=True).start()


def _velha(lida_em):
    if not lida_em:
        return True
    t = yt.parse_ts(lida_em)
    return not t or datetime.now(timezone.utc) - t > AGENDA_VALIDADE


def _foto(c):
    if c["foto_local"]:
        p = Path(c["foto_local"])
        v = int(p.stat().st_mtime) if p.exists() else 0
        return f"/api/canais/{c['canal_id']}/foto?v={v}"
    return c["foto_url"]


def _canal_ou_404(con, canal_id):
    c = con.execute("SELECT * FROM canal WHERE canal_id=?", (canal_id,)).fetchone()
    if not c:
        raise HTTPException(404, "canal não encontrado")
    return c


def _visao_canal(con, c):
    lives = lives_do_canal(con, c["canal_id"])
    coletadas = [l for l in lives if l["estado"] in ("coletada", "parcial")]
    # no ar = o YouTube diz que esta no ar, com ou sem coletor. Sem coletor
    # e o pior estado possivel, e a tela precisa dizer isso, nao "fora do ar".
    no_ar = next((l for l in lives if l["estado"] == "no_ar"), None)         or next((l for l in lives if l["status"] == "ao_vivo"), None)
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    # a proxima que vai virar coleta; as nao escolhidas ficam so na agenda
    proximas = sorted((l for l in lives if l["estado"] == "agendada" and vai_coletar(l)
                       and (l["agendada_para"] or "") >= agora[:16]),
                      key=lambda l: l["agendada_para"] or "")
    picos = [l["pico"] for l in coletadas if l["pico"]]
    cobs = [l["cobertura_pct"] for l in coletadas if l["cobertura_pct"] is not None]
    ultima = coletadas[-1] if coletadas else None
    v = {
        "id": c["canal_id"],
        "nome": c["nome"],
        "handle": c["handle"],
        "foto": _foto(c),
        "url": "https://www.youtube.com/" + (c["handle"] or "channel/" + c["canal_id"]),
        "vigiado": bool(c["vigiado"]) and not c["removido_em"],
        "vigiado_desde": c["vigiado_desde"],
        "agenda_lida_em": c["agenda_lida_em"],
        "modo_coleta": c["modo_coleta"] or "todas",
        "estado": "no_ar" if no_ar else ("aguardando" if not lives else "fora_do_ar"),
        "no_ar": resumo_live(no_ar) if no_ar else None,
        "proxima": resumo_live(proximas[0]) if proximas else None,
        "ultima": resumo_live(ultima) if ultima else None,
        "n_coletadas": len(coletadas),
        "n_perdidas": sum(1 for l in lives if l["estado"] == "perdida"),
        "n_nao_escolhidas": sum(1 for l in lives if l["estado"] == "nao_escolhida"),
        "cobertura_media": round(sum(cobs) / len(cobs), 1) if cobs else None,
        "pico": max(picos) if picos else None,
        "lives": [resumo_live(l) for l in lives],
    }
    return v


def _vigiados(con):
    return con.execute(
        """SELECT * FROM canal WHERE vigiado = 1 AND removido_em IS NULL
           ORDER BY vigiado_desde, nome""").fetchall()


@router.get("/canais")
def listar(con: sqlite3.Connection = Depends(conexao)):
    canais = _vigiados(con)
    for c in canais:
        if _velha(c["agenda_lida_em"]):
            _sincronizar_em_fundo(c["canal_id"])
    lista = [_visao_canal(con, c) for c in canais]
    for v in lista:
        v.pop("lives")
    return {"limite_slots": LIMITE_SLOTS, "em_uso": len(lista), "canais": lista}


@router.get("/agenda")
def agenda(con: sqlite3.Connection = Depends(conexao)):
    """O que os canais vigiados vao transmitir e as ultimas coletas."""
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    proximas, recentes = [], []
    for c in _vigiados(con):
        for l in lives_do_canal(con, c["canal_id"]):
            item = {"canal_id": c["canal_id"], "canal": c["nome"], **resumo_live(l)}
            no_ar_sem_escolha = l["estado"] == "nao_escolhida" and l["status"] == "ao_vivo"
            if l["estado"] == "no_ar" or no_ar_sem_escolha or (l["estado"] == "agendada" and (l["agendada_para"] or "") >= agora[:16]):
                proximas.append(item)
            elif l["estado"] in ("coletada", "parcial", "perdida"):
                recentes.append(item)
    proximas.sort(key=lambda x: (not x["ao_vivo"], x["agendada_para"] or ""))
    recentes.sort(key=lambda x: x["inicio"] or x["agendada_para"] or "", reverse=True)
    # a agenda inteira (nao so as 6 primeiras): e nela que se escolhe o que coletar
    return {"proximas": proximas, "recentes": recentes[:5], "cota": cota_por_dia(con)}


@router.get("/canais/{canal_id}")
def detalhe(canal_id: str, con: sqlite3.Connection = Depends(conexao)):
    c = _canal_ou_404(con, canal_id)
    if c["vigiado"] and _velha(c["agenda_lida_em"]):
        _sincronizar_em_fundo(canal_id)
    return _visao_canal(con, c)


class NovoCanal(BaseModel):
    handle: str


@router.post("/canais", status_code=201)
def vigiar(corpo: NovoCanal, con: sqlite3.Connection = Depends(conexao)):
    entrada = corpo.handle.strip()
    if not entrada:
        raise HTTPException(422, "Informe um @handle, um id UC… ou o link do canal.")
    if not config.API_KEY:
        raise HTTPException(503, "YT_API_KEY não configurada no .env do servidor.")
    em_uso = len(_vigiados(con))
    try:
        canal_id = yt.resolver_canal_id(entrada)
    except Exception:
        raise HTTPException(404, f"Não encontrei um canal do YouTube para {entrada}.")
    ja = con.execute("SELECT vigiado, removido_em FROM canal WHERE canal_id=?", (canal_id,)).fetchone()
    ja_vigiado = ja and ja["vigiado"] and not ja["removido_em"]
    if not ja_vigiado and em_uso >= LIMITE_SLOTS:
        raise HTTPException(409, f"Todos os {LIMITE_SLOTS} slots do plano estão em uso.")
    try:
        vigilancia.vigiar(con, canal_id)
        vigilancia.sincronizar_agenda(con, canal_id)
    except yt.ErroCota:
        raise HTTPException(503, "A cota diária da API do YouTube acabou. Tente de novo amanhã.")
    except (yt.ErroAPI, yt.ErroRede) as e:
        raise HTTPException(502, f"O YouTube não respondeu: {e}")
    return _visao_canal(con, _canal_ou_404(con, canal_id))


@router.delete("/canais/{canal_id}", status_code=204)
def parar(canal_id: str, con: sqlite3.Connection = Depends(conexao)):
    _canal_ou_404(con, canal_id)
    vigilancia.parar(con, canal_id)


class Modo(BaseModel):
    modo: str


@router.put("/canais/{canal_id}/modo")
def mudar_modo(canal_id: str, corpo: Modo, con: sqlite3.Connection = Depends(conexao)):
    """
    'todas': toda live do canal vira coleta (menos as tiradas uma a uma).
    'escolhidas': so as marcadas. As escolhas feitas live a live ficam.
    """
    if corpo.modo not in ("todas", "escolhidas"):
        raise HTTPException(422, "modo é 'todas' ou 'escolhidas'")
    c = _canal_ou_404(con, canal_id)
    # O modo vale daqui para a frente. Live que ja acabou guarda o modo da
    # epoca: uma perdida com o vigia parado nao vira "nao escolhida" so
    # porque o canal mudou de modo depois.
    con.execute(
        """UPDATE live SET coletar = ? WHERE canal_id = ? AND coletar IS NULL
           AND status NOT IN ('agendada', 'ao_vivo')""",
        (1 if (c["modo_coleta"] or "todas") == "todas" else 0, canal_id))
    con.execute("UPDATE canal SET modo_coleta = ? WHERE canal_id = ?", (corpo.modo, canal_id))
    con.commit()
    return _visao_canal(con, _canal_ou_404(con, canal_id))


@router.post("/canais/{canal_id}/agenda")
def reler_agenda(canal_id: str, con: sqlite3.Connection = Depends(conexao)):
    _canal_ou_404(con, canal_id)
    if not config.API_KEY:
        raise HTTPException(503, "YT_API_KEY não configurada no .env do servidor.")
    try:
        n = vigilancia.sincronizar_agenda(con, canal_id)
    except yt.ErroCota:
        raise HTTPException(503, "A cota diária da API do YouTube acabou.")
    except Exception as e:
        raise HTTPException(502, f"Não consegui ler a agenda: {e}")
    return {"atualizadas": n}


@router.get("/canais/{canal_id}/foto")
def foto(canal_id: str, con: sqlite3.Connection = Depends(conexao)):
    c = _canal_ou_404(con, canal_id)
    if c["foto_local"] and Path(c["foto_local"]).exists():
        return FileResponse(c["foto_local"])
    if c["foto_url"]:
        return RedirectResponse(c["foto_url"])
    raise HTTPException(404, "canal sem foto")


@router.put("/canais/{canal_id}/foto")
async def trocar_foto(canal_id: str, arquivo: UploadFile = File(...),
                      con: sqlite3.Connection = Depends(conexao)):
    c = _canal_ou_404(con, canal_id)
    ext = TIPOS_FOTO.get(arquivo.content_type or "")
    if not ext:
        raise HTTPException(415, "Use uma imagem JPG, PNG, WEBP ou GIF.")
    dados = await arquivo.read(MAX_FOTO + 1)
    if len(dados) > MAX_FOTO:
        raise HTTPException(413, "A imagem passa de 5 MB.")
    DIR_FOTOS.mkdir(parents=True, exist_ok=True)
    # o nome do arquivo vem do canal_id do banco, nunca do upload
    for antigo in DIR_FOTOS.glob(c["canal_id"] + ".*"):
        antigo.unlink()
    destino = DIR_FOTOS / (c["canal_id"] + ext)
    destino.write_bytes(dados)
    con.execute("UPDATE canal SET foto_local=? WHERE canal_id=?", (str(destino), canal_id))
    con.commit()
    return {"foto": _foto(_canal_ou_404(con, canal_id))}
