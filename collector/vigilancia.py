"""
Canal vigiado: resolver, passar a vigiar e ler a agenda.

Custo de cota:
  - resolver @handle: zero (pagina publica do canal)
  - channels.list: 1 unidade (nome, @handle, foto, inscritos)
  - agenda: zero para ler a aba /streams, 1 unidade para confirmar ate 50
    videos de uma vez com videos.list

E o mesmo codigo que o vigia (processo permanente) usa a cada ciclo e que
a API chama quando alguem cola um @handle.
"""
try:  # instalado como pacote
    from . import db, yt
except ImportError:  # rodando o arquivo direto
    import db
    import yt


def _foto(snippet):
    th = (snippet or {}).get("thumbnails") or {}
    for k in ("high", "medium", "default"):
        if th.get(k, {}).get("url"):
            return th[k]["url"]
    return None


def completar_canal(con, canal_id):
    """channels.list: nome, @handle, foto e inscritos. 1 unidade."""
    item = yt.canal(con, canal_id)
    if not item:
        return None
    snip = item.get("snippet", {})
    stats = item.get("statistics", {})
    inscritos = None
    if not stats.get("hiddenSubscriberCount") and stats.get("subscriberCount"):
        inscritos = int(stats["subscriberCount"])
    db.upsert_canal(con, canal_id, snip.get("title") or canal_id,
                    handle=snip.get("customUrl"), inscritos=inscritos)
    foto = _foto(snip)
    if foto:
        con.execute("UPDATE canal SET foto_url=? WHERE canal_id=?", (foto, canal_id))
    con.commit()
    return item


def vigiar(con, entrada):
    """
    Passa a vigiar um canal a partir de @handle, UC... ou url. Devolve o
    canal_id. Vigiar de novo um canal que ja foi removido reativa a
    assinatura; a data de inicio da vigilancia passa a ser agora, porque
    nada e retroativo.
    """
    canal_id = yt.resolver_canal_id(entrada)
    completar_canal(con, canal_id)
    agora = db.agora()
    con.execute(
        """UPDATE canal SET
             vigiado_desde = CASE WHEN vigiado = 1 AND removido_em IS NULL
                                  THEN vigiado_desde ELSE ? END,
             vigiado = 1, removido_em = NULL
           WHERE canal_id = ?""",
        (agora, canal_id))
    con.commit()
    return canal_id


def parar(con, canal_id):
    """Libera o slot. Coletas, relatorios e links publicados continuam."""
    con.execute("UPDATE canal SET vigiado = 0, removido_em = ? WHERE canal_id = ?",
                (db.agora(), canal_id))
    con.commit()


def _status(lsd):
    if lsd.get("actualEndTime"):
        return "encerrada"
    if lsd.get("actualStartTime"):
        return "ao_vivo"
    return "agendada"


def sincronizar_agenda(con, canal_id, limite=15):
    """
    Le a aba /streams e grava cada transmissao em `live`. Tambem relê as
    lives do canal que o banco ainda acha que estao no ar ou agendadas,
    mesmo que ja tenham saido da aba: e assim que uma coleta interrompida
    descobre quando a transmissao realmente acabou.

    Devolve quantas transmissoes foram atualizadas.
    """
    c = con.execute("SELECT handle, foto_url FROM canal WHERE canal_id=?", (canal_id,)).fetchone()
    if c is None or not c["handle"] or not c["foto_url"]:
        completar_canal(con, canal_id)   # canais de antes da v2 nao tem @handle nem foto
    ids = yt.ids_da_pagina(canal_id, "streams")[:limite]
    pendentes = [r[0] for r in con.execute(
        "SELECT video_id FROM live WHERE canal_id=? AND status IN ('agendada','ao_vivo')",
        (canal_id,))]
    ids = list(dict.fromkeys(ids + pendentes))
    if not ids:
        _marcar_lida(con, canal_id)
        return 0

    agora = db.agora()
    n = 0
    for item in yt.videos(con, ids):
        lsd = item.get("liveStreamingDetails")
        if not lsd:
            continue  # video comum, nao e transmissao
        snip = item.get("snippet", {})
        if snip.get("channelId") != canal_id:
            continue
        inicio, fim = lsd.get("actualStartTime"), lsd.get("actualEndTime")
        duracao = None
        if inicio and fim:
            duracao = int((yt.parse_ts(fim) - yt.parse_ts(inicio)).total_seconds())
        # O titulo de uma live coletada e o que ela tinha no ar. Canal que
        # renomeia depois ("JOGO COMPLETO: ...") nao reescreve o registro;
        # a mudanca vai para o historico do video, nao para cima do original.
        coletada = con.execute("SELECT 1 FROM live WHERE video_id=? AND coleta_inicio IS NOT NULL",
                               (item["id"],)).fetchone()
        db.upsert_live(
            con, item["id"], canal_id,
            titulo=None if coletada else snip.get("title"),
            agendada_para=lsd.get("scheduledStartTime"),
            inicio_real=inicio, fim_real=fim, duracao_segundos=duracao,
            status=_status(lsd),
        )
        con.execute("UPDATE live SET detectada_em = COALESCE(detectada_em, ?) WHERE video_id = ?",
                    (agora, item["id"]))
        n += 1
    _marcar_lida(con, canal_id)
    return n


def _marcar_lida(con, canal_id):
    con.execute("UPDATE canal SET agenda_lida_em=? WHERE canal_id=?", (db.agora(), canal_id))
    con.commit()
