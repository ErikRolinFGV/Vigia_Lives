"""
Dossie da transmissao: a leitura de como a live performou.

O texto e fixo (regra-v2): frases escritas a mao, escolhidas pelo que os
numeros mostram, com cada numero calculado da coleta. A v2 le tambem a
ficha das outras lives coletadas do canal (api/ficha.py): o veredito diz
onde esta live fica no historico, nao so como ela foi sozinha. Nenhuma
mensagem de chat entra aqui, so agregados; quando um modelo de linguagem
entrar, ele recebe exatamente estes mesmos agregados (ENTRADA) e grava ao
lado com outro `modelo`, sem tocar no dado.
"""
import json
import statistics

from collector import db

from . import secoes
from .transmissoes import acompanhada_pct, janela_coletada_s, medir, serie as serie_live

MODELO = "regra-v2"

ENTRADA = [
    "As séries agregadas: espectadores, mensagens por minuto e participação por janela de 60 s",
    "Os totais, os momentos detectados, a enquete e a cobertura",
    "O apoio pago agregado (valores e contagens, sem autor)",
    "A ficha agregada das outras lives coletadas do canal: posição e mediana de cada métrica",
    "Enquetes do canal (pergunta e votos), views depois da live e a distribuição de mensagens por pessoa",
]
NAO_ENTRADA = [
    "O texto das mensagens do chat",
    "Qualquer identificador de autor, mesmo pseudonimizado",
    "Mensagens ou autores de outras transmissões (delas entra só a ficha agregada)",
]


def _br(v, casas=0):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def _hhmm(s):
    return f"{s // 3600}:{(s % 3600) // 60:02d}"


def _dur(s):
    if s is None:
        return "—"
    h, m = s // 3600, round((s % 3600) / 60)
    return f"{m} min" if h == 0 else f"{h}h{m:02d}"


