"""
As secoes da aba "Dados da coleta". Cada funcao recebe a conexao, o video
e a versao ('interna' ou 'publica') e devolve um dict pronto para a tela.

Regras que valem para todas:
  - campo sem dado volta None (a tela mostra "—" ou "nao consta"), nunca
    estimativa;
  - texto de chat e identificador de autor (handle) so na versao interna;
  - tempos em segundos desde o inicio da live, como a serie.
"""
import json
import math
import re
import statistics
from collections import Counter, defaultdict

from collector import yt

from . import texto as T
from .cambio import para_brl
from .transmissoes import serie as serie_live

JANELA5 = 300

TIPOS_MODERACAO = ("messageDeletedEvent", "messageRetractedEvent", "userBannedEvent")
# eventos de sistema: nao sao mensagem de ninguem
TIPOS_SISTEMA = ("chatEndedEvent", "sponsorOnlyModeStartedEvent", "sponsorOnlyModeEndedEvent", "tombstone")
# o que tem texto escrito por uma pessoa e entra na analise de conversa
TIPOS_TEXTO = ("textMessageEvent", "superChatEvent", "superStickerEvent", "memberMilestoneChatEvent")
TIPOS_APOIO = ("superChatEvent", "superStickerEvent")

CATEGORIAS = {"1": "Filmes e animação", "2": "Automóveis", "10": "Música", "15": "Animais", "17": "Esportes",
              "19": "Viagens e eventos", "20": "Jogos", "22": "Pessoas e blogs", "23": "Comédia",
              "24": "Entretenimento", "25": "Notícias e política", "26": "Estilo", "27": "Educação",
              "28": "Ciência e tecnologia", "29": "Ativismo"}
IDIOMAS_AUDIO = {"pt": "português", "pt-BR": "português (BR)", "pt-PT": "português (PT)", "en": "inglês",
                 "es": "espanhol", "es-419": "espanhol (América Latina)"}


# ---------------------------------------------------------------- base

def _live(con, video_id):
    return con.execute("SELECT * FROM live WHERE video_id=?", (video_id,)).fetchone()


def _chat(con, video_id, tipos=None):
    """Mensagens durante a transmissao (offset >= 0), sem eventos de moderacao e sistema."""
    fora = TIPOS_MODERACAO + TIPOS_SISTEMA
    sql = f"""SELECT msg_id, offset_segundos o, autor_pid, tipo, texto, moeda, valor_micros, bruto, publicado_em
              FROM mensagem WHERE video_id=? AND offset_segundos >= 0
              AND tipo NOT IN ({",".join("?" * len(fora))})"""
    args = [video_id, *fora]
    if tipos:
        sql += f" AND tipo IN ({','.join('?' * len(tipos))})"
        args += list(tipos)
    return con.execute(sql + " ORDER BY offset_segundos", args).fetchall()


def _bruto(r):
    try:
        return json.loads(r["bruto"]) if r["bruto"] else {}
    except (TypeError, ValueError):
        return {}


def _handles(con, pids):
    """pid -> nome de exibicao (so versao interna). Anonimizado vira None."""
    pids = [p for p in set(pids) if p]
    if not pids:
        return {}
    rows = con.execute(
        f"SELECT autor_pid, nome_exibicao FROM autor_identidade WHERE autor_pid IN ({','.join('?' * len(pids))})", pids)
    return {r["autor_pid"]: r["nome_exibicao"] for r in rows}


def _rotulo_autor(handles, pid):
    h = handles.get(pid)
    if h:
        return h if h.startswith("@") else h
    return "pseudônimo " + (pid or "?")[:6]


