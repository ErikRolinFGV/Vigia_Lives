"""
Camada 0 de analise: deterministica, custo zero, roda sem nenhum LLM.

Faz o que a arquitetura v0.1 define como pre-filtro antes de qualquer
chamada paga: agrega o chat em janelas, mede taxa de participacao,
detecta picos por z-score sobre media movel e marca spam por heuristica.
O LLM entra depois, so para rotular o que ja foi detectado aqui.

Uso: python report.py --video VIDEO_ID [--bucket 60]
"""
import argparse
import json
import math
import re
import statistics
from collections import Counter

try:  # instalado como pacote
    from . import config, db
except ImportError:  # rodando o arquivo direto
    import config
    import db

BUCKET_PADRAO = 60
Z_PICO = 2.5           # desvios padrao acima da media movel
JANELA_MOVEL = 15      # buckets usados como linha de base

STOPWORDS = set("""
a o e de da do das dos que em um uma uns umas para por com no na nos nas
os as se ao aos pra pro ta ta e eh nao sim ja mais muito mto ne so vai vc
voce ele ela isso esse essa aqui la tbm tambem tudo todo toda foi ser tem
eu meu minha nos eles elas mas ou como quando qual quem porque pq entao
pelo pela pelos pelas seu sua seus suas este esta isto esses essas nem ate
sem sobre ainda cada outro outra tem tinha esta estao sao era foram vao
""".split())

RE_EMOJI = re.compile(
    "[" "\U0001F300-\U0001FAFF" "\U00002600-\U000027BF" "\U0001F1E6-\U0001F1FF" "]"
)
# O YouTube devolve os emojis dele como shortcode de texto no meio da
# mensagem: ":face-green-smiling:", ":trophy-yellow-smiling:". Sem tratar
# isso, o vocabulario do chat vira uma lista de pedacos de emoji
# ("smiling", "face", "green") em vez das palavras que as pessoas usaram.
RE_SHORTCODE = re.compile(r":[a-zA-Z0-9_+-]{2,40}:")
# [^\W\d_] = qualquer letra unicode, acentuadas incluidas. Uma classe
# escrita a mao com as letras acentuadas cortaria "paleto" em "palet"
# e "Mendonca" em "mend", o que suja o vocabulario do chat em portugues.
RE_PALAVRA = re.compile(r"[^\W\d_]{3,}", re.UNICODE)


# ------------------------------------------------------------------ agregacao

def _sem_acento(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t)
                   if unicodedata.category(c) != "Mn")


