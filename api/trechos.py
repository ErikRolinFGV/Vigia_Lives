"""
Trechos: um video do YouTube que carregou mais de uma transmissao.

Caso real (18/10): a CazeTV reaproveitou o link de Leeds x Man Utd e o
renomeou para Canada x Brasil as 11:54, quando o jogo acabou; no fim,
renomeou de novo para "JOGO COMPLETO: LEEDS ...". Para o analista sao duas
transmissoes: Leeds (08:45 -> 11:54, encerrada) e Canada x Brasil (11:54 ->
fim). Cada uma tem estado, dados e relatorio proprios.

Como funciona:
  - O corte e metadado. O dado bruto (mensagem, audiencia...) nao muda:
    mover ou desfazer o corte nao perde nada.
  - Sem corte gravado, ele e detectado: toda troca de titulo durante a
    transmissao que muda o "nucleo" do titulo (o que vem antes do primeiro
    "|", sem "AO VIVO"/"JOGO COMPLETO") vira um corte. Renomear depois do
    fim nao corta (vira "mudanca depois da live", como antes).
  - O trecho n do video V tem id "V~n". Numa requisicao de trecho,
    `preparar` cria visoes TEMP com o nome das tabelas (mensagem,
    snapshot_audiencia, ...): o SQLite procura o schema temp primeiro, entao
    as secoes, o dossie e a exportacao leem so a janela do trecho, com o
    tempo contado do inicio dele, sem saber que e um trecho. As visoes
    morrem com a conexao (uma por request).
  - Dado do video inteiro (inscritos antes/depois, comentarios, views
    +1 h ... +7 d) nao se divide: o trecho mostra o do video, e a tela diz
    que e do video inteiro. O video inteiro segue acessivel pelo id original.
"""
import json
from datetime import timedelta

from collector import db, yt
from collector.gemeas import nucleo  # noqa: F401  (a regra mora no coletor, que o vigia tambem usa)

SEP = "~"


def separar(tid):
    """"V~2" -> ("V", 2); "V" -> ("V", None)."""
    if SEP in tid:
        v, n = tid.rsplit(SEP, 1)
        if n.isdigit():
            return v, int(n)
    return tid, None


def _off(l, iso):
    a, b = yt.parse_ts(l["inicio_real"]), yt.parse_ts(iso)
    return int((b - a).total_seconds()) if a and b else None


def _titulos(con, l):
    """[(offset, titulo)] de cada troca de titulo durante a transmissao."""
    fim = yt.parse_ts(l["fim_real"]) if l["fim_real"] else None
    out, ant = [], None
    for r in con.execute(
            "SELECT coletado_em, titulo FROM main.video_snapshot WHERE video_id=? AND fase='durante' AND titulo IS NOT NULL "
            "ORDER BY coletado_em", (l["video_id"],)):
        t = yt.parse_ts(r["coletado_em"])
        if fim and t and t > fim:
            break  # renomeada depois do fim: mudanca, nao trecho
        if r["titulo"] != ant:
            o = _off(l, r["coletado_em"])
            if o is not None:
                out.append((max(0, o), r["titulo"]))
            ant = r["titulo"]
    return out


# Troca de titulo corrigida logo depois (20/10: "CALDERANO NO CHINA SMASH",
# um minuto depois "CALDERANO X LEBRUN NO CHINA SMASH") nao e outra
# transmissao: vale o corte da correcao, e nenhum trecho dura menos que isto.
CORTE_MIN = 5 * 60


def _cortes_auto(titulos, fim=None):
    """
    Cortes pelas trocas de nucleo do titulo. `fim`: duracao da live em
    segundos. Troca nos ultimos CORTE_MIN nao abre trecho: em 22/10 a CazeTV
    renomeou o link 34 s antes de encerrar ("JOGO COMPLETO: ATLETICO-MG X
    TORQUE"), e virava um 5o trecho de 34 s.
    """
    cortes, ant = [], None
    for o, t in titulos:
        n = nucleo(t)
        if ant is not None and n and n != ant and o > 0:
            if cortes and o - cortes[-1] < CORTE_MIN:
                cortes.pop()
            if not cortes or o - cortes[-1] >= CORTE_MIN:
                cortes.append(o)
        if n:
            ant = n
    if fim is not None:
        cortes = [c for c in cortes if fim - c >= CORTE_MIN]
    return cortes


