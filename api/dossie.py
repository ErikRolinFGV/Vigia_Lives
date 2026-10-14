"""
Dossie da transmissao: a leitura de como a live performou.

Nesta versao o texto e fixo (regra-v1): frases escritas a mao, escolhidas
pelo que os numeros mostram, com cada numero calculado da coleta. Nenhuma
mensagem de chat entra aqui, so agregados; quando um modelo de linguagem
entrar, ele recebe exatamente estes mesmos agregados (ENTRADA) e grava ao
lado com outro `modelo`, sem tocar no dado.
"""
import json
import statistics

from collector import db

from . import secoes
from .transmissoes import acompanhada_pct, janela_coletada_s, serie as serie_live

MODELO = "regra-v1"

ENTRADA = [
    "As séries agregadas: espectadores, mensagens por minuto e participação por janela de 60 s",
    "Os totais, os momentos detectados, a enquete e a cobertura",
    "O apoio pago agregado (valores e contagens, sem autor)",
]
NAO_ENTRADA = [
    "O texto das mensagens do chat",
    "Qualquer identificador de autor, mesmo pseudonimizado",
    "Dados de outros canais ou de outras transmissões",
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
    l = con.execute("SELECT * FROM live WHERE video_id=?", (video_id,)).fetchone()
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