def agregar(con, video_id, bucket):
    con.execute(
        "DELETE FROM janela_agregada WHERE video_id=? AND bucket_segundos=?",
        (video_id, bucket),
    )
    msgs = con.execute(
        """SELECT offset_segundos, autor_pid, texto, valor_micros
           FROM mensagem
           WHERE video_id=? AND offset_segundos IS NOT NULL
           ORDER BY offset_segundos""",
        (video_id,),
    ).fetchall()
    if not msgs:
        return 0

    snaps = con.execute(
        """SELECT offset_segundos, espectadores FROM snapshot_audiencia
           WHERE video_id=? AND offset_segundos IS NOT NULL""",
        (video_id,),
    ).fetchall()
    aud = {}
    for s in snaps:
        b = (s["offset_segundos"] // bucket) * bucket
        aud.setdefault(b, []).append(s["espectadores"] or 0)

    baldes = {}
    for m in msgs:
        b = (m["offset_segundos"] // bucket) * bucket
        d = baldes.setdefault(b, {
            "msgs": 0, "autores": set(), "doacoes": 0, "qtd_doacoes": 0,
            "emojis": Counter(), "termos": Counter(),
        })
        d["msgs"] += 1
        d["autores"].add(m["autor_pid"])
        if m["valor_micros"]:
            d["doacoes"] += m["valor_micros"]
            d["qtd_doacoes"] += 1
        texto = m["texto"] or ""
        d["emojis"].update(RE_SHORTCODE.findall(texto))
        d["emojis"].update(RE_EMOJI.findall(texto))
        limpo = RE_SHORTCODE.sub(" ", texto)   # so as palavras de verdade
        d["termos"].update(
            p.lower() for p in RE_PALAVRA.findall(limpo)
            if _sem_acento(p.lower()) not in STOPWORDS
        )

    for b, d in sorted(baldes.items()):
        esp = statistics.fmean(aud[b]) if aud.get(b) else None
        taxa = (d["msgs"] / esp) if esp else None
        con.execute(
            """INSERT INTO janela_agregada
                 (video_id, bucket_segundos, bucket_inicio, msgs, autores_unicos,
                  msgs_por_minuto, espectadores_medio, taxa_participacao,
                  doacoes_micros, doacoes_qtd, emojis_top, termos_top, calculado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                video_id, bucket, b, d["msgs"], len(d["autores"]),
                d["msgs"] * 60.0 / bucket, esp, taxa,
                d["doacoes"], d["qtd_doacoes"],
                json.dumps(d["emojis"].most_common(5), ensure_ascii=False),
                json.dumps(d["termos"].most_common(8), ensure_ascii=False),
                db.agora(),
            ),
        )
    con.commit()
    return len(baldes)


# ------------------------------------------------------------------ momentos

def detectar_momentos(con, video_id, bucket):
    """
    Deteccao estatistica, nao semantica. O LLM so entra depois para
    rotular o que aqui ja foi apontado, o que segura o custo da analise.
    """
    con.execute("DELETE FROM momento WHERE video_id=?", (video_id,))
    linhas = con.execute(
        """SELECT bucket_inicio, msgs_por_minuto, espectadores_medio, doacoes_micros
           FROM janela_agregada
           WHERE video_id=? AND bucket_segundos=? AND bucket_inicio >= 0
           ORDER BY bucket_inicio""",
        (video_id, bucket),
    ).fetchall()
    if len(linhas) < JANELA_MOVEL:
        return []

    serie = [l["msgs_por_minuto"] or 0 for l in linhas]
    momentos = []

    # Dois guardas contra pico falso, os dois necessarios:
    #
    # 1. Piso de ruido. No comeco da transmissao o chat esta quase parado, o
    #    desvio da base fica proximo de zero e qualquer subida vira "6 sigma".
    #    Sem isso, buckets com 3 e 5 mensagens foram classificados como pico
    #    numa live que depois bateu 140 mensagens por minuto.
    # 2. Minimo absoluto. Um pico precisa ser alto tambem em numero, nao so
    #    em relacao a uma base morta.
    mediana = statistics.median(serie) if serie else 0
    piso_desvio = max(1.0, 0.15 * mediana)
    minimo_abs = max(3.0, 1.5 * mediana)

    for i in range(JANELA_MOVEL, len(serie)):
        base = serie[i - JANELA_MOVEL:i]
        media = statistics.fmean(base)
        desvio = max(statistics.pstdev(base), piso_desvio)
        z = (serie[i] - media) / desvio
        if z >= Z_PICO and serie[i] >= minimo_abs:
            momentos.append(("pico_chat", linhas[i]["bucket_inicio"], z))

    # picos de doacao: bucket acima de 3x a media dos buckets com doacao
    doacoes = [l["doacoes_micros"] for l in linhas if l["doacoes_micros"]]
    if doacoes:
        media_d = statistics.fmean(doacoes)
        for l in linhas:
            if l["doacoes_micros"] and l["doacoes_micros"] > 3 * media_d:
                momentos.append(
                    ("pico_doacao", l["bucket_inicio"],
                     l["doacoes_micros"] / media_d)
                )

    # quedas de audiencia: perda de mais de 15% em relacao ao bucket anterior
    for a, b in zip(linhas, linhas[1:]):
        ea, eb = a["espectadores_medio"], b["espectadores_medio"]
        if ea and eb and eb < ea * 0.85:
            momentos.append(("queda_audiencia", b["bucket_inicio"], (ea - eb) / ea))

    for tipo, off, mag in momentos:
        con.execute(
            """INSERT INTO momento
                 (video_id, offset_segundos, duracao_segundos, tipo,
                  magnitude, url_timestamp, detectado_em)
               VALUES (?,?,?,?,?,?,?)""",
            (video_id, off, bucket, tipo, round(mag, 2),
             f"https://youtube.com/watch?v={video_id}&t={off}s", db.agora()),
        )
    con.commit()
    return momentos


def marcar_spam(con, video_id):
    """
    Heuristica sem custo: mensagem repetida pelo mesmo autor e rajada
    de mensagens identicas de autores diferentes. Elimina de 20 a 40%
    do volume antes de qualquer chamada paga.
    """
    con.execute(
        """DELETE FROM analise_mensagem
           WHERE modelo='heuristica-v1'
             AND msg_id IN (SELECT msg_id FROM mensagem WHERE video_id=?)""",
        (video_id,),
    )
    linhas = con.execute(
        "SELECT msg_id, autor_pid, texto FROM mensagem WHERE video_id=? AND texto IS NOT NULL",
        (video_id,),
    ).fetchall()
    total = len(linhas)
    # limiares relativos: num chat grande, uma frase curta repetida por
    # muita gente e comportamento normal de torcida, nao spam
    lim_autor = max(8, int(0.002 * total))
    lim_texto = max(25, int(0.01 * total))
    por_autor = Counter()
    por_texto = Counter()
    for l in linhas:
        t = (l["texto"] or "").strip().lower()
        if t:
            por_autor[(l["autor_pid"], t)] += 1
            por_texto[t] += 1

    marcadas = 0
    for l in linhas:
        t = (l["texto"] or "").strip().lower()
        if not t:
            continue
        motivo = None
        if por_autor[(l["autor_pid"], t)] >= lim_autor:
            motivo = "repeticao do mesmo autor"
        elif por_texto[t] >= lim_texto and len(t) > 20:
            motivo = "texto identico em rajada"
        elif len(t) > 40 and len(set(t)) <= 5:
            motivo = "baixa entropia"
        elif len(RE_SHORTCODE.findall(t)) >= 5 and not RE_SHORTCODE.sub("", t).strip():
            motivo = "rajada de emoji sem texto"
        if motivo:
            con.execute(
                """INSERT OR REPLACE INTO analise_mensagem
                     (msg_id, modelo, prompt_versao, is_spam, spam_motivo,
                      confianca, analisado_em)
                   VALUES (?,'heuristica-v1','v1',1,?,0.8,?)""",
                (l["msg_id"], motivo, db.agora()),
            )
            marcadas += 1
    con.commit()
    return marcadas


# ------------------------------------------------------------------ saida

def hhmmss(seg):
    seg = int(seg or 0)
    sinal = "-" if seg < 0 else ""
    seg = abs(seg)
    return f"{sinal}{seg//3600:02d}:{(seg%3600)//60:02d}:{seg%60:02d}"


def gerar(con, video_id, bucket):
    l = con.execute(
        """SELECT l.*, c.nome canal FROM live l
           JOIN canal c ON c.canal_id=l.canal_id WHERE l.video_id=?""",
        (video_id,),
    ).fetchone()
    if not l:
        return None

    r = con.execute("SELECT * FROM v_resumo_live WHERE video_id=?", (video_id,)).fetchone()
    cota = con.execute(
        """SELECT metodo, COUNT(*) n, SUM(custo_unidades) u
           FROM coleta_log WHERE video_id=? GROUP BY metodo ORDER BY u DESC""",
        (video_id,),
    ).fetchall()
    total_u = sum(c["u"] or 0 for c in cota)
    spam = con.execute(
        """SELECT COUNT(*) n FROM analise_mensagem a
           JOIN mensagem m ON m.msg_id=a.msg_id
           WHERE m.video_id=? AND a.is_spam=1""",
        (video_id,),
    ).fetchone()["n"]
    momentos = con.execute(
        """SELECT * FROM momento WHERE video_id=?
           ORDER BY magnitude DESC LIMIT 12""",
        (video_id,),
    ).fetchall()
    termos = Counter()
    emojis = Counter()
    for j in con.execute(
        "SELECT termos_top, emojis_top FROM janela_agregada WHERE video_id=? AND bucket_segundos=?",
        (video_id, bucket),
    ):
        for t, n in json.loads(j["termos_top"] or "[]"):
            termos[t] += n
        for e, n in json.loads(j["emojis_top"] or "[]"):
            emojis[e] += n
    papeis = con.execute(
        """SELECT SUM(is_moderador) mods, SUM(is_membro) membros, COUNT(*) total
           FROM autor_papel_live WHERE video_id=?""",
        (video_id,),
    ).fetchone()
    top_doadores = con.execute(
        """SELECT autor_pid, SUM(valor_micros) v, COUNT(*) n FROM mensagem
           WHERE video_id=? AND valor_micros IS NOT NULL
           GROUP BY autor_pid ORDER BY v DESC LIMIT 5""",
        (video_id,),
    ).fetchall()

    total_msgs = r["total_msgs"] or 0
    dur = l["duracao_segundos"] or 0
    # live ainda no ar: sem fim_real nao existe duracao. Usa a janela
    # efetivamente observada para nao perder a taxa de mensagens.
    # So conta o que aconteceu DEPOIS do inicio da transmissao. A primeira
    # chamada da API devolve um backlog do chat com horarios de muitas horas
    # antes; incluir isso na janela observada derruba a taxa de mensagens
    # por minuto para um numero sem sentido.
    observado = con.execute(
        """SELECT MAX(offset_segundos) j FROM mensagem
           WHERE video_id=? AND offset_segundos >= 0""",
        (video_id,),
    ).fetchone()["j"] or 0
    pre = con.execute(
        """SELECT COUNT(*) n, MIN(offset_segundos) m FROM mensagem
           WHERE video_id=? AND offset_segundos < 0""",
        (video_id,),
    ).fetchone()
    msgs_live = con.execute(
        """SELECT COUNT(*) n FROM mensagem
           WHERE video_id=? AND offset_segundos >= 0""",
        (video_id,),
    ).fetchone()["n"]
    base_taxa = dur or observado
    L = []
    L.append(f"# Relatorio da live: {l['titulo']}\n")
    L.append(f"Canal: **{l['canal']}**  \n")
    L.append(f"Video: https://youtube.com/watch?v={video_id}  \n")
    dur_txt = hhmmss(dur) if dur else (
        f"em andamento, {hhmmss(observado)} observados")
    L.append(f"Inicio: {l['inicio_real']}  |  Duracao: {dur_txt}  \n")
    cob = l["cobertura_pct"]
    L.append(f"Cobertura da coleta: **{cob if cob is not None else 'n/d'}%** "
             "(fracao da live que o coletor realmente acompanhou)\n")

    L.append("\n## Numeros da live\n")
    def num(v):
        return f"{int(v or 0):,}".replace(",", ".")

    L.append(f"- Mensagens coletadas: **{num(total_msgs)}**")
    L.append(f"- Autores unicos: **{num(r['autores_unicos'])}**")
    if base_taxa:
        rotulo = "na live" if dur else f"nos {hhmmss(observado)} transmitidos"
        L.append(f"- Media de mensagens por minuto {rotulo}: "
                 f"**{msgs_live/(base_taxa/60):.1f}**")
    if pre["n"]:
        L.append(f"- Mensagens anteriores ao inicio da transmissao: "
                 f"**{num(pre['n'])}** (backlog que a API devolve na primeira "
                 f"chamada, a mais antiga de {hhmmss(abs(pre['m']))} antes). "
                 "Ficam no banco, mas fora das metricas de ritmo.")
    L.append(f"- Pico de espectadores simultaneos: **{r['pico_espectadores'] or 'n/d'}**")
    L.append(f"- Media de espectadores: "
             f"**{r['media_espectadores']:.0f}**" if r["media_espectadores"]
             else "- Media de espectadores: **n/d**")
    if r["pico_espectadores"] and r["autores_unicos"]:
        L.append(f"- Taxa de participacao no pico: "
                 f"**{100*r['autores_unicos']/r['pico_espectadores']:.1f}%** "
                 "dos espectadores escreveram ao menos uma vez")
    L.append(f"- Doacoes: **R$ {r['doacoes_total'] or 0:.2f}**")
    if papeis and papeis["total"]:
        L.append(f"- Moderadores ativos: **{papeis['mods'] or 0}**  |  "
                 f"Membros pagos que escreveram: **{papeis['membros'] or 0}**")
    if total_msgs:
        L.append(f"- Spam detectado por heuristica: **{num(spam)}** mensagens "
                 f"(**{100*spam/total_msgs:.1f}%** do volume), removido da "
                 "analise antes de qualquer chamada paga")

    if momentos:
        L.append("\n## Momentos detectados\n")
        L.append("Deteccao estatistica, sem LLM. Cada link abre o video no instante exato.\n")
        L.append("| Momento | Tipo | Intensidade | Link |")
        L.append("|---|---|---|---|")
        nome = {
            "pico_chat": "pico de chat", "pico_doacao": "pico de doacao",
            "queda_audiencia": "queda de audiencia",
            "pico_audiencia": "pico de audiencia",
            "virada_sentimento": "virada de sentimento",
        }
        for m in momentos:
            unid = "sigma" if m["tipo"] == "pico_chat" else (
                "x a media" if m["tipo"] == "pico_doacao" else "de perda")
            val = (f"{m['magnitude']:.1f} {unid}" if m["tipo"] != "queda_audiencia"
                   else f"{100*m['magnitude']:.0f}% {unid}")
            L.append(f"| {hhmmss(m['offset_segundos'])} | {nome.get(m['tipo'], m['tipo'])} "
                     f"| {val} | [ver]({m['url_timestamp']}) |")

    # Linha do tempo em fatias de 5 min. E aqui que aparece o que nenhum
    # numero agregado mostra: audiencia e participacao andando em direcoes
    # opostas. Quem so olha o painel do YouTube ve a curva de espectadores
    # subir e conclui que a live esta indo bem.
    fatia = 300
    tl = con.execute(
        """SELECT (bucket_inicio / ?) * ? AS ini,
                  SUM(msgs) msgs,
                  AVG(espectadores_medio) esp,
                  SUM(doacoes_micros) doa
           FROM janela_agregada
           WHERE video_id=? AND bucket_segundos=? AND bucket_inicio >= 0
           GROUP BY ini ORDER BY ini""",
        (fatia, fatia, video_id, bucket),
    ).fetchall()
    if len(tl) >= 3:
        L.append("\n## Linha do tempo\n")
        L.append("| Trecho | Espectadores | Msgs/min | Participacao | Doacoes |")
        L.append("|---|---|---|---|---|")
        for t in tl:
            esp = t["esp"]
            mpm = t["msgs"] * 60.0 / fatia
            part = f"{100*mpm/esp:.2f}%" if esp else "n/d"
            L.append(f"| {hhmmss(t['ini'])} | {num(esp) if esp else 'n/d'} "
                     f"| {mpm:.1f} | {part} | R$ {(t['doa'] or 0)/1_000_000:.2f} |")

        primeiro, ultimo = tl[0], tl[-1]
        e0, e1 = primeiro["esp"], ultimo["esp"]
        m0 = primeiro["msgs"] * 60.0 / fatia
        m1 = ultimo["msgs"] * 60.0 / fatia
        if e0 and e1 and m0:
            de = 100 * (e1 - e0) / e0
            dm = 100 * (m1 - m0) / m0
            if de > 3 and dm < -3:
                L.append(f"\nDo primeiro ao ultimo trecho a audiencia **subiu "
                         f"{de:.0f}%** enquanto o chat **caiu {abs(dm):.0f}%**. "
                         "Mais gente assistindo e menos gente falando: sao "
                         "publicos diferentes, e a curva de espectadores sozinha "
                         "nao mostra isso.")
            elif de < -3 and dm > 3:
                L.append(f"\nA audiencia **caiu {abs(de):.0f}%** enquanto o chat "
                         f"**subiu {dm:.0f}%**: quem ficou estava mais engajado.")
            else:
                L.append(f"\nVariacao do primeiro ao ultimo trecho: audiencia "
                         f"{de:+.0f}%, chat {dm:+.0f}%.")

    if termos:
        L.append("\n## Vocabulario do chat\n")
        L.append("Termos mais frequentes: " +
                 ", ".join(f"**{t}** ({n})" for t, n in termos.most_common(15)))
        if emojis:
            L.append("\nEmojis mais usados: " +
                     "  ".join(f"{e} ({n})" for e, n in emojis.most_common(10)))

    enquetes = con.execute(
        """SELECT * FROM enquete WHERE video_id=? ORDER BY offset_segundos""",
        (video_id,),
    ).fetchall()
    if enquetes:
        L.append("\n## Enquetes do canal\n")
        L.append("O YouTube nao guarda o resultado destas votacoes depois que "
                 "a live acaba, e o criador nao tem como exportar. E pesquisa "
                 "de audiencia que o proprio canal produziu e perdeu.\n")
        for e in enquetes:
            L.append(f"**{hhmmss(e['offset_segundos'])}** "
                     f"[ver](https://youtube.com/watch?v={video_id}"
                     f"&t={e['offset_segundos']}s) | "
                     f"{e['pergunta'] or 'pergunta nao capturada'}")
            opcoes = json.loads(e["opcoes"] or "[]")
            total = e["total_votos"] or sum(o.get("votos") or 0 for o in opcoes)
            if opcoes:
                L.append("")
                L.append("| Opcao | Votos | % |")
                L.append("|---|---|---|")
                for o in opcoes:
                    v = o.get("votos")
                    pct = f"{100*v/total:.0f}%" if v is not None and total else "n/d"
                    L.append(f"| {o.get('texto') or '?'} "
                             f"| {num(v) if v is not None else 'n/d'} | {pct} |")
                if total:
                    L.append(f"\nTotal de votos: **{num(total)}**")
            L.append("")

    if top_doadores:
        L.append("\n## Doacoes\n")
        L.append("Autores identificados apenas pelo pseudonimo, conforme o "
                 "principio de privacidade do banco.\n")
        L.append("| Autor (pseudonimo) | Doacoes | Total |")
        L.append("|---|---|---|")
        for d in top_doadores:
            L.append(f"| `{d['autor_pid'][:12]}` | {d['n']} | R$ {d['v']/1_000_000:.2f} |")

    L.append("\n## Custo de coleta\n")
    L.append("| Metodo | Chamadas | Unidades |")
    L.append("|---|---|---|")
    for c in cota:
        L.append(f"| {c['metodo']} | {c['n']} | {c['u']} |")
    L.append(f"| **total** | | **{total_u}** |")
    L.append(f"\nConsumo: **{100*total_u/10000:.1f}%** da cota diaria gratuita "
             "de 10.000 unidades.")
    if dur and dur > 0 and total_u:
        L.append(f"Projecao linear: uma live de 3 h nesse ritmo custaria cerca de "
                 f"**{int(total_u * 10800/dur)}** unidades, ou "
                 f"**{100*total_u*10800/dur/10000:.0f}%** da cota, o que permite "
                 f"cerca de **{max(1, int(10000 // max(1, total_u*10800/dur)))}** "
                 "live(s) de 3 h por dia com uma unica chave.")

    L.append("\n---\n")
    L.append("Gerado pela camada 0 do monitor de lives. Nenhuma chamada de LLM "
             "foi usada neste relatorio.")

    texto = "\n".join(L)
    config.DIR_RELATORIOS.mkdir(parents=True, exist_ok=True)
    caminho = config.DIR_RELATORIOS / f"live_{video_id}.md"
    caminho.write_text(texto, encoding="utf-8")
    return caminho


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--video", required=True)
    p.add_argument("--bucket", type=int, default=BUCKET_PADRAO)
    args = p.parse_args()

    con = db.conectar()
    n = agregar(con, args.video, args.bucket)
    m = detectar_momentos(con, args.video, args.bucket)
    s = marcar_spam(con, args.video)
    print(f"{n} janelas agregadas | {len(m)} momentos | {s} mensagens marcadas como spam")
    caminho = gerar(con, args.video, args.bucket)
    print(f"relatorio: {caminho}" if caminho else "live nao encontrada no banco")
    con.close()


if __name__ == "__main__":
    main()
