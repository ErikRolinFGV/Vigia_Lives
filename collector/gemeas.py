"""
Link gemeo: o mesmo conteudo passando em outro link do canal.

A CazeTV troca de link na hora H. Em 21/10 o link reservado do Palmeiras x
Fluminense virou privado e o jogo abriu em outro, com o mesmo titulo. Em
23/10 o link marcado da ginastica ("GINASTICA ARTISTICA | TIME BRASIL NA
FINAL FEMININA INDIVIDUAL DO MUNDIAL | 4o DIA") ficou indisponivel 29 s
depois de outro link, agendado para o mesmo horario, entrar no ar com a
transmissao ("FLAVIA SARAIVA E LORRANE OLIVEIRA NA FINAL! | MUNDIAL DE
GINASTICA ARTISTICA | 4o DIA"). Titulos diferentes demais para o nucleo:
nada foi coletado.

Aqui ficam as duas regras, para o vigia (que passa a coletar o gemeo) e a
API (que liga os dois na tela) decidirem igual.
"""
import re
import unicodedata
from datetime import timedelta

try:  # instalado como pacote
    from . import yt
except ImportError:  # rodando o arquivo direto
    import yt


def _ascii(t):
    return unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().upper()


def nucleo(titulo):
    """O que identifica o conteudo: 'AO VIVO: LEEDS X MAN UTD | PREMIER...' -> 'LEEDS X MAN UTD'."""
    t = _ascii((titulo or "").split("|")[0])
    t = re.sub(r"\((SOM AMBIENTE|AO VIVO)\)", " ", t)
    t = re.sub(r"^\s*(AO VIVO|JOGO COMPLETO|REPRISE|MELHORES MOMENTOS)\s*[:\-]?", " ", t)
    return re.sub(r"[^A-Z0-9]+", " ", t).strip()


# palavras que aparecem em quase todo titulo do canal e nao dizem qual e o conteudo
GENERICAS = {
    "VIVO", "JOGO", "COMPLETO", "REPRISE", "COMPACTO", "OLIMPICO", "MELHORES", "MOMENTOS", "SOM", "AMBIENTE",
    "NARRACAO", "NOCHE", "COPA", "LEAGUE", "RODADA", "PROGRAMA", "CAZETV", "COM", "PARA", "PELA", "PELO",
}


def palavras(titulo):
    """As palavras do titulo que distinguem o conteudo (4+ letras, sem numero, sem as genericas)."""
    return {w for w in re.findall(r"[A-Z]{4,}", _ascii(titulo)) if w not in GENERICAS}


# o gemeo entra no ar perto do horario marcado do link que sumiu (em 23/10, 15 s depois)
PERTO = timedelta(minutes=10)


def pelo_horario(con, l):
    """
    Lives do mesmo canal que entraram no ar a ate PERTO do horario marcado de
    `l` e dividem com ela 2 ou mais palavras do titulo. So vale quando ha uma
    unica candidata: em 22/10 a CazeTV abriu quatro lives "SOM AMBIENTE" as
    16h30, e ai nao da para saber qual seria a gemea.

    `l` precisa de video_id, canal_id, titulo e agendada_para. Devolve linhas
    com video_id, titulo, status, inicio_real e coletar.
    """
    ini = yt.parse_ts(l["agendada_para"])
    if not ini:
        return []
    rows = con.execute(
        """SELECT video_id, titulo, status, inicio_real, coletar FROM main.live
           WHERE canal_id = ? AND video_id != ? AND status IN ('ao_vivo','encerrada')
             AND inicio_real BETWEEN ? AND ?""",
        (l["canal_id"], l["video_id"], (ini - PERTO).isoformat(timespec="seconds"),
         (ini + PERTO).isoformat(timespec="seconds"))).fetchall()
    meu = palavras(l["titulo"])
    achadas = [r for r in rows if len(meu & palavras(r["titulo"])) >= 2]
    return achadas if len(achadas) == 1 else []
