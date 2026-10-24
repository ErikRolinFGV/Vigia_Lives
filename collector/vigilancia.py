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
import re
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import db, gemeas, yt
except ImportError:  # rodando o arquivo direto
    import db
    import gemeas
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


def _conferir_sumidas(con, pedidos, itens, avisar=None):
    """
    Lives marcadas para coletar, ja na hora e sem coleta rodando, que o
    videos.list em lote nao devolveu. Le cada uma sozinha (1 unidade); se
    ainda nao vem, pergunta a pagina publica do video (sem cota). No ar pela
    pagina: vira ao_vivo e o vigia sobe o coletor, que tenta o videos.list
    de novo a cada ciclo ate o YouTube voltar a devolver a live.

    Sumiu de vez (privada ou indisponivel) e o conteudo abriu em outro link
    do canal no mesmo horario (gemeas.pelo_horario): o vigia passa a coletar
    o outro link. Em 23/10 a ginastica foi ao ar assim e ficou sem coleta.

    Devolve os itens recuperados pela leitura individual.
    """
    voltaram = {i["id"] for i in itens}
    if voltaram:
        con.execute(f"UPDATE sumida SET voltou_em=? WHERE voltou_em IS NULL AND video_id IN ({','.join('?' * len(voltaram))})",
                    (db.agora(), *voltaram))
        con.commit()
    faltam = [v for v in pedidos if v not in voltaram]
    if not faltam:
        return []
    agora = db.agora()
    # agendada que nunca subiu (apagada) para de ser conferida depois de 3 h
    piso = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat(timespec="seconds")
    marcadas = con.execute(
        f"""SELECT l.video_id, l.canal_id, l.titulo, l.status, l.agendada_para FROM live l JOIN canal c ON c.canal_id = l.canal_id
            WHERE l.video_id IN ({",".join("?" * len(faltam))})
              AND l.status IN ('agendada','ao_vivo') AND l.parar_pedido_em IS NULL
              AND (l.status = 'ao_vivo' OR l.agendada_para BETWEEN ? AND ?)
              AND NOT (l.coleta_inicio IS NOT NULL AND l.coleta_fim IS NULL)
              AND (l.coletar = 1 OR (l.coletar IS NULL AND c.modo_coleta = 'todas'))""",
        (*faltam, piso, agora)).fetchall()
    achados = []
    for l in marcadas:
        item = yt.video(con, l["video_id"])
        if item:
            con.execute("UPDATE sumida SET voltou_em=? WHERE video_id=? AND voltou_em IS NULL", (agora, l["video_id"]))
            con.commit()
            achados.append(item)
            continue
        estado = yt.estado_pela_pagina(l["video_id"])
        if estado == "no_ar" and l["status"] != "ao_vivo":
            con.execute("UPDATE live SET status='ao_vivo', inicio_real=COALESCE(inicio_real, ?) WHERE video_id=?",
                        (agora, l["video_id"]))
        # a interface mostra o motivo no lugar de "vai coletar"
        con.execute("""INSERT INTO sumida (video_id, motivo, desde, visto_em) VALUES (?, ?, ?, ?)
                       ON CONFLICT(video_id) DO UPDATE SET motivo=excluded.motivo, visto_em=excluded.visto_em,
                         desde=CASE WHEN sumida.voltou_em IS NULL THEN sumida.desde ELSE excluded.desde END,
                         voltou_em=NULL""",
                    (l["video_id"], estado or "sem_resposta", agora, agora))
        con.commit()
        if avisar:
            texto = {"no_ar": "no ar pela página do vídeo", "fora_do_ar": "fora do ar pela página do vídeo",
                     "privada": "a página do vídeo está privada", "indisponivel": "o vídeo está indisponível",
                     None: "a página do vídeo não respondeu"}[estado]
            avisar(f"ATENÇÃO: o YouTube não devolveu a live marcada {l['video_id']} ({l['titulo']}): {texto}")
        if estado in ("privada", "indisponivel"):
            _seguir_gemea(con, l, avisar)
    return achados


def _seguir_gemea(con, l, avisar=None):
    """O link marcado sumiu: marca para coletar o gemeo que esta no ar (sem desfazer quem o tirou da coleta)."""
    for g in gemeas.pelo_horario(con, l):
        if g["status"] != "ao_vivo" or g["coletar"] is not None:
            continue
        con.execute("UPDATE live SET coletar = 1 WHERE video_id = ? AND coletar IS NULL", (g["video_id"],))
        con.commit()
        if avisar:
            avisar(f"ATENÇÃO: o conteúdo da live marcada {l['video_id']} abriu em outro link, {g['video_id']} "
                   f"({g['titulo']}): o vigia passa a coletar esse link")


_faltas_antes: dict[str, frozenset] = {}


def _registrar_faltas(chave, pedidos, itens, avisar):
    """Avisa quando muda o conjunto de ids que o videos.list nao devolveu."""
    voltaram = {i["id"] for i in itens}
    faltas = frozenset(v for v in pedidos if v not in voltaram)
    if avisar and faltas != _faltas_antes.get(chave, frozenset()):
        avisar(f"{chave}: o YouTube devolveu {len(pedidos) - len(faltas)} de {len(pedidos)} ids"
               + (f"; faltaram {', '.join(sorted(faltas))}" if faltas else ""))
    _faltas_antes[chave] = faltas


