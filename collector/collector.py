"""
Coletor de uma live do YouTube.

Uso:
    python collector.py --video VIDEO_ID
    python collector.py --canal @cazetvoficial       (espera a live comecar)
    python collector.py --video VIDEO_ID --minutos 30

O que faz enquanto a live esta no ar:
  - le o chat com janela adaptativa e grava cada mensagem uma unica vez
  - faz polling de concurrentViewers, views e likes
  - registra o custo em unidades de cada chamada em coleta_log
  - calcula cobertura_pct, que diz quanto da live a coleta realmente viu

Por que rodar durante a transmissao: o chat ao vivo deixa de existir quando
a live acaba. Nao ha como recuperar depois.
"""
import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone

try:  # instalado como pacote
    from . import config, db, publico, report, yt
except ImportError:  # rodando o arquivo direto
    import config
    import db
    import publico
    import report
    import yt

_parar = False


def _sinal(sig, frame):
    global _parar
    _parar = True
    print("\n[coletor] encerrando com cuidado, aguarde o flush do banco...")


signal.signal(signal.SIGINT, _sinal)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ------------------------------------------------------------------ live

def sincronizar_live(con, video_id, registrar=False):
    """
    Le videos.list e atualiza o estado da live no banco. Custa 1 unidade.
    Pede todas as partes publicas de uma vez (o custo e por chamada): com
    registrar=True a leitura vira um video_snapshot, que e de onde saem as
    mudancas de titulo e thumbnail durante a live.
    """
    item = yt.video(con, video_id, part=config.PARTES_VIDEO)
    if not item:
        return None
    if registrar:
        publico.registrar_video(con, item, "durante")
    snip = item.get("snippet", {})
    lsd = item.get("liveStreamingDetails", {})
    stats = item.get("statistics", {})

    canal_id = snip.get("channelId")
    db.upsert_canal(con, canal_id, snip.get("channelTitle"))

    inicio = lsd.get("actualStartTime")
    fim = lsd.get("actualEndTime")
    status = "encerrada" if fim else ("ao_vivo" if inicio else "agendada")

    duracao = None
    if inicio and fim:
        duracao = int((yt.parse_ts(fim) - yt.parse_ts(inicio)).total_seconds())

    # O titulo da transmissao e o que ela tinha quando a coleta comecou. Se o
    # canal renomeia no meio (a CazeTV reaproveitou o link de um jogo para
    # outro) ou depois ("JOGO COMPLETO: ..."), a troca fica no historico do
    # video (video_snapshot) e vira trecho/mudanca, nao some com o original.
    ja = con.execute("SELECT titulo, coleta_inicio FROM live WHERE video_id=?", (video_id,)).fetchone()
    manter = ja is not None and ja["coleta_inicio"] and ja["titulo"]
    db.upsert_live(
        con, video_id, canal_id,
        titulo=None if manter else snip.get("title"),
        live_chat_id=lsd.get("activeLiveChatId"),
        agendada_para=lsd.get("scheduledStartTime"),
        inicio_real=inicio,
        fim_real=fim,
        duracao_segundos=duracao,
        status=status,
    )
    con.commit()
    return {
        "video_id": video_id,
        "canal_id": canal_id,
        "titulo": snip.get("title"),
        "live_chat_id": lsd.get("activeLiveChatId"),
        "inicio_real": inicio,
        "fim_real": fim,
        "status": status,
        "espectadores": int(lsd["concurrentViewers"])
        if lsd.get("concurrentViewers") else None,
        "views": int(stats["viewCount"]) if stats.get("viewCount") else None,
        "likes": int(stats["likeCount"]) if stats.get("likeCount") else None,
        "categoria": snip.get("categoryId"),
        "idioma": (snip.get("defaultAudioLanguage") or "pt")[:2],
    }