def metricas(con, video_id):
    l = medir(con, con.execute("SELECT * FROM live WHERE video_id=?", (video_id,)).fetchone())
    s = serie_live(con, video_id)
    chat = secoes._chat(con, video_id)
    m = {
        "pico": con.execute("SELECT MAX(espectadores) FROM snapshot_audiencia WHERE video_id=?", (video_id,)).fetchone()[0],
        "mensagens": len(chat),
        "pessoas": len(set(r["autor_pid"] for r in chat)),
        "cobertura": l["cobertura_pct"],
        "acompanhada": acompanhada_pct(l),
        "janela_s": janela_coletada_s(l),
        "duracao_s": l["duracao_segundos"],
        "momentos": [dict(r) for r in con.execute(
            "SELECT offset_segundos t, tipo, magnitude FROM momento WHERE video_id=? AND offset_segundos >= 0 ORDER BY offset_segundos",
            (video_id,))],
        "serie": s,
    }
    if s:
        idx = [i for i, v in enumerate(s["esp"]) if v is not None]
        k = max(3, min(15, len(idx) // 6))
        ini, fim = idx[:k], idx[-k:]
        mean = lambda xs: statistics.fmean(xs) if xs else None
        m["esp_ini"] = mean([s["esp"][i] for i in ini])
        m["esp_fim"] = mean([s["esp"][i] for i in fim])
        m["part_ini"] = mean([s["part"][i] for i in ini if s["part"][i] is not None])
        m["part_fim"] = mean([s["part"][i] for i in fim if s["part"][i] is not None])
        m["janela_media_min"] = k
        tot = sum(s["mpm"])
        acc, metade = 0, 0
        for i, v in enumerate(s["mpm"]):
            acc += v
            if acc >= tot / 2:
                metade = i
                break
        m["metade_t"] = s["t"][metade]
        m["metade_frac"] = metade / len(s["mpm"])
        m["mediana_mpm"] = sorted(s["mpm"])[len(s["mpm"]) // 2]
        m["max_mpm"] = max(s["mpm"])
        janelas = set()
        for mo in m["momentos"]:
            if mo["tipo"] == "pico_chat" and mo["magnitude"] >= 2:
                i = next((j for j, t in enumerate(s["t"]) if t <= mo["t"] < t + 60), None)
                if i is not None:
                    janelas.update({i - 1, i, i + 1})
        m["pct_em_momentos"] = 100 * sum(s["mpm"][j] for j in janelas if 0 <= j < len(s["mpm"])) / tot if tot else 0
        m["n_momentos_chat"] = sum(1 for mo in m["momentos"] if mo["tipo"] == "pico_chat")
    m["apoio"] = secoes.apoio(con, video_id, "publica")
    return m


def redigir(con, video_id):
    """O dossie v2: o v1 (a live sozinha) mais a live contra o historico."""
    from . import ficha, trechos  # ficha importa este modulo
    # a ficha de todas as lives troca as visoes de trecho da conexao: depois
    # dela, prepara de novo a desta live
    todas = ficha.todas(con)
    trechos.preparar(con, video_id)
    alvo = next((f for f in todas if f["id"] == video_id), None)
    pos = ficha.posicoes(todas, alvo)["canal"] if alvo else None
    v1 = _redigir_v1(con, video_id)
    return _redigir_v2(con, video_id, v1, alvo, pos)


# metricas que entram no veredito contra o historico, com o nome no texto
CHAVE_HIST = [("pico", "pico de audiência", "int"), ("media", "audiência média", "int"),
              ("participacao", "participação no chat", "pct2"), ("mpm", "mensagens por minuto", "dec1"),
              ("crescimento", "crescimento da audiência", "x"), ("views_24h", "views em 24 h", "int")]
HISTORICO_MIN = 3


def _fmt(v, f):
    if v is None:
        return "—"
    if f == "int":
        return _br(v)
    if f == "dec1":
        return _br(v, 1)
    if f == "pct2":
        return _br(v, 2) + "%"
    return _br(v, 0 if v >= 10 else 1) + "×"


def _historico(alvo, pos):
    """Metricas-chave em que a live tem posicao num historico de 3 ou mais."""
    hist = []
    for k, nome, f in CHAVE_HIST:
        p = pos["metricas"].get(k)
        v = alvo["valores"].get(k)
        if p and p["posicao"] and p["n"] >= HISTORICO_MIN and v is not None and p["min"] < p["max"]:
            hist.append({"k": k, "nome": nome, "f": f, "v": v, **p})
    return hist


def _redigir_v2(con, video_id, v1, alvo, pos):
    canal = alvo["canal"] if alvo else "o canal"
    hist = _historico(alvo, pos) if alvo and pos else []
    n_hist = max((h["n"] for h in hist), default=0)
    topo = [h for h in hist if h["posicao"] == 1 and h["empatadas"] == 1]
    fundo = [h for h in hist if h["posicao"] == h["n"] and h["empatadas"] == 1]

    def lista(hs):
        return " e ".join(h["nome"] for h in hs[:2])

    if not hist:
        veredito = v1["veredito"]
        sub = (f"{v1['veredito_sub']} Ainda não há {HISTORICO_MIN} lives coletadas de {canal} para comparar; "
               "a próxima coleta já entra no histórico.")
    else:
        if topo and fundo:
            veredito = f"1ª em {lista(topo)} entre as {n_hist} lives coletadas de {canal}, última em {lista(fundo)}."
        elif topo:
            veredito = f"1ª em {lista(topo)} entre as {n_hist} lives coletadas de {canal}."
        elif fundo:
            veredito = f"Última em {lista(fundo)} entre as {n_hist} lives coletadas de {canal}."
        else:
            veredito = (f"No meio do histórico de {canal}: nenhuma métrica-chave foi a maior nem a menor "
                        f"entre as {n_hist} lives coletadas.")
        sub = f"{v1['veredito']} {v1['veredito_sub']}"

    ins = []
    if hist:
        partes = []
        for h in hist[:5]:
            rel = (h["v"] - h["mediana"]) / h["mediana"] if h["mediana"] else None
            if rel is None:
                comp = ""
            elif abs(rel) < 0.05:
                comp = ", na mediana"
            else:
                comp = f", {_br(abs(100 * rel))}% {'acima' if rel > 0 else 'abaixo'} da mediana"
            partes.append(f"{h['nome']} de {_fmt(h['v'], h['f'])} ({h['posicao']}ª de {h['n']}{comp})")
        texto = "; ".join(partes)
        ins.append({"titulo": "Contra o histórico do canal", "texto": texto[0].upper() + texto[1:] + ".",
                    "base": f"ficha das lives coletadas de {canal}"})

    # o v1 continua valendo para a live sozinha (chat, momentos, apoio, cobertura)
    ins += v1["insights"]

    com = secoes.comunidade(con, video_id, "publica")["enquetes"]
    com_det = [e for e in com if e["detalhe"]]
    if com:
        txt = f"{len(com)} enquete{'s' if len(com) > 1 else ''} no chat"
        votos = sum(e["total"] or 0 for e in com_det)
        if votos:
            mais = max(com_det, key=lambda e: e["total"] or 0)
            txt += (f", com {_br(votos)} votos no total. A mais votada, às {_hhmm(mais['t'] or 0)}, foi "
                    f"“{mais['pergunta']}” ({_br(mais['total'])} votos).")
        else:
            txt += "."
        pe_enq = pos["metricas"].get("enquetes") if pos else None
        if pe_enq and pe_enq["n"] >= HISTORICO_MIN:
            txt += f" No canal, a mediana é de {_br(pe_enq['mediana'])} por live."
        ins.append({"titulo": "Enquetes", "texto": txt, "base": "enquetes do canal no chat"})

    pe = secoes.pessoas(con, video_id, "publica")
    if pe.get("disponivel"):
        ins.append({"titulo": "Quem sustenta a conversa",
                    "texto": (f"Os 10% mais ativos ({_br(pe['top10pct']['pessoas'])} pessoas) escreveram "
                              f"{_br(pe['top10pct']['pct_msgs'], 1)}% das mensagens; "
                              f"{_br(pe['uma_vez']['pct'], 1)}% das pessoas escreveram uma vez só."),
                    "base": "mensagens por pessoa"})

    dep = secoes.depois(con, video_id, "publica")
    pts = {p["rotulo"]: p["views"] for p in dep["pontos"]}
    if pts.get("+24 h"):
        base_v = pts.get("ao fim") or pts.get("+1 h")
        rot_base = "ao fim da live" if pts.get("ao fim") else "1 h depois"
        txt = f"O vídeo tinha {_br(pts['+24 h'])} views 24 h depois do fim"
        if base_v:
            txt += f", {_br(100 * (pts['+24 h'] - base_v) / base_v)}% a mais do que {rot_base} ({_br(base_v)})"
        pico = alvo["valores"].get("pico") if alvo else None
        if pico:
            txt += f": {_br(pts['+24 h'] / pico, 1)} vezes o pico ao vivo"
        txt += "."
        if dep["video_inteiro"]:
            txt += " Os números são do vídeo inteiro, que carregou mais de uma transmissão."
        ins.append({"titulo": "Depois da live", "texto": txt, "base": "leituras de depois da live"})

    def achado(k, rotulo, cor):
        h = next((x for x in hist if x["k"] == k), None)
        if not h:
            return None
        return {"rotulo": rotulo, "valor": _fmt(h["v"], h["f"]), "unidade": f"{h['posicao']}ª de {h['n']} no canal",
                "cor": cor, "bar": 100 * (h["n"] - h["posicao"] + 1) / h["n"],
                "texto": f"Mediana do canal: {_fmt(h['mediana'], h['f'])}. Menor {_fmt(h['min'], h['f'])}, maior {_fmt(h['max'], h['f'])}."}

    achados = [a for a in (achado("participacao", "Participação", "msg"), achado("pico", "Pico de audiência", "aud"),
                           achado("views_24h", "Views em 24 h", "part") or achado("mpm", "Mensagens por minuto", "part")) if a]
    if len(achados) < 3:
        usados = {a["rotulo"] for a in achados}
        achados += [a for a in v1["achados"] if a["rotulo"] not in usados][:3 - len(achados)]

    ks_topo, ks_fundo = {h["k"] for h in topo}, {h["k"] for h in fundo}
    if hist and "participacao" in ks_topo:
        recomendacao = ("A conversa engajou acima de todo o histórico do canal. Os momentos detectados são o melhor ponto de partida "
                        "para recortes e para ativações dentro do chat, que aqui encontram público escrevendo, não só assistindo.")
    elif hist and "participacao" in ks_fundo and ks_topo & {"pico", "media"}:
        recomendacao = ("Muita gente assistindo, pouca escrevendo: ação de marca dentro do chat rende menos aqui do que a audiência "
                        "sugere. Inserção em tela acompanha melhor o pico.")
    elif hist and "participacao" in ks_fundo:
        recomendacao = ("A participação ficou no fundo do histórico do canal. Vale comparar lado a lado com a live de maior "
                        "participação para ver se a diferença está no horário, no conteúdo ou na audiência.")
    else:
        recomendacao = v1["recomendacao"]

    return {"veredito": veredito, "veredito_sub": sub, "insights": ins, "recomendacao": recomendacao,
            "achados": achados, "entrada": ENTRADA, "nao_entrada": NAO_ENTRADA}


def _redigir_v1(con, video_id):
    m = metricas(con, video_id)
    s = m["serie"]
    ins = []
    cresc = m.get("esp_fim") / m["esp_ini"] if s and m.get("esp_ini") else None
    queda = m["part_ini"] / m["part_fim"] if s and m.get("part_ini") and m.get("part_fim") else None
    dois_publicos = cresc is not None and queda is not None and cresc >= 3 and queda >= 2
    k = m.get("janela_media_min")

    if dois_publicos:
        veredito = f"A audiência multiplicou por {_br(cresc)}. A conversa não acompanhou."
        sub = (f"Os espectadores foram de {_br(m['esp_ini'])} para {_br(m['esp_fim'])} (média dos {k} primeiros e dos {k} últimos minutos coletados), "
               f"enquanto a fração que escrevia no chat caiu de {_br(100 * m['part_ini'], 2)}% para {_br(100 * m['part_fim'], 2)}%. "
               "Quem entrou depois veio assistir, não conversar — e a curva de audiência sozinha não separa um público do outro.")
        ins.append({"titulo": "Dois públicos, não um",
                    "texto": f"A audiência multiplicou por {_br(cresc, 1)} enquanto a fração que escrevia caiu de {_br(100 * m['part_ini'], 2)}% para {_br(100 * m['part_fim'], 2)}%. Quem entrou no fim veio assistir, não conversar.",
                    "base": "curvas de audiência e participação"})
        recomendacao = ("Ativação de marca e conteúdo social pedem janelas diferentes: a audiência é máxima no fim, enquanto a conversa se concentra "
                        "nos picos de reação. Medir as duas pela curva de espectadores subestima uma delas.")
    elif s and not m["n_momentos_chat"]:
        part = 100 * m["pessoas"] / m["pico"] if m["pico"] else None
        veredito = "Audiência estável, conversa contínua."
        sub = (f"Pico de {_br(m['pico'])} pessoas" + (f" e {_br(part, 1)}% delas escreveram no chat" if part is not None else "") +
               ", sem nenhum pico de reação acima do limiar de detecção. A ausência de momentos é o resultado, não uma falha da coleta.")
        recomendacao = ("Comparar com uma segunda coleta do mesmo canal antes de concluir tendência: um ponto só não distingue a natureza "
                        "do programa de uma eventualidade do dia.")
    else:
        veredito = "Audiência e conversa andaram juntas." if cresc and cresc >= 1.5 else "A conversa teve momentos, a audiência ficou estável."
        sub = (f"Pico de {_br(m['pico'])} pessoas e {_br(m['mensagens'])} mensagens de {_br(m['pessoas'])} pessoas" if m["pico"]
               else f"{_br(m['mensagens'])} mensagens de {_br(m['pessoas'])} pessoas") + " na janela coletada."
        recomendacao = "Os momentos detectados são o melhor ponto de partida para recortes: cada um tem link para o instante no vídeo."

    if s:
        if m["metade_frac"] >= 0.6:
            ins.append({"titulo": "O chat carrega para o fim",
                        "texto": f"Metade das {_br(m['mensagens'])} mensagens só foi escrita depois de {_hhmm(m['metade_t'])}, com {_br(100 * m['metade_frac'])}% da coleta já passada.",
                        "base": "mensagens acumuladas"})
        else:
            ins.append({"titulo": "O chat se espalha pela transmissão",
                        "texto": f"Metade das {_br(m['mensagens'])} mensagens já tinha sido escrita às {_hhmm(m['metade_t'])}, com {_br(100 * m['metade_frac'])}% da coleta passada.",
                        "base": "mensagens acumuladas"})
        picos = [mo for mo in m["momentos"] if mo["tipo"] == "pico_chat"]
        if picos:
            forte = max(picos, key=lambda mo: mo["magnitude"])
            vezes = m["max_mpm"] / m["mediana_mpm"] if m["mediana_mpm"] else None
            ins.append({"titulo": "A reação é concentrada, não difusa",
                        "texto": f"A janela mediana teve {_br(m['mediana_mpm'])} mensagens por minuto e o pico chegou a {_br(m['max_mpm'])}"
                                 + (f" — {_br(vezes, 1)} vezes a mediana" if vezes else "") + f". O momento mais forte, às {_hhmm(forte['t'])}, marcou {_br(forte['magnitude'], 1)} σ.",
                        "base": "histograma e detecção por z-score"})
        else:
            ins.append({"titulo": "Conversa sem picos",
                        "texto": "Nenhuma janela de 60 s passou do limiar de detecção. A ausência de momentos é o resultado, não falha de coleta.",
                        "base": "detecção por z-score"})

    a = m["apoio"]
    if a["total_brl"] > 0:
        maior = max(a["serie5"], key=lambda x: x["brl"])
        ins.append({"titulo": "O apoio pago tem hora",
                    "texto": f"R$ {_br(a['total_brl'], 2)} em Super Chat e Super Sticker, com o maior bloco (R$ {_br(maior['brl'], 2)}) entre {_hhmm(maior['t'])} e {_hhmm(maior['t'] + 300)}. "
                             f"Entraram {_br(a['novos_membros'])} novos membros e {_br(a['presentes']['assinaturas'])} assinaturas foram presenteadas.",
                    "base": "apoio financeiro"})
    else:
        nm, pr = a["novos_membros"], a["presentes"]["assinaturas"]
        membros = "nenhum novo membro entrou" if not nm else f"entraram {_br(nm)} novo{'s' if nm > 1 else ''} membro{'s' if nm > 1 else ''}"
        presentes = "nenhuma assinatura foi presenteada" if not pr else (
            "1 assinatura foi presenteada" if pr == 1 else f"{_br(pr)} assinaturas foram presenteadas")
        ins.append({"titulo": "Sem apoio pago nesta live",
                    "texto": f"R$ 0,00 em Super Chat e Super Sticker durante a transmissão; {membros} e {presentes}.",
                    "base": "apoio financeiro"})

    l = con.execute("SELECT status, coleta_fim FROM live WHERE video_id=?", (video_id,)).fetchone()
    if l["status"] == "ao_vivo" and l["coleta_fim"]:
        ins.append({"titulo": "A coleta parou com a live no ar",
                    "texto": f"O coletor acompanhou {_dur(m['janela_s'])} e foi encerrado com a transmissão ainda no ar. Tudo acima vale para essa janela.",
                    "base": "cobertura"})
    elif m["acompanhada"] is not None and m["acompanhada"] < 90:
        ins.append({"titulo": "A coleta cobre parte da transmissão",
                    "texto": f"O coletor acompanhou {_dur(m['janela_s'])} de {_dur(m['duracao_s'])} no ar ({_br(m['acompanhada'], 1)}%). Tudo acima vale para essa janela, não para a live inteira.",
                    "base": "cobertura"})

    # achados: tres numeros grandes
    if dois_publicos:
        achados = [
            {"rotulo": "Crescimento de audiência", "valor": f"{_br(cresc, 1)}×", "unidade": f"de {_br(m['esp_ini'])} a {_br(m['esp_fim'])}", "cor": "aud", "bar": 100,
             "texto": f"O pico de {_br(m['pico'])} pessoas assistindo ao mesmo tempo veio no fim da janela coletada."},
            {"rotulo": "Queda de participação", "valor": f"{_br(queda, 1)}×", "unidade": "menor no fim", "cor": "msg", "bar": min(100, 100 / queda),
             "texto": f"De {_br(100 * m['part_ini'], 2)}% para {_br(100 * m['part_fim'], 2)}% dos espectadores escrevendo. Em números absolutos o chat cresceu; em proporção, encolheu."},
        ]
    else:
        part = 100 * m["pessoas"] / m["pico"] if m["pico"] else None
        achados = [
            {"rotulo": "Participação", "valor": f"{_br(part, 1)}%" if part is not None else "—", "unidade": "do pico escreveu", "cor": "msg", "bar": min(100, (part or 0) * 20),
             "texto": f"{_br(m['pessoas'])} pessoas escreveram no chat para um pico de {_br(m['pico'])} assistindo." if m["pico"] else "Sem leitura de espectadores."},
            {"rotulo": "Momentos detectados", "valor": _br(len(m["momentos"])), "unidade": "acima do limiar", "cor": "ink3", "bar": min(100, 15 * len(m["momentos"])),
             "texto": "Nenhuma janela de 60 s se destacou da média móvel." if not m["momentos"] else "Cada um tem link para o instante no vídeo."},
        ]
    if s and m["n_momentos_chat"]:
        achados.append({"rotulo": "Conversa concentrada", "valor": f"{_br(m['pct_em_momentos'])}%", "unidade": f"do chat em {m['n_momentos_chat']} momentos", "cor": "part",
                        "bar": m["pct_em_momentos"], "texto": "As janelas em torno dos picos detectados concentram essa fatia de todas as mensagens. Fora delas, o chat é fundo constante."})
    else:
        achados.append({"rotulo": "Cobertura", "valor": f"{_br(m['cobertura'] or 0, 1)}%", "unidade": "da janela coletada", "cor": "part", "bar": m["cobertura"] or 0,
                        "texto": f"A coleta leu o chat sem buraco durante {_dur(m['janela_s'])}" + (f", de {_dur(m['duracao_s'])} no ar." if m["duracao_s"] else ".")})

    return {"veredito": veredito, "veredito_sub": sub, "insights": ins, "recomendacao": recomendacao,
            "achados": achados, "entrada": ENTRADA, "nao_entrada": NAO_ENTRADA}


def gerar(con, video_id):
    conteudo = redigir(con, video_id)
    agora = db.agora()
    con.execute("INSERT OR REPLACE INTO dossie (video_id, gerado_em, modelo, conteudo) VALUES (?,?,?,?)",
                (video_id, agora, MODELO, json.dumps(conteudo, ensure_ascii=False)))
    con.commit()
    return {"gerado_em": agora, "modelo": MODELO, **conteudo}


def ler(con, video_id):
    r = con.execute("SELECT * FROM dossie WHERE video_id=?", (video_id,)).fetchone()
    if not r:
        return None
    return {"gerado_em": r["gerado_em"], "modelo": r["modelo"], **json.loads(r["conteudo"])}


def markdown(d, cab):
    """O mesmo dossie em texto, para colar em documento."""
    linhas = [f"# {cab['canal']} — {cab['nome']}", f"{cab['data']} · {cab['janela']} · cobertura {cab['cobertura']}", "",
              "## Como performou", d["veredito"], "", d["veredito_sub"], "", "## Insights"]
    for i in d["insights"]:
        linhas += [f"- **{i['titulo']}.** {i['texto']} _(base: {i['base']})_"]
    linhas += ["", "## Recomendação", d["recomendacao"], "", f"_Texto {d['modelo']} sobre os números da coleta. Nenhuma mensagem de chat foi usada._"]
    return "\n".join(linhas) + "\n"