def sincronizar_agenda(con, canal_id, paginas=4, avisar=None):
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
    # Encerradas nao precisam ser relidas, e marcam onde a aba vira passado:
    # a leitura rola a aba ate elas. Antes eram so os 15 primeiros ids, e a
    # aba poe as agendadas mais distantes no topo: com 20+ marcadas, as de
    # hoje ficavam de fora. O lote de 50 ids custa 1 unidade do mesmo jeito.
    encerradas = {r[0] for r in con.execute(
        "SELECT video_id FROM live WHERE canal_id=? AND status='encerrada'", (canal_id,))}
    ids = [v for v in yt.ids_da_pagina(canal_id, "streams", paginas=paginas, parar_em=encerradas)
           if v not in encerradas]
    pendentes = [r[0] for r in con.execute(
        "SELECT video_id FROM live WHERE canal_id=? AND status IN ('agendada','ao_vivo')",
        (canal_id,))]
    ids = list(dict.fromkeys(ids + pendentes))
    if not ids:
        _marcar_lida(con, canal_id)
        return 0

    agora = db.agora()
    n = 0
    itens = yt.videos(con, ids)
    _registrar_faltas(f"agenda {canal_id}", ids, itens, avisar)
    itens += _conferir_sumidas(con, ids, itens, avisar)
    for item in itens:
        if item.get("snippet", {}).get("channelId") == canal_id and gravar_live(con, item, agora):
            n += 1
    _marcar_lida(con, canal_id)
    return n


def gravar_live(con, item, agora=None):
    """
    Grava em `live` um item do videos.list. Devolve False (sem gravar) se
    o video nao e transmissao.
    """
    lsd = item.get("liveStreamingDetails")
    if not lsd:
        return False  # video comum, nao e transmissao
    snip = item.get("snippet", {})
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
        con, item["id"], snip.get("channelId"),
        titulo=None if coletada else snip.get("title"),
        agendada_para=lsd.get("scheduledStartTime"),
        inicio_real=inicio, fim_real=fim, duracao_segundos=duracao,
        status=_status(lsd),
    )
    con.execute("UPDATE live SET detectada_em = COALESCE(detectada_em, ?) WHERE video_id = ?",
                (agora or db.agora(), item["id"]))
    return True


# ------------------------------------------------------- live pelo link

def id_do_link(texto):
    """
    videoId de um link de live: watch?v=, youtu.be/, /live/, /shorts/,
    /embed/ ou o id puro. None se nao achar.
    """
    t = (texto or "").strip()
    if re.fullmatch(r"[\w-]{11}", t):
        return t
    m = re.search(r"(?:[?&]v=|youtu\.be/|/live/|/shorts/|/embed/)([\w-]{11})", t)
    return m.group(1) if m else None


def coletar_avulsa(con, item):
    """
    Marca para coleta uma live colada pelo link. Canal vigiado: so escolhe a
    live, como na agenda. Canal que nao e vigiado: entra no banco sem
    vigilancia (fora da lista de canais, sem slot) e a live fica avulsa:
    o vigia acompanha so ela ate subir e coleta como qualquer outra.
    Devolve True se a live ficou avulsa.
    """
    canal_id = item["snippet"]["channelId"]
    c = con.execute("SELECT vigiado, removido_em, foto_url FROM canal WHERE canal_id=?", (canal_id,)).fetchone()
    vigiado = bool(c and c["vigiado"] and not c["removido_em"])
    if c is None or not c["foto_url"]:
        completar_canal(con, canal_id)  # nome, foto e inscritos: 1 unidade
    gravar_live(con, item)
    con.execute("UPDATE live SET coletar = 1, parar_pedido_em = NULL, avulsa = MAX(avulsa, ?) WHERE video_id = ?",
                (0 if vigiado else 1, item["id"]))
    con.commit()
    return not vigiado


def acompanhar_avulsas(con, avisar=None):
    """
    Rele as lives avulsas que ainda nao acabaram (agendada ou no ar), todas
    num lote so (1 unidade). E o que a leitura da agenda faz pelas lives de
    canal vigiado: descobrir que a live subiu, mudou de horario ou acabou.
    """
    ids = [r[0] for r in con.execute(
        "SELECT video_id FROM live WHERE avulsa = 1 AND status IN ('agendada','ao_vivo')")]
    if not ids:
        return 0
    itens = yt.videos(con, ids)
    _registrar_faltas("lives pelo link", ids, itens, avisar)
    itens += _conferir_sumidas(con, ids, itens, avisar)
    n = 0
    for item in itens:
        if gravar_live(con, item):
            n += 1
    con.commit()
    return n


def _marcar_lida(con, canal_id):
    con.execute("UPDATE canal SET agenda_lida_em=? WHERE canal_id=?", (db.agora(), canal_id))
    con.commit()