def esperar_live(con, canal_id, intervalo=120):
    """
    Vigia o feed RSS do canal ate uma live comecar. RSS nao consome cota;
    so o videos.list de confirmacao custa 1 unidade por candidato.
    """
    log(f"vigiando o canal {canal_id}, checando a cada {intervalo}s")
    vistos = set()
    while not _parar:
        candidatos = []
        # duas fontes, ambas sem custo de cota: o RSS lista o que foi
        # publicado, a aba /streams e onde a live agendada aparece antes
        # de comecar. Uma sozinha deixa passar caso.
        try:
            candidatos += [v for v, _, _ in yt.feed_rss(canal_id)[:5]]
        except Exception as e:
            log(f"RSS indisponivel ({e})")
        try:
            candidatos += yt.ids_da_pagina(canal_id, "streams")[:5]
        except Exception as e:
            log(f"aba /streams indisponivel ({e})")

        if not candidatos:
            log("nenhuma fonte respondeu, tentando de novo")
            time.sleep(intervalo)
            continue

        for video_id in dict.fromkeys(candidatos):
            if video_id in vistos:
                continue
            info = sincronizar_live(con, video_id)
            # so marca como visto o que ja acabou: uma live agendada
            # precisa ser reconsultada ate comecar
            if info and info["status"] == "encerrada":
                vistos.add(video_id)
            if info and info["status"] == "ao_vivo" and info["live_chat_id"]:
                log(f"live no ar: {info['titulo']}")
                return info
        time.sleep(intervalo)
    return None


def _tentar(o_que, f):
    """Leitura acessoria: falhar nao pode derrubar a coleta do chat."""
    try:
        return f()
    except yt.ErroCota:
        log(f"{o_que}: cota esgotada, seguindo sem")
    except Exception as e:
        log(f"{o_que}: falhou ({e}), seguindo")
    return None


def _parada_pedida(con, video_id):
    r = con.execute("SELECT parar_pedido_em FROM live WHERE video_id=?", (video_id,)).fetchone()
    return bool(r and r["parar_pedido_em"])


# ------------------------------------------------------------------ chat

def _extrair(item, video_id, inicio_dt, con):
    snip = item.get("snippet", {})
    autor = item.get("authorDetails", {})
    tipo = snip.get("type", "unknown")

    autor_pid = db.registrar_autor(
        con,
        canal_autor_id=autor.get("channelId", "desconhecido"),
        nome_exibicao=autor.get("displayName"),
        url_foto=autor.get("profileImageUrl"),
        video_id=video_id,
        papeis={
            "dono": autor.get("isChatOwner", False),
            "moderador": autor.get("isChatModerator", False),
            "membro": autor.get("isChatSponsor", False),
            "verificado": autor.get("isVerified", False),
        },
    )

    publicado = snip.get("publishedAt")
    offset = None
    if publicado and inicio_dt:
        ts = yt.parse_ts(publicado)
        if ts:
            offset = int((ts - inicio_dt).total_seconds())

    texto = snip.get("displayMessage")
    moeda = valor = tier = None
    sc = snip.get("superChatDetails") or snip.get("superStickerDetails")
    if sc:
        moeda = sc.get("currency")
        valor = int(sc.get("amountMicros", 0))   # micros inteiros, nunca float
        tier = sc.get("tier")
        texto = sc.get("userComment") or texto

    # Enquete criada pelo canal. A pergunta e os votos vivem em pollDetails,
    # nunca em displayMessage, entao sem tratar isso a enquete some.
    poll = snip.get("pollDetails")
    if poll:
        meta = poll.get("metadata") or {}
        texto = meta.get("questionText") or texto
        db.registrar_enquete(con, item.get("id"), video_id, offset, poll)

    # Evento que nao e mensagem de texto guarda o snippet original. Custa
    # pouco espaco e evita perder um campo novo da API por falta de codigo.
    bruto = None
    if tipo != "textMessageEvent":
        bruto = json.dumps(snip, ensure_ascii=False)[:4000]

    return {
        "bruto": bruto,
        "msg_id": item.get("id"),
        "video_id": video_id,
        "autor_pid": autor_pid,
        "publicado_em": publicado,
        "offset_segundos": offset,
        "tipo": tipo,
        "texto": texto,
        "moeda": moeda,
        "valor_micros": valor,
        "tier": tier,
    }