def _gravado(con, video_id):
    r = con.execute("SELECT cortes FROM divisao WHERE video_id=?", (video_id,)).fetchone()
    return None if r is None else json.loads(r["cortes"])


def trechos(con, l):
    """
    Trechos do video (lista de dicts com n, ini, fim, titulo, origem), ou []
    se ele e uma transmissao so. ini/fim em segundos desde o inicio da live;
    fim None = ate o fim do video.
    """
    if not l["inicio_real"] or not l["coleta_inicio"]:
        return []
    titulos = _titulos(con, l)
    gravado = _gravado(con, l["video_id"])
    fim = _off(l, l["fim_real"]) if l["fim_real"] else None
    cortes = sorted(set(gravado if gravado is not None else _cortes_auto(titulos, fim)))
    if not cortes:
        return []

    def titulo_em(o):
        atual = l["titulo"]
        for t_o, t in titulos:
            if t_o <= o + 90:  # o titulo novo aparece na leitura do minuto seguinte
                atual = t
        return atual

    limites = [0] + cortes + [None]
    out = []
    for i in range(len(limites) - 1):
        ini, fim = limites[i], limites[i + 1]
        out.append({"n": i + 1, "ini": ini, "fim": fim, "titulo": titulo_em(ini) if i else l["titulo"],
                    "origem": "manual" if gravado is not None else "titulo"})
    return out


def linha_trecho(l, t, total):
    """A linha de `live` de um trecho: o que o estado, as listas e a tela leem."""
    d = dict(l)
    inicio = yt.parse_ts(l["inicio_real"])
    t_ini = inicio + timedelta(seconds=t["ini"])
    t_fim = inicio + timedelta(seconds=t["fim"]) if t["fim"] is not None else None
    iso = lambda x: x.isoformat(timespec="seconds") if x else None
    ci, cf = yt.parse_ts(l["coleta_inicio"]), yt.parse_ts(l["coleta_fim"]) if l["coleta_fim"] else None
    d.update({
        "video_id": f"{l['video_id']}{SEP}{t['n']}",
        "titulo": t["titulo"],
        "inicio_real": iso(t_ini),
        "fim_real": iso(t_fim) if t_fim else l["fim_real"],
        "agendada_para": l["agendada_para"] if t["n"] == 1 else iso(t_ini),
        "coleta_inicio": iso(max(ci, t_ini)) if ci else None,
        # trecho que ja acabou esta coletado e encerrado, mesmo com o video no ar
        "coleta_fim": iso(min(cf, t_fim) if cf and t_fim else (t_fim or cf)),
        "status": "encerrada" if t_fim else l["status"],
    })
    if t_fim:
        d["duracao_segundos"] = t["fim"] - t["ini"]
    elif l["duracao_segundos"]:
        d["duracao_segundos"] = l["duracao_segundos"] - t["ini"]
    else:
        d["duracao_segundos"] = None
    d["_pai"], d["_trecho"], d["_total"], d["_ini"], d["_fim"] = l["video_id"], t["n"], total, t["ini"], t["fim"]
    # o link: o titulo da live e o que ela tinha quando a coleta comecou
    d["_link_titulo"], d["_link_inicio"], d["_link_fim"] = l["titulo"], l["inicio_real"], l["fim_real"]
    return d


def url_video(tid, l=None, ini=None):
    v, n = separar(tid)
    return f"https://youtube.com/watch?v={v}" + (f"&t={ini}s" if n and ini else "")


# ---------------------------------------------------------------- visoes

def _cols(con, tabela):
    return [r[1] for r in con.execute(f"PRAGMA main.table_info({tabela})")]


