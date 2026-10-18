"""
Configuracao do coletor. Le variaveis de um arquivo .env na raiz do projeto
sem depender de biblioteca externa.
"""
import os
import secrets
from pathlib import Path

def _descobrir_raiz() -> Path:
    """
    Raiz do projeto: onde ficam .env, db/schema.sql, data/ e reports/.
    Ordem de resolucao:
      1. variavel de ambiente LIVES_HOME, se definida
      2. diretorio atual, se ele parecer a raiz do projeto
      3. pasta acima deste arquivo (caso de execucao direta ou pip install -e)
    O passo 2 e o que faz os comandos instalados (lives-coletar e cia)
    funcionarem a partir da pasta do projeto.
    """
    env = os.environ.get("LIVES_HOME")
    if env:
        return Path(env).resolve()
    cwd = Path.cwd()
    for cand in (cwd, *cwd.parents):
        if (cand / "db" / "schema.sql").exists():
            return cand
    return Path(__file__).resolve().parent.parent


RAIZ = _descobrir_raiz()
CAMINHO_ENV = RAIZ / ".env"


def _carregar_env():
    if not CAMINHO_ENV.exists():
        return
    for linha in CAMINHO_ENV.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, valor = linha.split("=", 1)
        os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


_carregar_env()


def _garantir_salt():
    """
    O salt define o pseudonimo autor_pid. Se ele mudar, todo autor vira
    uma pessoa nova e o historico se perde. Por isso e gerado uma unica
    vez e gravado no .env.
    """
    salt = os.environ.get("PID_SALT")
    if salt:
        return salt
    salt = secrets.token_hex(32)
    with open(CAMINHO_ENV, "a", encoding="utf-8") as f:
        f.write(f"\nPID_SALT={salt}\n")
    os.environ["PID_SALT"] = salt
    print("[config] PID_SALT gerado e gravado no .env. NAO apague esse valor.")
    return salt


API_KEY = os.environ.get("YT_API_KEY", "")
PID_SALT = _garantir_salt()

CAMINHO_DB = Path(os.environ.get("DB_PATH", RAIZ / "data" / "lives.db"))
CAMINHO_SCHEMA = RAIZ / "db" / "schema.sql"
DIR_RELATORIOS = RAIZ / "reports"

# Janela adaptativa de coleta do chat, em segundos.
# 20 s e o padrao fechado na arquitetura v0.1: cerca de 2.700 unidades
# numa live de 3 h, ou 27% da cota diaria gratuita.
JANELA_MIN = 5
JANELA_PADRAO = 20
JANELA_MAX = 60
SATURACAO = 1800          # itens numa pagina que indicam janela larga demais
MAX_RESULTS = 2000

# Polling de concurrentViewers. videos.list custa 1 unidade.
INTERVALO_AUDIENCIA = 60

# Retencao de dado pessoal em autor_identidade, em dias.
RETENCAO_IDENTIDADE_DIAS = 90

# Quanto tempo insistir quando a internet cai, em segundos. Chamada que
# falha por rede nao consome cota, entao esperar e barato: 20 minutos de
# paciencia salva uma coleta de 3 h de um roteador que reiniciou.
PACIENCIA_REDE = 1200

CUSTO = {
    "videos.list": 1,
    "channels.list": 1,
    "liveChatMessages.list": 5,
    "search.list": 100,
    "commentThreads.list": 1,
    "playlistItems.list": 1,
}

# Todas as partes publicas do video numa chamada so: o custo do videos.list
# e por chamada, nao por parte. Ficha, horarios e contadores saem juntos.
PARTES_VIDEO = "snippet,liveStreamingDetails,statistics,contentDetails,topicDetails,status"

# Concorrencia: outras lives no ar durante a coleta. Cada busca custa 100
# unidades (search.list), o equivalente a 20 leituras de chat: a cada 15 min
# ela gastou mais que o proprio chat (18/10: 3.500 de 7.765 unidades no dia).
# Agora: a primeira aos 10 min no ar, depois de hora em hora, no maximo 3 por
# live. CONCORRENCIA=0 no .env desliga.
CONCORRENCIA_LIGADA = os.environ.get("CONCORRENCIA", "1") != "0"
PRIMEIRA_CONCORRENCIA = 10 * 60
INTERVALO_CONCORRENCIA = 60 * 60
CONCORRENCIA_MAX = 3
CUSTO_CONCORRENCIA = 101  # search.list + videos.list dos rivais