def coletar(con, info, limite_minutos=None):
    video_id = info["video_id"]
    chat_id = info["live_chat_id"]
    if not chat_id:
        log("essa live nao tem chat ativo, so a serie de audiencia sera coletada")

    inicio_dt = yt.parse_ts(info["inicio_real"])
    db.upsert_live(con, video_id, info["canal_id"])
    # um coletor que o vigia reinicia no meio da live continua a mesma coleta:
    # o inicio original fica, o fim e o pedido de parada antigos saem
    # coletor_pid: o vigia reiniciado reconhece este processo e nao sobe outro
    con.execute("""UPDATE live SET coleta_inicio = COALESCE(coleta_inicio, ?),
                   parar_pedido_em = NULL, coleta_fim = NULL, coletor_pid = ? WHERE video_id=?""",
                (db.agora(), os.getpid(), video_id))
    con.commit()

    janela = config.JANELA_PADRAO
    page_token = None
    proximo_chat = 0.0
    proxima_audiencia = 0.0
    t0 = time.time()

    total_msgs = 0
    total_doacoes = 0
    segundos_cobertos = 0.0
    ultimo_poll = None
    fim_previsto = t0 + limite_minutos * 60 if limite_minutos else None

    proxima_concorrencia = t0 + config.PRIMEIRA_CONCORRENCIA
    buscas_concorrencia = 0
    _tentar("inscritos antes", lambda: publico.registrar_canal(con, info["canal_id"], video_id, "antes"))

    log(f"coletando '{info['titulo']}' | janela inicial {janela}s")

    while not _parar:
        agora_s = time.time()
        if fim_previsto and agora_s >= fim_previsto:
            log("limite de tempo atingido")
            break
        if _parada_pedida(con, video_id):
            log("encerramento pedido pela interface")
            break

        # ---- concorrencia (search.list, 100 unidades + videos.list, 1)
        if (config.CONCORRENCIA_LIGADA and buscas_concorrencia < config.CONCORRENCIA_MAX
                and agora_s >= proxima_concorrencia and inicio_dt):
            off = int((datetime.now(timezone.utc) - inicio_dt).total_seconds())
            _tentar("concorrencia", lambda: publico.registrar_concorrencia(
                con, video_id, off, categoria=info.get("categoria"), idioma=info.get("idioma") or "pt"))
            buscas_concorrencia += 1
            proxima_concorrencia = agora_s + config.INTERVALO_CONCORRENCIA

        # ---- audiencia (videos.list, 1 unidade)
        if agora_s >= proxima_audiencia:
            try:
                atual = sincronizar_live(con, video_id, registrar=True)
            except yt.ErroCota as e:
                log(f"COTA ESGOTADA: {e}")
                break
            except (yt.ErroRede, yt.ErroAPI) as e:
                # nunca derrubar a coleta por uma leitura de audiencia:
                # perder um ponto da curva e barato, perder o chat nao e
                log(f"falha ao ler audiencia ({e}), seguindo")
                atual = None
            if atual:
                off = None
                if inicio_dt:
                    off = int((datetime.now(timezone.utc) - inicio_dt).total_seconds())
                db.inserir_snapshot(
                    con, video_id, off, atual["espectadores"],
                    atual["views"], atual["likes"],
                )
                con.commit()
                if atual["fim_real"]:
                    log("a live encerrou")
                    break
                if atual["live_chat_id"] and atual["live_chat_id"] != chat_id:
                    chat_id = atual["live_chat_id"]
                if atual["espectadores"] is not None:
                    log(f"espectadores: {atual['espectadores']:,}".replace(",", "."))
            proxima_audiencia = agora_s + config.INTERVALO_AUDIENCIA

        # ---- chat (liveChatMessages.list, 5 unidades)
        if chat_id and agora_s >= proximo_chat:
            try:
                resp = yt.pagina_chat(con, chat_id, page_token, video_id)
            except yt.ErroCota as e:
                log(f"COTA ESGOTADA: {e}")
                break
            except yt.ErroRede as e:
                # internet caiu e nao voltou dentro da paciencia. Nao desiste
                # do chat: continua o loop e tenta de novo na proxima janela.
                log(f"{e}")
                log("continuo tentando. A cobertura vai registrar esse buraco.")
                proximo_chat = agora_s + janela
                time.sleep(1)
                continue
            except yt.ErroAPI as e:
                # aqui a API respondeu algo que nao e transitorio. Antes de
                # desistir, tenta uma vez sem o pageToken: apos uma queda longa
                # o token guardado pode ter expirado.
                if page_token:
                    log(f"falha com o pageToken guardado ({e}), "
                        "reconectando o chat do zero")
                    page_token = None
                    proximo_chat = agora_s + 2
                    continue
                log(f"falha ao ler o chat: {e}")
                log("seguindo so com a coleta de audiencia. Se a live nao tiver "
                    "acabado, veja o status e o corpo do erro em coleta_log.")
                chat_id = None

            itens = resp.get("items", [])
            page_token = resp.get("nextPageToken")
            piso = (resp.get("pollingIntervalMillis") or 0) / 1000.0

            novas = 0
            for item in itens:
                m = _extrair(item, video_id, inicio_dt, con)
                if db.inserir_mensagem(con, m):
                    novas += 1
                    if m["valor_micros"]:
                        total_doacoes += m["valor_micros"]
            con.commit()
            total_msgs += novas

            # cobertura: so conta o intervalo se o poll anterior tambem
            # foi bem sucedido e o gap nao foi longo demais
            if ultimo_poll is not None:
                gap = agora_s - ultimo_poll
                if gap <= janela * 3:
                    segundos_cobertos += gap
            ultimo_poll = agora_s

            # janela adaptativa
            anterior = janela
            if len(itens) >= config.SATURACAO:
                janela = max(config.JANELA_MIN, janela // 2)
            elif len(itens) == 0:
                janela = min(config.JANELA_MAX, janela + 5)
            janela = max(janela, piso)
            if janela != anterior:
                log(f"janela ajustada: {anterior}s -> {janela}s "
                    f"(pagina com {len(itens)} itens)")

            if novas:
                log(f"+{novas} msgs (total {total_msgs}) | "
                    f"doacoes R$ {total_doacoes/1_000_000:.2f}")

            proximo_chat = agora_s + janela

        time.sleep(0.5)

    # ---------------------------------------------------------- encerramento
    fim = db.agora()
    db.upsert_live(con, video_id, info["canal_id"], coleta_fim=fim)
    final = sincronizar_live(con, video_id)
    if final:
        con.execute(
            """INSERT OR REPLACE INTO estatistica_final
                 (video_id, coletado_em, views, likes, comentarios)
               VALUES (?,?,?,?,NULL)""",
            (video_id, fim, final["views"], final["likes"]),
        )

    linha = db.get_live(con, video_id)
    duracao = linha["duracao_segundos"]
    if not duracao and linha["inicio_real"]:
        duracao = int(
            (datetime.now(timezone.utc) - yt.parse_ts(linha["inicio_real"])).total_seconds()
        )
    if duracao and duracao > 0:
        janela_coletada = time.time() - t0
        cobertura = min(100.0, 100.0 * segundos_cobertos / min(duracao, janela_coletada or duracao))
        db.upsert_live(con, video_id, info["canal_id"], cobertura_pct=round(cobertura, 2))
        log(f"cobertura da coleta: {cobertura:.1f}%")

    db.consolidar_autores(con, video_id)
    con.commit()
    _tentar("momentos", lambda: log(f"{report.pos_coleta(con, video_id)} momentos detectados"))

    _tentar("inscritos depois", lambda: publico.registrar_canal(con, info["canal_id"], video_id, "depois"))
    if final and final["fim_real"]:
        publico.agendar_pos_live(con, video_id, final["fim_real"])
        log("leituras de depois da live agendadas: +1 h ate +7 d")

    gasto = con.execute(
        "SELECT COALESCE(SUM(custo_unidades),0) u, COUNT(*) n FROM coleta_log WHERE video_id=?",
        (video_id,),
    ).fetchone()
    log(f"fim. {total_msgs} mensagens | doacoes R$ {total_doacoes/1_000_000:.2f} | "
        f"{gasto['n']} chamadas | {gasto['u']} unidades de cota")
    log(f"proximo passo: python report.py --video {video_id}")


def main():
    p = argparse.ArgumentParser(description="Coletor de lives do YouTube")
    p.add_argument("--video", help="id do video da live")
    p.add_argument("--canal", help="canal a vigiar via RSS ate a live comecar")
    p.add_argument("--minutos", type=int, help="parar depois de N minutos")
    args = p.parse_args()

    if not config.API_KEY:
        sys.exit("YT_API_KEY nao configurada. Veja o README e crie o arquivo .env")
    if not args.video and not args.canal:
        sys.exit("informe --video VIDEO_ID ou --canal @handle")

    con = db.conectar()
    n = db.expurgar_identidades(con)
    if n:
        log(f"{n} identidades anonimizadas por vencimento de retencao")

    if args.video:
        info = sincronizar_live(con, args.video)
        if not info:
            sys.exit("video nao encontrado")
        if info["status"] == "encerrada":
            log("ATENCAO: essa live ja acabou. O chat nao pode mais ser recuperado.")
            log("So estatisticas finais serao gravadas.")
            con.commit()
            return
    else:
        canal_id = yt.resolver_canal_id(args.canal)
        info = esperar_live(con, canal_id)
        if not info:
            return

    coletar(con, info, args.minutos)
    con.close()


if __name__ == "__main__":
    main()
