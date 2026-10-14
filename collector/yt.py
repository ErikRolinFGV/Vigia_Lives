"""
Cliente da YouTube Data API v3 usando apenas a biblioteca padrao.
Nao depende de google-api-python-client de proposito: menos superficie de
instalacao e o custo de cada chamada fica explicito no codigo.

Toda chamada e registrada em coleta_log. Esse log e o instrumento que
responde a pergunta em aberto da arquitetura v0.1: quanto a coleta
realmente consome contra o previsto.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

try:  # instalado como pacote
    from . import config, db
except ImportError:  # rodando o arquivo direto
    import config
    import db

BASE = "https://www.googleapis.com/youtube/v3/"
UA = "lives-ytb-collector/0.1"

# O caminho na URL quase sempre e o nome do recurso, mas o chat ao vivo e
# excecao: o metodo se chama liveChatMessages.list e o endpoint e
# liveChat/messages. Derivar o caminho do nome do metodo devolve 404 com
# corpo vazio, que parece erro de live encerrada e nao e.
CAMINHO = {
    "liveChatMessages": "liveChat/messages",
    "liveChatBans": "liveChat/bans",
    "liveChatModerators": "liveChat/moderators",
}


class ErroCota(Exception):
    pass


class ErroRede(Exception):
    """
    Falha de conectividade, nao resposta da API. Separada de proposito:
    queda de internet e transitoria e a coleta deve esperar a volta, nao
    desistir. Confundir as duas faz o coletor abandonar o chat de uma live
    inteira por causa de 6 segundos de wi-fi ruim.
    """
    pass


class ErroAPI(Exception):
    pass


def _iso(s):
    if not s:
        return None
    return s.replace("Z", "+00:00")


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(_iso(s))
    except ValueError:
        return None


def chamar(con, metodo, params, video_id=None, tentativas=3,
           paciencia_seg=None):
    """
    metodo: 'videos.list', 'liveChatMessages.list', ...
    Devolve o JSON decodificado. Registra custo, status e itens em coleta_log.

    Erro de API: tenta `tentativas` vezes e levanta ErroAPI.
    Erro de rede: insiste com espera crescente por ate `paciencia_seg`
    (padrao config.PACIENCIA_REDE) e levanta ErroRede. Chamada que falha
    por rede NAO consome cota, entao insistir e barato.
    """
    if paciencia_seg is None:
        paciencia_seg = getattr(config, "PACIENCIA_REDE", 600)
    recurso = metodo.split(".")[0]
    custo = config.CUSTO.get(metodo, 1)
    url = BASE + CAMINHO.get(recurso, recurso) + "?" + urllib.parse.urlencode(
        {**params, "key": config.API_KEY}
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA})

    espera = 2
    gasto_em_rede = 0.0
    tentativa_api = 0
    ultimo_erro_rede = None
    while True:
        status, erro, itens, dados, foi_rede = None, None, None, None, False
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status = resp.status
                dados = json.loads(resp.read().decode("utf-8"))
                itens = len(dados.get("items", []))
        except urllib.error.HTTPError as e:
            status = e.code
            corpo = e.read().decode("utf-8", "replace")
            erro = corpo[:500] or f"HTTP {status} sem corpo na resposta"
            if status == 403 and "quota" in corpo.lower():
                _log(con, video_id, metodo, custo, status, itens,
                     params.get("pageToken"), erro)
                con.commit()
                raise ErroCota(corpo[:300])
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            # sem DNS, sem rota, conexao recusada, timeout: e rede
            foi_rede = True
            erro = f"rede: {type(e).__name__}: {e}"[:500]
            ultimo_erro_rede = erro
        except Exception as e:
            erro = f"{type(e).__name__}: {e}"[:500]

        # chamada que nao chegou ao servidor nao consome cota: registrar
        # custo 0 mantem o quota.py fiel numa live com internet instavel
        _log(con, video_id, metodo, 0 if foi_rede else custo, status, itens,
             params.get("pageToken"), erro)
        con.commit()

        if dados is not None:
            return dados

        if foi_rede:
            if gasto_em_rede >= paciencia_seg:
                raise ErroRede(
                    f"{metodo}: sem conexao ha {int(gasto_em_rede)}s "
                    f"({ultimo_erro_rede})")
            pausa = min(espera, 30)
            time.sleep(pausa)
            gasto_em_rede += pausa
            espera = min(espera * 2, 30)
            continue

        tentativa_api += 1
        if tentativa_api >= tentativas:
            raise ErroAPI(f"{metodo} falhou apos {tentativas} tentativas: {erro}")
        time.sleep(2 ** tentativa_api)


def _log(con, video_id, metodo, custo, status, itens, page_token, erro):
    con.execute(
        """INSERT INTO coleta_log
             (video_id, metodo, chamado_em, custo_unidades, http_status,
              itens_recebidos, page_token, erro)
           VALUES (?,?,?,?,?,?,?,?)""",
        (video_id, metodo, db.agora(), custo, status, itens, page_token, erro),
    )


# ---------------------------------------------------------------- endpoints

def video(con, video_id, part="snippet,liveStreamingDetails,statistics"):
    """1 unidade. Traz status da live, chat id, inicio real e estatisticas."""
    d = chamar(con, "videos.list", {"part": part, "id": video_id}, video_id=video_id)
    itens = d.get("items", [])
    return itens[0] if itens else None


def videos(con, ids, part="snippet,liveStreamingDetails,statistics"):
    """
    1 unidade para ate 50 ids: o custo do videos.list e por chamada, nao
    por video. Ler a agenda de um canal em lote custa o mesmo que ler uma
    live so.
    """
    saida = []
    for i in range(0, len(ids), 50):
        d = chamar(con, "videos.list", {"part": part, "id": ",".join(ids[i:i + 50])})
        saida += d.get("items", [])
    return saida


def canal(con, canal_id):
    d = chamar(
        con, "channels.list",
        {"part": "snippet,statistics", "id": canal_id},
    )
    itens = d.get("items", [])
    return itens[0] if itens else None


def comentarios(con, video_id, n=20):
    """
    Comentarios mais relevantes do video gravado (o YouTube ordena por
    curtidas e respostas). 1 unidade. Devolve [] se os comentarios estao
    desativados.
    """
    try:
        d = chamar(con, "commentThreads.list",
                   {"part": "snippet", "videoId": video_id, "order": "relevance",
                    "maxResults": min(n, 100), "textFormat": "plainText"},
                   video_id=video_id)
    except ErroAPI as e:
        if "commentsDisabled" in str(e) or "disabled comments" in str(e):
            return []
        raise
    return d.get("items", [])


def uploads(con, canal_id, ate=None, max_paginas=1):
    """
    Videos da playlist de uploads do canal (UC... -> UU...), do mais novo
    para o mais antigo. 1 unidade por pagina de 50. Com `ate` (ISO), pagina
    ate passar dessa data ou chegar a `max_paginas`.
    """
    playlist = "UU" + canal_id[2:]
    ids, token = [], None
    for _ in range(max_paginas):
        params = {"part": "contentDetails", "playlistId": playlist, "maxResults": 50}
        if token:
            params["pageToken"] = token
        d = chamar(con, "playlistItems.list", params)
        mais_antigo = None
        for i in d.get("items", []):
            cd = i.get("contentDetails") or {}
            if cd.get("videoId"):
                ids.append(cd["videoId"])
                mais_antigo = cd.get("videoPublishedAt") or mais_antigo
        token = d.get("nextPageToken")
        if not token or not ate or (mais_antigo and mais_antigo < ate):
            break
    return ids


def lives_no_ar(con, categoria=None, idioma="pt", regiao="BR", n=10, video_id=None):
    """
    Outras transmissoes no ar agora, na mesma categoria e idioma.
    search.list: 100 unidades. Devolve ids; o numero de espectadores sai de
    um videos.list em seguida.
    """
    params = {"part": "id", "type": "video", "eventType": "live", "order": "viewCount",
              "regionCode": regiao, "relevanceLanguage": idioma, "maxResults": n}
    if categoria:
        params["videoCategoryId"] = categoria
    d = chamar(con, "search.list", params, video_id=video_id)
    return [i["id"]["videoId"] for i in d.get("items", []) if i.get("id", {}).get("videoId")]


def pagina_chat(con, live_chat_id, page_token=None, video_id=None):
    """
    5 unidades por chamada. E o gargalo de cota do sistema inteiro.
    O nextPageToken devolve tudo desde a ultima chamada, entao espacar
    o polling troca latencia por cota, nao completude por cota.
    """
    params = {
        "part": "snippet,authorDetails",
        "liveChatId": live_chat_id,
        "maxResults": config.MAX_RESULTS,
    }
    if page_token:
        params["pageToken"] = page_token
    return chamar(con, "liveChatMessages.list", params, video_id=video_id)


def feed_rss(canal_id):
    """
    Feed publico do canal. Custo zero de cota, ao contrario de search.list,
    que desde junho de 2026 tem bucket proprio de cerca de 100 chamadas/dia.
    Devolve lista de (video_id, titulo, publicado_em).
    """
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={canal_id}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        xml = resp.read().decode("utf-8", "replace")

    import re
    saida = []
    for entry in re.findall(r"<entry>(.*?)</entry>", xml, re.S):
        vid = re.search(r"<yt:videoId>(.*?)</yt:videoId>", entry)
        tit = re.search(r"<title>(.*?)</title>", entry, re.S)
        pub = re.search(r"<published>(.*?)</published>", entry)
        if vid:
            saida.append((
                vid.group(1),
                tit.group(1).strip() if tit else None,
                pub.group(1) if pub else None,
            ))
    return saida


def ids_da_pagina(canal, aba="streams"):
    """
    Le a pagina publica do canal e extrai os videoIds na ordem em que
    aparecem. Custo zero de cota. A aba /streams e o unico lugar onde
    lives AGENDADAS aparecem de forma confiavel: o feed RSS so lista o
    que ja foi publicado, entao uma live marcada para semana que vem
    pode simplesmente nao estar la.
    """
    import re
    v = canal.strip()
    if v.startswith("UC") and len(v) == 24:
        url = f"https://www.youtube.com/channel/{v}/{aba}"
    else:
        if "youtube.com" in v:
            m = re.search(r"@([\w.-]+)", v)
            v = "@" + m.group(1) if m else v
        if not v.startswith("@"):
            v = "@" + v
        url = f"https://www.youtube.com/{v}/{aba}"

    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", "replace")

    vistos, saida = set(), []
    for m in re.finditer(r'"videoId":"([\w-]{11})"', html):
        if m.group(1) not in vistos:
            vistos.add(m.group(1))
            saida.append(m.group(1))
    return saida


def resolver_canal_id(handle_ou_id):
    """
    Aceita UC..., @handle ou url. Para @handle usa a pagina publica do canal
    em vez de search.list, que custaria 100 unidades.
    """
    v = handle_ou_id.strip()
    if v.startswith("UC") and len(v) == 24:
        return v
    if "youtube.com" in v:
        import re
        m = re.search(r"channel/(UC[\w-]{22})", v)
        if m:
            return m.group(1)
        m = re.search(r"@([\w.-]+)", v)
        if m:
            v = "@" + m.group(1)
    if not v.startswith("@"):
        v = "@" + v
    url = f"https://www.youtube.com/{v}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", "replace")
    import re
    m = re.search(r'"(?:externalId|channelId)":"(UC[\w-]{22})"', html)
    if not m:
        raise ErroAPI(f"nao consegui resolver o canal a partir de {handle_ou_id}")
    return m.group(1)
