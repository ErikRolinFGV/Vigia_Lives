"""Dossie, exportacao e publicacao de uma transmissao, e a leitura publica."""
import csv
import io
import json
import re
import sqlite3
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from collector import db, yt

from .. import dossie, secoes
from ..deps import conexao
from ..transmissoes import acompanhada_pct, janela_coletada_s, serie
from .. import trechos
from .lives import _live_ou_404, detalhe

router = APIRouter(tags=["relatorio"])

MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _slug(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    s = s.replace("×", "x").lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def _apelido(titulo):
    """Mesmo criterio do front: o confronto ou a fase, sem 'AO VIVO:'."""
    s = (titulo or "").split("|")[0]
    s = re.sub(r"^\s*(AO VIVO|JOGO COMPLETO)\s*(\([^)]*\))?\s*:\s*", "", s, flags=re.I).strip()
    return re.sub(r"\s+X\s+", " × ", s, flags=re.I)


def _cabecalho(con, video_id):
    l = _live_ou_404(con, video_id)
    t = yt.parse_ts(l["inicio_real"] or l["agendada_para"])
    return l, {
        "canal": l["canal_nome"], "nome": _apelido(l["titulo"]).title().replace(" X ", " × "),
        "data": t.strftime("%d/%m/%Y") if t else "—",
        "janela": f"{(janela_coletada_s(l) or 0) // 60} min coletados",
        "cobertura": f"{l['cobertura_pct']:.1f}%".replace(".", ",") if l["cobertura_pct"] is not None else "—",
        "slug_data": f"{t.day:02d}{MESES[t.month - 1]}{t.year}" if t else "sem-data",
    }


# ---------------------------------------------------------------- dossie

@router.get("/lives/{video_id}/dossie")
def ler_dossie(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    _live_ou_404(con, video_id)
    d = dossie.ler(con, video_id)
    return {"gerado": bool(d), "dossie": d}


@router.post("/lives/{video_id}/dossie")
def gerar_dossie(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    l = _live_ou_404(con, video_id)
    if not l["coleta_inicio"]:
        raise HTTPException(409, "sem coleta, não há dossiê: o chat desta transmissão não foi capturado")
    return {"gerado": True, "dossie": dossie.gerar(con, video_id)}


# ---------------------------------------------------------------- exportar

def _arquivo(conteudo, nome, tipo):
    return Response(conteudo, media_type=tipo, headers={"Content-Disposition": f'attachment; filename="{nome}"'})


@router.get("/lives/{video_id}/export.{fmt}")
def exportar(video_id: str, fmt: str, con: sqlite3.Connection = Depends(conexao)):
    """
    Arquivo para o pesquisador: leva tudo o que a coleta guardou, inclusive
    custo de cota, mas nunca texto de chat nem identificador de autor.
    """
    l, cab = _cabecalho(con, video_id)
    base = f"{_slug(l['canal_handle'] or l['canal_nome'])}_{_slug(_apelido(l['titulo']))}_{cab['slug_data']}"
    if fmt == "csv":
        s = serie(con, video_id)
        if not s:
            raise HTTPException(404, "esta transmissão não tem série minuto a minuto")
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(["t_s", "espectadores", "msgs_min", "participacao", "cota_unidades"])
        for i, t in enumerate(s["t"]):
            # janela sem resposta sai vazia, nunca interpolada
            w.writerow([t, "" if s["esp"][i] is None else s["esp"][i], s["mpm"][i],
                        "" if s["part"][i] is None else s["part"][i], s["cota"][i]])
        return _arquivo(buf.getvalue(), base + ".csv", "text/csv; charset=utf-8")
    if fmt == "json":
        obj = {
            "transmissao": detalhe(video_id, con),
            "serie": serie(con, video_id),
            "secoes": {k: f(con, video_id, "publica") for k, f in secoes.SECOES.items()},
            "custo_cota": {r["metodo"]: r["u"] for r in con.execute(
                "SELECT metodo, SUM(custo_unidades) u FROM coleta_log WHERE video_id=? GROUP BY metodo", (video_id,))},
            "dossie": dossie.ler(con, video_id),
            "gerado_em": db.agora(),
        }
        return _arquivo(json.dumps(obj, ensure_ascii=False, indent=2), base + ".json", "application/json")
    if fmt == "md":
        d = dossie.ler(con, video_id) or dossie.redigir(con, video_id) | {"modelo": dossie.MODELO}
        return _arquivo(dossie.markdown(d, cab), base + ".md", "text/markdown; charset=utf-8")
    raise HTTPException(404, "formatos: csv, json, md")


# ---------------------------------------------------------------- publicar

class Publicar(BaseModel):
    autor_nome: str | None = None
    instituicao: str | None = None
    orcid: str | None = None


def _publicacao(con, video_id):
    return con.execute("SELECT * FROM publicacao WHERE video_id=? AND revogado_em IS NULL ORDER BY emitido_em DESC LIMIT 1",
                       (video_id,)).fetchone()


def _pub_dict(p):
    return None if not p else {"canal_slug": p["canal_slug"], "slug": p["slug"], "emitido_em": p["emitido_em"],
                               "caminho": f"/r/{p['canal_slug']}/{p['slug']}"}


@router.get("/lives/{video_id}/publicacao")
def ver_publicacao(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    _live_ou_404(con, video_id)
    l, cab = _cabecalho(con, video_id)
    p = _publicacao(con, video_id)
    canal_slug = _slug((l["canal_handle"] or l["canal_nome"]).lstrip("@"))
    slug = f"{_slug(_apelido(l['titulo']))}-{cab['slug_data']}"
    return {"publicada": _pub_dict(p), "proposta": {"canal_slug": canal_slug, "slug": slug, "caminho": f"/r/{canal_slug}/{slug}"}}


@router.post("/lives/{video_id}/publicacao", status_code=201)
def publicar(video_id: str, corpo: Publicar, con: sqlite3.Connection = Depends(conexao)):
    l = _live_ou_404(con, video_id)
    if not l["coleta_inicio"]:
        raise HTTPException(409, "transmissão sem coleta não tem relatório para publicar")
    ja = _publicacao(con, video_id)
    if ja:
        return _pub_dict(ja)
    prop = ver_publicacao(video_id, con)["proposta"]
    slug = prop["slug"]
    # duas lives do mesmo canal com o mesmo nome no mesmo dia: sufixo
    n = 2
    while con.execute("SELECT 1 FROM publicacao WHERE canal_slug=? AND slug=?", (prop["canal_slug"], slug)).fetchone():
        slug = f"{prop['slug']}-{n}"
        n += 1
    con.execute("""INSERT INTO publicacao (slug, canal_slug, video_id, emitido_em, autor_nome, instituicao, orcid)
                   VALUES (?,?,?,?,?,?,?)""",
                (slug, prop["canal_slug"], video_id, db.agora(), corpo.autor_nome, corpo.instituicao, corpo.orcid))
    con.commit()
    return _pub_dict(_publicacao(con, video_id))


@router.delete("/lives/{video_id}/publicacao", status_code=204)
def revogar(video_id: str, con: sqlite3.Connection = Depends(conexao)):
    con.execute("UPDATE publicacao SET revogado_em=? WHERE video_id=? AND revogado_em IS NULL", (db.agora(), video_id))
    con.commit()


@router.get("/r/{canal_slug}/{slug}")
def publico(canal_slug: str, slug: str, con: sqlite3.Connection = Depends(conexao)):
    """
    Leitura publica, sem login. E uma projecao: so devolve agregados.
    Cota, custo, autores e texto de chat nao existem nesta resposta.
    """
    p = con.execute("SELECT * FROM publicacao WHERE canal_slug=? AND slug=?", (canal_slug, slug)).fetchone()
    if not p:
        raise HTTPException(404, "relatório não encontrado")
    if p["revogado_em"]:
        raise HTTPException(410, "este relatório não está mais público")
    vid = p["video_id"]
    l = _live_ou_404(con, vid)
    c = con.execute("SELECT nome, handle, foto_url FROM canal WHERE canal_id=?", (l["canal_id"],)).fetchone()
    s = serie(con, vid)
    chat = secoes._chat(con, vid)
    d = dossie.ler(con, vid)
    return {
        "canal": {"nome": c["nome"], "handle": c["handle"], "foto": c["foto_url"]},
        "titulo": l["titulo"], "inicio": l["inicio_real"], "duracao_s": l["duracao_segundos"],
        "janela_coletada_s": janela_coletada_s(l), "cobertura": l["cobertura_pct"], "acompanhada": acompanhada_pct(l),
        "pico": con.execute("SELECT MAX(espectadores) FROM snapshot_audiencia WHERE video_id=?", (vid,)).fetchone()[0],
        "pessoas": len(set(r["autor_pid"] for r in chat)), "mensagens": len(chat),
        "momentos": [dict(r) for r in con.execute(
            "SELECT offset_segundos t, tipo, magnitude, url_timestamp url FROM momento WHERE video_id=? AND offset_segundos >= 0 ORDER BY offset_segundos", (vid,))],
        "serie": {"t": s["t"], "esp": s["esp"], "part": s["part"]} if s else None,
        "comunidade": secoes.comunidade(con, vid, "publica"),
        "dossie": {k: d[k] for k in ("veredito", "veredito_sub", "insights", "recomendacao", "achados", "modelo", "gerado_em")} if d else None,
        "publicado": {"em": p["emitido_em"], "autor_nome": p["autor_nome"], "instituicao": p["instituicao"], "orcid": p["orcid"]},
        "url_video": trechos.url_video(vid, ini=(r.get("trecho") or {}).get("ini") if (r := detalhe(vid, con)) else None),
    }
