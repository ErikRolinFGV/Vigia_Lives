"""
Dados publicos do video e do canal: o que a API entrega so com a chave,
sem OAuth, e que nao some quando a live acaba (ao contrario do chat).

  - video_snapshot: titulo, thumbnail e contadores, durante a live (para
    detectar mudancas) e depois dela (+1 h ... +7 d)
  - canal_snapshot: inscritos antes e depois
  - comentario_top: comentarios mais relevantes do video gravado
  - video_publico: lives anteriores do canal, para comparacao
  - concorrencia: outras lives no ar no mesmo horario

Custo: videos.list, channels.list, commentThreads.list e playlistItems.list
custam 1 unidade; search.list custa 100.
"""
import json
from datetime import timedelta

try:  # instalado como pacote
    from . import config, db, yt
except ImportError:  # rodando o arquivo direto
    import config
    import db
    import yt

# Leituras depois do fim da live. O rotulo e o que a tela mostra.
POS_LIVE = [("+1 h", timedelta(hours=1)), ("+6 h", timedelta(hours=6)),
            ("+24 h", timedelta(hours=24)), ("+2 d", timedelta(days=2)),
            ("+3 d", timedelta(days=3)), ("+5 d", timedelta(days=5)),
            ("+7 d", timedelta(days=7))]
COMENTARIOS_EM = ("+24 h", "+7 d")


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _thumb(snippet):
    th = (snippet or {}).get("thumbnails") or {}
    for k in ("maxres", "standard", "high", "medium", "default"):
        if th.get(k, {}).get("url"):
            return th[k]["url"]
    return None


def registrar_video(con, item, fase, rotulo=None):
    """Grava uma leitura do video. `item` e um elemento de videos.list."""
    snip = item.get("snippet", {})
    stats = item.get("statistics", {})
    bruto = json.dumps({k: item.get(k) for k in ("snippet", "contentDetails", "topicDetails", "status", "liveStreamingDetails")},
                       ensure_ascii=False)[:20000]
    if fase == "durante":
        # leitura de minuto a minuto: o JSON inteiro so quando titulo ou
        # thumbnail mudam (ou na primeira); o resto sao os contadores
        ant = con.execute("""SELECT titulo, thumb_url FROM video_snapshot WHERE video_id=? AND fase='durante'
                             ORDER BY coletado_em DESC LIMIT 1""", (item["id"],)).fetchone()
        if ant and ant["titulo"] == snip.get("title") and ant["thumb_url"] == _thumb(snip):
            bruto = None
    con.execute(
        """INSERT OR REPLACE INTO video_snapshot
             (video_id, coletado_em, fase, rotulo, titulo, thumb_url, views, likes, comentarios, bruto)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (item["id"], db.agora(), fase, rotulo, snip.get("title"), _thumb(snip),
         _int(stats.get("viewCount")), _int(stats.get("likeCount")), _int(stats.get("commentCount")), bruto),
    )
    con.commit()


def ler_video(con, video_id, fase, rotulo=None):
    item = yt.video(con, video_id, part=config.PARTES_VIDEO)
    if item:
        registrar_video(con, item, fase, rotulo)
    return item


def registrar_canal(con, canal_id, video_id, fase):
    """Inscritos e total de videos do canal agora. 1 unidade."""
    item = yt.canal(con, canal_id)
    if not item:
        return None
    st = item.get("statistics", {})
    inscritos = None if st.get("hiddenSubscriberCount") else _int(st.get("subscriberCount"))
    con.execute(
        """INSERT OR REPLACE INTO canal_snapshot (canal_id, coletado_em, video_id, fase, inscritos, videos)
           VALUES (?,?,?,?,?,?)""",
        (canal_id, db.agora(), video_id, fase, inscritos, _int(st.get("videoCount"))))
    con.commit()
    return inscritos


def registrar_comentarios(con, video_id, n=20):
    """Comentarios mais relevantes. Autor vira pseudonimo; nome so em autor_identidade."""
    itens = yt.comentarios(con, video_id, n)
    for it in itens:
        top = it.get("snippet", {}).get("topLevelComment", {})
        s = top.get("snippet", {})
        canal_autor = (s.get("authorChannelId") or {}).get("value")
        autor_pid = db.registrar_identidade(con, canal_autor, s.get("authorDisplayName")) if canal_autor else None
        con.execute(
            """INSERT OR REPLACE INTO comentario_top
                 (comentario_id, video_id, autor_pid, texto, likes, respostas, publicado_em, coletado_em)
               VALUES (?,?,?,?,?,?,?,?)""",
            (top.get("id") or it.get("id"), video_id, autor_pid, s.get("textOriginal") or s.get("textDisplay"),
             _int(s.get("likeCount")), _int(it.get("snippet", {}).get("totalReplyCount")),
             s.get("publishedAt"), db.agora()))
    con.commit()
    return len(itens)


def registrar_uploads(con, canal_id, ate=None, max_paginas=1):
    """
    Lives do canal (vigiadas ou nao), com contadores publicos de hoje. Com
    `ate`, volta na playlist ate essa data (canal que publica muito precisa
    de varias paginas para chegar a um mes atras).
    """
    ids = yt.uploads(con, canal_id, ate=ate, max_paginas=max_paginas)
    gravadas = 0
    for item in yt.videos(con, ids):
        lsd = item.get("liveStreamingDetails")
        if not lsd or not lsd.get("actualStartTime"):
            continue   # so transmissoes que de fato aconteceram
        snip, stats = item.get("snippet", {}), item.get("statistics", {})
        con.execute(
            """INSERT OR REPLACE INTO video_publico
                 (video_id, canal_id, titulo, publicado_em, agendada_para, inicio, fim,
                  views, likes, comentarios, coletado_em)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (item["id"], canal_id, snip.get("title"), snip.get("publishedAt"),
             lsd.get("scheduledStartTime"), lsd.get("actualStartTime"), lsd.get("actualEndTime"),
             _int(stats.get("viewCount")), _int(stats.get("likeCount")), _int(stats.get("commentCount")),
             db.agora()))
        gravadas += 1
    con.commit()
    return gravadas