def _q(v):
    return "'" + str(v).replace("'", "''") + "'"


def preparar(con, tid):
    """
    Requisicao de um trecho: cria as visoes TEMP e devolve o id. Para um
    video comum nao faz nada. Devolve None se o trecho nao existe.
    """
    v, n = separar(tid)
    if n is None:
        return tid
    l = con.execute("SELECT * FROM main.live WHERE video_id=?", (v,)).fetchone()
    if not l:
        return None
    ts = trechos(con, l)
    t = next((x for x in ts if x["n"] == n), None)
    if not t:
        return None
    linha = linha_trecho(l, t, len(ts))
    ini, fim = t["ini"], t["fim"]
    inicio = yt.parse_ts(l["inicio_real"])
    a_iso = (inicio + timedelta(seconds=ini)).isoformat(timespec="seconds") if n > 1 else "0000"
    b_iso = (inicio + timedelta(seconds=fim)).isoformat(timespec="seconds") if fim is not None else "9999"
    V, T = _q(v), _q(tid)

    con.execute("DROP TABLE IF EXISTS temp._trecho_live")
    cols = _cols(con, "live")
    con.execute(f"CREATE TEMP TABLE _trecho_live AS SELECT * FROM main.live WHERE 0")
    con.execute(f"INSERT INTO temp._trecho_live ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                [linha.get(c) for c in cols])

    def visao(tabela, filtro, troca):
        cs = _cols(con, tabela)
        if not cs:
            return
        sel = ", ".join(troca.get(c, c) + (f" AS {c}" if c in troca else "") for c in cs)
        con.execute(f"DROP VIEW IF EXISTS temp.{tabela}")
        con.execute(f"""CREATE TEMP VIEW {tabela} AS
                        SELECT {sel} FROM main.{tabela} WHERE video_id = {V} AND ({filtro})
                        UNION ALL SELECT * FROM main.{tabela} WHERE video_id IS NOT {V}""")

    con.execute("DROP VIEW IF EXISTS temp.live")
    con.execute("CREATE TEMP VIEW live AS SELECT * FROM main.live UNION ALL SELECT * FROM temp._trecho_live")

    # janela por offset (o trecho 1 leva tambem o chat de antes do inicio)
    lo = f"offset_segundos >= {ini}" if n > 1 else "1"
    hi = f"offset_segundos < {fim}" if fim is not None else "1"
    por_offset = {"video_id": T, "offset_segundos": f"offset_segundos - {ini}"}
    for tab in ("mensagem", "snapshot_audiencia", "momento", "enquete"):
        visao(tab, f"{lo} AND {hi}", por_offset)
    # janela por relogio
    janela = lambda col: f"{col} >= {_q(a_iso)} AND {col} < {_q(b_iso)}"
    visao("coleta_log", janela("chamado_em"), {"video_id": T})
    visao("concorrencia", janela("coletado_em"), {"video_id": T})
    # Do video inteiro, nao de um trecho: inscritos antes/depois, views e
    # comentarios depois da live. O trecho mostra, e a tela avisa que e do
    # video inteiro (secoes devolvem video_inteiro=True).
    visao("canal_snapshot", "1", {"video_id": T})
    visao("video_snapshot", f"fase != 'durante' OR ({janela('coletado_em')})", {"video_id": T})
    for tab in ("comentario_top", "estatistica_final", "pos_live_job"):
        visao(tab, "1", {"video_id": T})
    return tid


def gravar(con, video_id, cortes):
    """cortes=None volta para a deteccao automatica; [] = sem divisao."""
    if cortes is None:
        con.execute("DELETE FROM divisao WHERE video_id=?", (video_id,))
    else:
        con.execute("""INSERT INTO divisao (video_id, cortes, atualizado_em) VALUES (?,?,?)
                       ON CONFLICT(video_id) DO UPDATE SET cortes=excluded.cortes, atualizado_em=excluded.atualizado_em""",
                    (video_id, json.dumps(sorted(set(int(c) for c in cortes))), db.agora()))
    con.commit()