def _janelas5(inicio, fim):
    """Inicios das janelas de 5 min que cobrem [inicio, fim]."""
    a = (inicio // JANELA5) * JANELA5
    return list(range(a, fim + 1, JANELA5)) or [a]


def _idx5(janelas, t):
    return min(len(janelas) - 1, max(0, (t - janelas[0]) // JANELA5))


def _faixa_tempo(s):
    """Inicio e fim (s) da serie, ou None."""
    if not s:
        return None
    return s["t"][0], s["t"][-1] + 59


# ---------------------------------------------------------------- momentos

def _palavras_caracteristicas(rows, ini, fim, total_global, n_global, n=4):
    """
    Palavras que aparecem na janela acima do esperado pela taxa da live
    inteira. Contagem pura daria sempre "brasil" e "vamos".
    """
    janela = [r for r in rows if ini <= r["o"] < fim and r["texto"]]
    cont = Counter()
    formas = {}
    for r in janela:
        for p in T.palavras(r["texto"]):
            k = T.sem_acento(p)
            cont[k] += 1
            formas.setdefault(k, Counter())[p] += 1
    if not janela or not n_global:
        return []
    frac = len(janela) / n_global
    score = {k: c - total_global.get(k, 0) * frac for k, c in cont.items() if c >= 2}
    melhores = sorted(score, key=score.get, reverse=True)[:n]
    return [formas[k].most_common(1)[0][0] for k in melhores if score[k] > 0]


def momentos(con, video_id, versao):
    s = serie_live(con, video_id)
    rows = _chat(con, video_id)
    linhas = con.execute(
        "SELECT offset_segundos t, tipo, magnitude FROM momento WHERE video_id=? AND offset_segundos >= 0 ORDER BY offset_segundos",
        (video_id,)).fetchall()
    apoio = _chat(con, video_id, TIPOS_APOIO)

    recordes = {"audiencia": None, "chat": None, "apoio": None}
    mediana = None
    if s:
        validos = [(v, i) for i, v in enumerate(s["esp"]) if v is not None]
        if validos:
            v, i = max(validos)
            recordes["audiencia"] = {"valor": v, "t": s["t"][i]}
        i = max(range(len(s["mpm"])), key=lambda k: s["mpm"][k])
        recordes["chat"] = {"valor": s["mpm"][i], "t": s["t"][i]}
        mediana = sorted(s["mpm"])[len(s["mpm"]) // 2]
    if apoio:
        por_janela = defaultdict(float)
        for r in apoio:
            brl = para_brl(con, r["valor_micros"], r["moeda"], r["publicado_em"])
            if brl:
                por_janela[(r["o"] // JANELA5) * JANELA5] += brl
        if por_janela:
            ini = max(por_janela, key=por_janela.get)
            recordes["apoio"] = {"valor_brl": round(por_janela[ini], 2), "t": ini, "t_fim": ini + JANELA5}

    total_global = Counter(T.sem_acento(p) for r in rows if r["texto"] for p in T.palavras(r["texto"]))
    lista = []
    for m in linhas:
        i = None
        if s:
            i = next((k for k, t in enumerate(s["t"]) if t <= m["t"] < t + 60), None)
        esp = None
        if s and i is not None:
            for d in range(6):
                for k in (i - d, i + d):
                    if 0 <= k < len(s["esp"]) and s["esp"][k] is not None:
                        esp = s["esp"][k]
                        break
                if esp is not None:
                    break
        msgs = s["mpm"][i] if s and i is not None else None
        lista.append({
            "t": m["t"], "tipo": m["tipo"], "magnitude": m["magnitude"],
            "msgs": msgs, "vezes_mediana": round(msgs / mediana, 1) if msgs is not None and mediana else None,
            "espectadores": esp,
            "superchats": sum(1 for r in apoio if m["t"] - 60 <= r["o"] < m["t"] + 120),
            "palavras": _palavras_caracteristicas(rows, m["t"] - 60, m["t"] + 120, total_global, len(rows))
            if versao == "interna" else [],
        })
    return {"recordes": recordes, "mediana_mpm": mediana, "lista": lista}


# ---------------------------------------------------------------- conversa

def conversa(con, video_id, versao):
    rows = [r for r in _chat(con, video_id, TIPOS_TEXTO) if r["texto"]]
    s = serie_live(con, video_id)
    if not rows:
        return {"disponivel": False}
    faixa = _faixa_tempo(s) or (rows[0]["o"], rows[-1]["o"])
    jan = _janelas5(*faixa)
    sent = [Counter() for _ in jan]
    tons = Counter()
    idiomas = Counter()
    perguntas = Counter()
    exemplo = {}
    marcas = Counter()
    primeira_marca = {}
    n_perg = 0
    for r in rows:
        t = r["texto"]
        tm = T.tom(t)
        tons[tm] += 1
        sent[_idx5(jan, r["o"])][tm] += 1
        idiomas[T.idioma(t)] += 1
        q = T.pergunta(t)
        if q:
            n_perg += 1
            perguntas[q] += 1
            exemplo.setdefault(q, T.limpar(t).split("?")[0].strip() + "?")
        for m in T.marcas(t):
            marcas[m] += 1
            primeira_marca.setdefault(m, r["o"])

    total = len(rows)
    det = sum(v for k, v in idiomas.items() if k)
    serie_tom = []
    for ini, c in zip(jan, sent):
        n = sum(c.values())
        serie_tom.append({"t": ini, "n": n,
                          "pos": round(100 * c["positivo"] / n, 1) if n else None,
                          "neu": round(100 * c["neutro"] / n, 1) if n else None,
                          "neg": round(100 * c["negativo"] / n, 1) if n else None})
    out = {
        "disponivel": True,
        "metodo": T.MODELO,
        "mensagens": total,
        "tom": {k: round(100 * tons[k] / total, 1) for k in ("positivo", "neutro", "negativo")},
        "serie_tom": serie_tom,
        "perguntas": {"n": n_perg, "pct": round(100 * n_perg / total, 1)},
        "idiomas": [{"idioma": k, "pct": round(100 * v / det, 1)} for k, v in idiomas.most_common() if k] if det else [],
        "idioma_indeterminado": idiomas[None],
        "marcas": [{"marca": m, "n": v, "primeira_t": primeira_marca[m]} for m, v in marcas.most_common()],
    }
    if versao == "interna":
        out["palavras"] = [{"p": p, "n": v} for p, v in T.contar_palavras(T.palavras(r["texto"]) for r in rows)]
        out["emojis"] = [{"e": e, "n": v} for e, v in Counter(e for r in rows for e in T.emojis(r["texto"])).most_common(8)]
        out["perguntas_top"] = [{"q": exemplo[q], "n": v} for q, v in perguntas.most_common(5) if v >= 2]
    return out


# ---------------------------------------------------------------- moderacao

def moderacao(con, video_id, versao):
    eventos = con.execute(
        f"""SELECT offset_segundos o, autor_pid, tipo, bruto FROM mensagem
            WHERE video_id=? AND offset_segundos >= 0 AND tipo IN ({",".join("?" * len(TIPOS_MODERACAO))})""",
        (video_id, *TIPOS_MODERACAO)).fetchall()
    total_chat = len(_chat(con, video_id))
    s = serie_live(con, video_id)
    jan = _janelas5(*(_faixa_tempo(s) or (0, 0)))
    serie5 = [0] * len(jan)
    apagadas = suspensoes = banimentos = 0
    duracoes = []
    por_mod = defaultdict(lambda: {"apagou": 0, "suspendeu": 0, "baniu": 0})
    for e in eventos:
        serie5[_idx5(jan, e["o"])] += 1
        b = _bruto(e)
        if e["tipo"] == "userBannedEvent":
            det = b.get("userBannedDetails") or {}
            if det.get("banType") == "temporary":
                suspensoes += 1
                por_mod[e["autor_pid"]]["suspendeu"] += 1
                if det.get("banDurationSeconds"):
                    duracoes.append(int(det["banDurationSeconds"]))
            else:
                banimentos += 1
                por_mod[e["autor_pid"]]["baniu"] += 1
        else:
            apagadas += 1
            por_mod[e["autor_pid"]]["apagou"] += 1
    out = {
        "eventos": len(eventos),
        "apagadas": apagadas, "pct_apagadas": round(100 * apagadas / total_chat, 1) if total_chat else None,
        "suspensoes": suspensoes, "suspensao_media_s": round(statistics.mean(duracoes)) if duracoes else None,
        "banimentos": banimentos,
        "moderadores": len(por_mod),
        "serie5": [{"t": t, "n": v} for t, v in zip(jan, serie5)],
    }
    if eventos:
        i = max(range(len(serie5)), key=lambda k: serie5[k] + (serie5[k + 1] if k + 1 < len(serie5) else 0))
        out["pico"] = {"t": jan[i], "t_fim": jan[i] + 2 * JANELA5,
                       "n": serie5[i] + (serie5[i + 1] if i + 1 < len(serie5) else 0)}
    if versao == "interna":
        hs = _handles(con, por_mod.keys())
        out["quem"] = sorted(({"autor": _rotulo_autor(hs, pid), **v} for pid, v in por_mod.items()),
                             key=lambda x: -(x["apagou"] + x["suspendeu"] + x["baniu"]))
    return out


# ---------------------------------------------------------------- pessoas

def pessoas(con, video_id, versao):
    rows = _chat(con, video_id)
    if not rows:
        return {"disponivel": False}
    por = Counter(r["autor_pid"] for r in rows)
    total, n = len(rows), len(por)
    papeis = {r["autor_pid"]: r for r in con.execute(
        "SELECT * FROM autor_papel_live WHERE video_id=?", (video_id,))}

    def tipo(pid):
        p = papeis.get(pid)
        if not p:
            return "demais"
        if p["is_dono"]:
            return "dono"
        if p["is_moderador"]:
            return "moderadores"
        if p["is_membro"]:
            return "membros"
        if p["is_verificado"]:
            return "verificados"
        return "demais"

    comp = defaultdict(lambda: {"pessoas": 0, "msgs": 0})
    for pid, c in por.items():
        comp[tipo(pid)]["pessoas"] += 1
        comp[tipo(pid)]["msgs"] += c
    ordem = ["membros", "moderadores", "dono", "verificados", "demais"]

    faixas = [("1 mensagem", 1, 1), ("2 a 5", 2, 5), ("6 a 20", 6, 20), ("21 ou mais", 21, 10 ** 9)]
    contagens = sorted(por.values(), reverse=True)
    k10 = max(1, math.ceil(0.1 * n))

    # quem voltou: a proxima live coletada do mesmo canal
    l = _live(con, video_id)
    prox = con.execute(
        """SELECT video_id, inicio_real FROM live WHERE canal_id=? AND coleta_inicio IS NOT NULL
           AND inicio_real > ? ORDER BY inicio_real LIMIT 1""",
        (l["canal_id"], l["inicio_real"] or "")).fetchone()
    voltaram = None
    if prox:
        seguintes = set(r["autor_pid"] for r in _chat(con, prox["video_id"]))
        v = len(set(por) & seguintes)
        voltaram = {"n": v, "pct": round(100 * v / n, 1), "video_id": prox["video_id"], "inicio": prox["inicio_real"]}

    out = {
        "disponivel": True,
        "pessoas": n, "mensagens": total,
        "msgs_por_pessoa": round(total / n, 2),
        "mediana_msgs": statistics.median(por.values()),
        "uma_vez": {"n": sum(1 for c in por.values() if c == 1)},
        "voltaram": voltaram,
        "composicao": [{"tipo": t, **comp[t]} for t in ordem if comp[t]["pessoas"]],
        "faixas": [{"faixa": f, "n": sum(1 for c in por.values() if a <= c <= b)} for f, a, b in faixas],
        "top10pct": {"pessoas": k10, "pct_msgs": round(100 * sum(contagens[:k10]) / total, 1)},
    }
    out["uma_vez"]["pct"] = round(100 * out["uma_vez"]["n"] / n, 1)
    if versao == "interna":
        top = por.most_common(8)
        hs = _handles(con, [p for p, _ in top])
        out["top"] = [{"autor": _rotulo_autor(hs, pid), "msgs": c,
                       "selo": {"membros": "membro", "moderadores": "moderador", "dono": "dono"}.get(tipo(pid))}
                      for pid, c in top]
    return out


# ---------------------------------------------------------------- apoio

RE_PRESENTE = re.compile(r"\b(?:gifted|presenteou)\s+(\d+)", re.I)


def apoio(con, video_id, versao):
    rows = _chat(con, video_id)
    s = serie_live(con, video_id)
    jan = _janelas5(*(_faixa_tempo(s) or (0, 0)))
    pagos = [r for r in rows if r["tipo"] in TIPOS_APOIO and r["valor_micros"]]
    serie5 = [0.0] * len(jan)
    por_pessoa = defaultdict(lambda: {"brl": 0.0, "qtd": 0, "msg": None})
    moedas = defaultdict(lambda: {"n": 0, "brl": 0.0})
    sem_cambio = 0
    valores = []
    for r in pagos:
        brl = para_brl(con, r["valor_micros"], r["moeda"], r["publicado_em"])
        moedas[r["moeda"] or "?"]["n"] += 1
        if brl is None:
            sem_cambio += 1
            continue
        moedas[r["moeda"] or "?"]["brl"] += brl
        valores.append(brl)
        serie5[_idx5(jan, r["o"])] += brl
        p = por_pessoa[r["autor_pid"]]
        p["brl"] += brl
        p["qtd"] += 1
        if r["tipo"] == "superChatEvent" and r["texto"]:
            p["msg"] = r["texto"]

    novos = [r for r in rows if r["tipo"] == "newSponsorEvent"]
    niveis = Counter(((_bruto(r).get("newSponsorDetails") or {}).get("memberLevelName")) for r in novos)
    presentes = defaultdict(int)
    for r in rows:
        if r["tipo"] == "membershipGiftingEvent":
            det = _bruto(r).get("membershipGiftingDetails") or {}
            n = det.get("giftMembershipsCount")
            if n is None:
                m = RE_PRESENTE.search(r["texto"] or "")
                n = int(m.group(1)) if m else 1
            presentes[r["autor_pid"]] += int(n)
    marcos = [r for r in rows if r["tipo"] == "memberMilestoneChatEvent"]
    meses = [((_bruto(r).get("memberMilestoneChatDetails") or {}).get("memberMonth")) for r in marcos]
    meses = [int(m) for m in meses if m]

    faixas = [("até R$ 9", 0, 10), ("R$ 10 a 19", 10, 20), ("R$ 20 a 49", 20, 50), ("R$ 50 a 99", 50, 100), ("R$ 100 ou mais", 100, 1e12)]
    out = {
        "total_brl": round(sum(valores), 2),
        "superchats": sum(1 for r in pagos if r["tipo"] == "superChatEvent"),
        "superstickers": sum(1 for r in pagos if r["tipo"] == "superStickerEvent"),
        "pessoas_pagantes": len(por_pessoa),
        "sem_cambio": sem_cambio,
        "novos_membros": len(novos),
        "niveis": [{"nivel": k, "n": v} for k, v in niveis.most_common()] ,
        "presentes": {"assinaturas": sum(presentes.values()), "pessoas": len(presentes)},
        "marcos": {"n": len(marcos), "max_meses": max(meses) if meses else None},
        "serie5": [{"t": t, "brl": round(v, 2)} for t, v in zip(jan, serie5)],
        "faixas": [{"faixa": f, "n": sum(1 for v in valores if a <= v < b)} for f, a, b in faixas],
        "moedas": [{"moeda": k, **v} for k, v in sorted(moedas.items(), key=lambda kv: -kv[1]["n"])],
    }
    if versao == "interna":
        top = sorted(por_pessoa.items(), key=lambda kv: -kv[1]["brl"])[:5]
        hs = _handles(con, [p for p, _ in top] + list(presentes))
        out["apoiadores"] = [{"autor": _rotulo_autor(hs, pid), "brl": round(v["brl"], 2), "qtd": v["qtd"], "msg": v["msg"]} for pid, v in top]
        out["presenteadores"] = [{"autor": _rotulo_autor(hs, pid), "n": v} for pid, v in sorted(presentes.items(), key=lambda kv: -kv[1])]
    return out


# ---------------------------------------------------------------- comunidade

def comunidade(con, video_id, versao):
    enquetes = []
    vistas = set()
    for e in con.execute("SELECT * FROM enquete WHERE video_id=? ORDER BY offset_segundos", (video_id,)):
        vistas.add(e["enquete_id"])
        try:
            opcoes = json.loads(e["opcoes"] or "[]")
        except ValueError:
            opcoes = []
        status = e["status"]
        if not status:  # gravada antes de o status ser lido do lugar certo
            try:
                status = json.loads(e["bruto"] or "{}").get("status")
            except ValueError:
                status = None
        # a mesma enquete pode chegar com dois ids no mesmo instante (a CazeTV
        # republica): fica a leitura com mais votos
        ant = enquetes[-1] if enquetes else None
        if ant and ant["pergunta"] == e["pergunta"] and abs((e["offset_segundos"] or 0) - (ant["t"] or 0)) <= 120:
            if (e["total_votos"] or 0) > (ant["total"] or 0):
                ant.update({"opcoes": opcoes, "total": e["total_votos"], "status": status})
            continue
        enquetes.append({"t": e["offset_segundos"], "pergunta": e["pergunta"], "status": status,
                         "opcoes": opcoes, "total": e["total_votos"], "detalhe": True})
    # pollEvent gravado antes do coletor ler pollDetails: a enquete aconteceu,
    # mas pergunta e votos nao foram guardados
    for m in con.execute("SELECT msg_id, offset_segundos FROM mensagem WHERE video_id=? AND tipo='pollEvent'", (video_id,)):
        if m["msg_id"] not in vistas:
            enquetes.append({"t": m["offset_segundos"], "pergunta": None, "opcoes": [], "total": None, "detalhe": False})
    return {"enquetes": sorted(enquetes, key=lambda e: e["t"] or 0)}


# ---------------------------------------------------------------- video e canal

def _ficha(b):
    snip, cd, td, st = b.get("snippet") or {}, b.get("contentDetails") or {}, b.get("topicDetails") or {}, b.get("status") or {}
    topicos = [u.rsplit("/", 1)[-1].replace("_", " ") for u in td.get("topicCategories") or []]
    sim_nao = lambda v: None if v is None else ("sim" if v else "não")
    lang = snip.get("defaultAudioLanguage")
    return [
        {"k": "Categoria", "v": CATEGORIAS.get(snip.get("categoryId"), snip.get("categoryId"))},
        {"k": "Idioma do áudio", "v": IDIOMAS_AUDIO.get(lang, lang)},
        {"k": "Qualidade", "v": {"hd": "HD", "sd": "SD"}.get(cd.get("definition"))},
        {"k": "Legendas", "v": {"true": "sim", "false": "não"}.get(cd.get("caption"))},
        {"k": "Tags", "v": str(len(snip["tags"])) if snip.get("tags") is not None else "0"},
        {"k": "Tópicos do YouTube", "v": ", ".join(topicos) or None},
        {"k": "Feito para crianças", "v": sim_nao(st.get("madeForKids"))},
        {"k": "Incorporável em sites", "v": sim_nao(st.get("embeddable"))},
    ]


def video(con, video_id, versao):
    l = _live(con, video_id)
    snaps = con.execute("SELECT * FROM video_snapshot WHERE video_id=? ORDER BY coletado_em", (video_id,)).fetchall()
    com_bruto = [x for x in snaps if x["bruto"]]
    ultimo = _bruto(com_bruto[-1]) if com_bruto else {}
    publicado = (ultimo.get("snippet") or {}).get("publishedAt")
    ag, ini, fim = yt.parse_ts(l["agendada_para"]), yt.parse_ts(l["inicio_real"]), yt.parse_ts(l["fim_real"])
    pub = yt.parse_ts(publicado)

    # curtidas: o contador publico lido junto com os espectadores
    s = serie_live(con, video_id)
    likes = None
    if s and ini:
        rows = con.execute("SELECT offset_segundos o, likes FROM snapshot_audiencia WHERE video_id=? AND likes IS NOT NULL ORDER BY o",
                           (video_id,)).fetchall()
        if rows:
            por = {}
            for r in rows:
                por[r["o"] // 60 * 60] = r["likes"]
            likes, ult = [], None
            for t in s["t"]:
                ult = por.get(t, None)
                likes.append(ult)

    # mudancas de titulo e thumbnail entre leituras consecutivas
    mudancas = []
    durante = [x for x in snaps if x["fase"] == "durante"]
    for a, b in zip(durante, durante[1:]):
        for campo, nome in (("titulo", "título"), ("thumb_url", "thumbnail")):
            if a[campo] and b[campo] and a[campo] != b[campo]:
                tb = yt.parse_ts(b["coletado_em"])
                mudancas.append({"t": int((tb - ini).total_seconds()) if ini and tb else None, "quando": b["coletado_em"],
                                 "tipo": nome, "de": a[campo] if campo == "titulo" else "imagem anterior",
                                 "para": b[campo] if campo == "titulo" else "imagem nova", "depois_da_live": False})
    # titulo de hoje diferente do que estava no ar: mudou depois da live
    if snaps and l["titulo"] and snaps[-1]["titulo"] and snaps[-1]["titulo"] != l["titulo"] and not durante:
        mudancas.append({"t": None, "quando": None, "tipo": "título", "de": l["titulo"], "para": snaps[-1]["titulo"], "depois_da_live": True})

    canal = {r["fase"]: r for r in con.execute(
        "SELECT * FROM canal_snapshot WHERE canal_id=? AND (video_id=? OR video_id IS NULL) ORDER BY coletado_em",
        (l["canal_id"], video_id))}
    return {
        "horarios": {
            "publicado": publicado, "agendada": l["agendada_para"], "inicio": l["inicio_real"], "fim": l["fim_real"],
            "duracao_s": l["duracao_segundos"],
            "atraso_s": int((ini - ag).total_seconds()) if ini and ag else None,
            # publishedAt de uma live vira a data do video gravado depois do
            # fim; so conta como antecedencia se for antes do horario marcado
            "antecedencia_s": int((ag - pub).total_seconds()) if ag and pub and pub < ag else None,
        },
        "likes": likes, "t": s["t"] if s else None,
        "likes_hoje": snaps[-1]["likes"] if snaps else None,
        "mudancas": mudancas,
        "mudancas_monitoradas": bool(durante),
        "video_inteiro": "~" in video_id,
        "inscritos": {
            "antes": canal["antes"]["inscritos"] if "antes" in canal else None,
            "depois": canal["depois"]["inscritos"] if "depois" in canal else None,
            "hoje": canal["avulsa"]["inscritos"] if "avulsa" in canal else None,
            "hoje_em": canal["avulsa"]["coletado_em"] if "avulsa" in canal else None,
        },
        "ficha": _ficha(ultimo) if com_bruto else None,
    }


# ---------------------------------------------------------------- depois da live

def depois(con, video_id, versao):
    l = _live(con, video_id)
    snaps = con.execute("SELECT * FROM video_snapshot WHERE video_id=? ORDER BY coletado_em", (video_id,)).fetchall()
    pos = {x["rotulo"]: x for x in snaps if x["fase"] == "pos"}
    fim_coleta = con.execute(
        "SELECT views, comentarios, coletado_em FROM estatistica_final WHERE video_id=? ORDER BY coletado_em DESC LIMIT 1",
        (video_id,)).fetchone()
    pontos = [{"rotulo": "ao fim", "views": None, "coletado_em": None}]
    if l["fim_real"] and fim_coleta and l["coleta_fim"] and fim_coleta["coletado_em"] >= l["fim_real"]:
        pontos[0] = {"rotulo": "ao fim", "views": fim_coleta["views"], "coletado_em": fim_coleta["coletado_em"]}
    fim = yt.parse_ts(l["fim_real"]) if l["fim_real"] else None
    for rot in ("+1 h", "+6 h", "+24 h", "+2 d", "+3 d", "+5 d", "+7 d"):
        x = pos.get(rot)
        # quanto depois do fim a leitura foi feita de verdade: com o vigia
        # parado na hora marcada, ela sai atrasada, e a tela diz isso
        lido = yt.parse_ts(x["coletado_em"]) if x else None
        pontos.append({"rotulo": rot, "views": x["views"] if x else None, "coletado_em": x["coletado_em"] if x else None,
                       "depois_s": int((lido - fim).total_seconds()) if lido and fim else None})
    hoje = next((x for x in reversed(snaps) if x["fase"] == "avulsa"), None)
    ultimo = snaps[-1] if snaps else None
    out = {
        "pontos": pontos,
        "fim_coleta": {"views": fim_coleta["views"], "coletado_em": fim_coleta["coletado_em"]} if fim_coleta else None,
        "hoje": {"views": hoje["views"], "likes": hoje["likes"], "comentarios": hoje["comentarios"], "coletado_em": hoje["coletado_em"]} if hoje else None,
        "comentarios": ultimo["comentarios"] if ultimo else None,
        "acompanhado": bool(pos),
        # trecho de um video que carregou mais de uma transmissao: estes
        # numeros sao do video inteiro (o YouTube nao separa views por trecho)
        "video_inteiro": "~" in video_id,
    }
    if versao == "interna":
        rows = con.execute("SELECT * FROM comentario_top WHERE video_id=? ORDER BY likes DESC LIMIT 4", (video_id,)).fetchall()
        hs = _handles(con, [r["autor_pid"] for r in rows])
        out["top_comentarios"] = [{"autor": _rotulo_autor(hs, r["autor_pid"]), "texto": r["texto"], "likes": r["likes"],
                                   "respostas": r["respostas"]} for r in rows]
    return out


# ---------------------------------------------------------------- comparacao

def comparacao(con, video_id, versao, n_anteriores=5):
    l = _live(con, video_id)
    pubs = {r["video_id"]: r for r in con.execute("SELECT * FROM video_publico WHERE canal_id=?", (l["canal_id"],))}
    ini = l["inicio_real"] or ""
    anteriores = sorted((r for r in pubs.values() if (r["inicio"] or "") < ini and r["video_id"] != video_id),
                        key=lambda r: r["inicio"], reverse=True)[:n_anteriores]
    coleta = {r["video_id"]: r for r in con.execute("SELECT video_id, coleta_inicio, status, detectada_em, fim_real FROM live WHERE canal_id=?", (l["canal_id"],))}

    def linha(r, esta=False):
        a, b, ag = yt.parse_ts(r["inicio"]), yt.parse_ts(r["fim"]), yt.parse_ts(r["agendada_para"])
        c = coleta.get(r["video_id"])
        if c and c["coleta_inicio"]:
            st = "coletada"
        elif c and c["detectada_em"] and c["fim_real"] and c["detectada_em"] <= c["fim_real"]:
            st = "perdida"
        else:
            st = "não vigiada"
        return {"id": r["video_id"], "inicio": r["inicio"], "titulo": r["titulo"], "views": r["views"], "likes": r["likes"],
                "comentarios": r["comentarios"], "duracao_s": int((b - a).total_seconds()) if a and b else None,
                "atraso_s": int((a - ag).total_seconds()) if a and ag else None, "coleta": st, "esta": esta}

    esta = pubs.get(video_id)
    if not esta:
        snap = con.execute("SELECT * FROM video_snapshot WHERE video_id=? ORDER BY coletado_em DESC LIMIT 1", (video_id,)).fetchone()
        esta = {"video_id": video_id, "inicio": l["inicio_real"], "fim": l["fim_real"], "agendada_para": l["agendada_para"],
                "titulo": l["titulo"], "views": snap["views"] if snap else None, "likes": snap["likes"] if snap else None,
                "comentarios": snap["comentarios"] if snap else None}
    lives = [linha(r) for r in reversed(anteriores)] + [linha(esta, True)]

    conc = None
    rows = con.execute("SELECT * FROM concorrencia WHERE video_id=? ORDER BY coletado_em", (video_id,)).fetchall()
    if rows:
        # a leitura mais proxima do pico desta transmissao
        pico = con.execute("SELECT offset_segundos FROM snapshot_audiencia WHERE video_id=? ORDER BY espectadores DESC LIMIT 1",
                           (video_id,)).fetchone()
        alvo = pico["offset_segundos"] if pico else 0
        quando = min({r["coletado_em"]: r["offset_segundos"] for r in rows}.items(), key=lambda kv: abs((kv[1] or 0) - alvo))[0]
        lista = sorted((r for r in rows if r["coletado_em"] == quando), key=lambda r: -r["espectadores"])
        tot = sum(r["espectadores"] for r in lista)
        conc = {"quando": quando, "total": tot,
                "lista": [{"canal": r["rival_canal"], "titulo": r["titulo"], "espectadores": r["espectadores"],
                           "esta": r["rival_video_id"] == video_id} for r in lista[:6]]}
    pub_hoje = max((r["coletado_em"] for r in pubs.values()), default=None)
    return {"lives": lives, "contadores_em": pub_hoje, "concorrencia": conc}


SECOES = {
    "momentos": momentos, "conversa": conversa, "moderacao": moderacao, "pessoas": pessoas,
    "apoio": apoio, "comunidade": comunidade, "video": video, "depois": depois, "comparacao": comparacao,
}