def registrar_concorrencia(con, video_id, offset_segundos, categoria=None, idioma="pt"):
    """
    Outras lives no ar agora na mesma categoria e idioma, com espectadores.
    101 unidades (search.list + videos.list). Inclui a propria live, para a
    fatia ser calculada sobre a mesma leitura.
    """
    ids = yt.lives_no_ar(con, categoria=categoria, idioma=idioma, video_id=video_id)
    if video_id not in ids:
        ids.append(video_id)
    agora = db.agora()
    for item in yt.videos(con, ids, part="snippet,liveStreamingDetails"):
        lsd = item.get("liveStreamingDetails") or {}
        esp = _int(lsd.get("concurrentViewers"))
        if esp is None:
            continue
        snip = item.get("snippet", {})
        if item["id"] != video_id and not _mesmo_idioma(snip, idioma):
            continue
        con.execute(
            """INSERT OR REPLACE INTO concorrencia
                 (video_id, coletado_em, offset_segundos, rival_video_id, rival_canal, titulo, espectadores)
               VALUES (?,?,?,?,?,?,?)""",
            (video_id, agora, offset_segundos, item["id"], snip.get("channelTitle"), snip.get("title"), esp))
    con.commit()


def _mesmo_idioma(snip, idioma):
    """
    relevanceLanguage do search.list e so preferencia: vem live em hindi numa
    busca em portugues. Vale o idioma que o canal declara no video; sem
    declaracao, o titulo precisa ser em escrita latina.
    """
    declarado = (snip.get("defaultAudioLanguage") or snip.get("defaultLanguage") or "").lower()
    if declarado:
        return declarado.startswith(idioma)
    titulo = snip.get("title") or ""
    letras = [c for c in titulo if c.isalpha()]
    return bool(letras) and sum(1 for c in letras if ord(c) < 0x250) / len(letras) > 0.9


# ---------------------------------------------------------------- depois da live

def agendar_pos_live(con, video_id, fim_iso):
    """Marca as leituras de views e comentarios depois do fim da live."""
    fim = yt.parse_ts(fim_iso)
    if not fim:
        return
    for rotulo, delta in POS_LIVE:
        quando = (fim + delta).isoformat(timespec="seconds")
        con.execute("INSERT OR IGNORE INTO pos_live_job (video_id, tipo, rotulo, executar_em) VALUES (?,?,?,?)",
                    (video_id, "video", rotulo, quando))
        if rotulo in COMENTARIOS_EM:
            con.execute("INSERT OR IGNORE INTO pos_live_job (video_id, tipo, rotulo, executar_em) VALUES (?,?,?,?)",
                        (video_id, "comentarios", rotulo, quando))
    con.commit()


def rodar_jobs(con, limite=20):
    """Executa os jobs vencidos. Erro fica gravado e o job e tentado de novo."""
    pendentes = con.execute(
        """SELECT * FROM pos_live_job WHERE feito_em IS NULL AND executar_em <= ?
           ORDER BY executar_em LIMIT ?""", (db.agora(), limite)).fetchall()
    for j in pendentes:
        try:
            if j["tipo"] == "video":
                ler_video(con, j["video_id"], "pos", j["rotulo"])
            elif j["tipo"] == "comentarios":
                registrar_comentarios(con, j["video_id"])
            con.execute("UPDATE pos_live_job SET feito_em=?, erro=NULL WHERE video_id=? AND tipo=? AND rotulo=?",
                        (db.agora(), j["video_id"], j["tipo"], j["rotulo"]))
        except yt.ErroCota:
            raise
        except Exception as e:
            con.execute("UPDATE pos_live_job SET erro=? WHERE video_id=? AND tipo=? AND rotulo=?",
                        (str(e)[:300], j["video_id"], j["tipo"], j["rotulo"]))
        con.commit()
    return len(pendentes)


def completar_coleta_antiga(con, video_id):
    """
    Para uma live coletada antes destes dados existirem: le hoje o que ainda
    e publico (ficha do video, contadores, comentarios, lives anteriores,
    inscritos). O que so existia durante a live (mudancas de titulo,
    concorrencia, views +1 h) continua sem dado, e a tela diz isso.
    """
    l = con.execute("SELECT canal_id, inicio_real FROM live WHERE video_id=?", (video_id,)).fetchone()
    if not l:
        return
    ler_video(con, video_id, "avulsa", "hoje")
    registrar_comentarios(con, video_id)
    # volta uma semana antes da live: o bastante para algumas anteriores
    ate = None
    if l["inicio_real"]:
        ate = (yt.parse_ts(l["inicio_real"]) - timedelta(days=7)).isoformat()
    registrar_uploads(con, l["canal_id"], ate=ate, max_paginas=40)
    registrar_canal(con, l["canal_id"], video_id, "avulsa")
