"""
Registro do que acontece no vigia, nos coletores e na API.

Antes era so print: no PC dava para olhar o terminal, numa VM ninguem olha.
Agora tudo continua saindo na tela (e em data/vigia.log, como antes), e o
que e aviso ou erro tambem vai para a tabela `evento` do banco, com a
origem, a live e o traceback. O admin le isso na pagina Registro da
interface (GET /api/operacao/eventos), sem precisar entrar na maquina.

    log = registro.Registro("vigia")
    log("ciclo ok")                     # so na tela
    log.aviso("RSS fora, sigo")         # tela + banco
    log.erro("agenda falhou", e)        # tela + banco, com o traceback de e

O mesmo aviso repetido em poucos minutos (a internet caiu e o coletor
tenta a cada 20 s) nao vira uma linha por tentativa: a linha que ja existe
ganha +1 em `repeticoes`.
"""
import sqlite3
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import config
except ImportError:  # rodando o arquivo direto
    import config

NIVEIS = ("aviso", "erro", "critico")
JUNTAR = 10 * 60          # mesmo evento dentro disso: soma repeticao
GUARDAR = timedelta(days=60)


def _agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Registro:
    def __init__(self, origem, video_id=None):
        self.origem = origem          # 'vigia', 'coletor' ou 'api'
        self.video_id = video_id
        self._ultimos = {}            # (nivel, video, msg) -> (id da linha, quando)

    def _tela(self, msg, prefixo=""):
        quem = f"{self.origem} {self.video_id}" if self.video_id else self.origem
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{quem}] {prefixo}{msg}", flush=True)

    def __call__(self, msg):
        self._tela(msg)

    def aviso(self, msg, video_id=None):
        self._tela(msg, "AVISO: ")
        self._gravar("aviso", msg, None, video_id)

    def erro(self, msg, exc=None, video_id=None):
        self._tela(msg + (f" ({type(exc).__name__}: {exc})" if exc else ""), "ERRO: ")
        self._gravar("erro", msg, exc, video_id)

    def critico(self, msg, exc=None, video_id=None):
        self._tela(msg, "CRITICO: ")
        self._gravar("critico", msg, exc, video_id)

    def _gravar(self, nivel, msg, exc, video_id):
        video = video_id or self.video_id
        detalhe = None
        if exc is not None:
            detalhe = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-8000:]
        chave = (nivel, video, msg[:160])
        try:
            # conexao propria e curta: quem chama pode estar no meio de uma
            # transacao, e o registro nao pode desfazer nem travar a coleta
            con = sqlite3.connect(config.CAMINHO_DB, timeout=10)
            try:
                ant = self._ultimos.get(chave)
                if ant and time.time() - ant[1] < JUNTAR:
                    con.execute("UPDATE evento SET repeticoes = repeticoes + 1, ultimo_em = ?, detalhe = COALESCE(?, detalhe) "
                                "WHERE id = ?", (_agora(), detalhe, ant[0]))
                else:
                    cur = con.execute(
                        "INSERT INTO evento (em, ultimo_em, nivel, origem, video_id, mensagem, detalhe) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (_agora(), _agora(), nivel, self.origem, video, msg, detalhe))
                    self._ultimos[chave] = (cur.lastrowid, time.time())
                con.commit()
            finally:
                con.close()
        except sqlite3.Error as e:
            # banco travado ou sem a tabela: o evento fica so na tela
            print(f"[registro] nao gravei o evento ({e})", file=sys.stderr, flush=True)

    def capturar_quedas(self):
        """Erro que derruba o processo (fora de qualquer try) tambem fica registrado."""
        padrao = sys.excepthook

        def gancho(tipo, valor, tb):
            if not issubclass(tipo, (KeyboardInterrupt, SystemExit)):
                self.critico(f"o processo caiu: {tipo.__name__}: {valor}", valor)
            padrao(tipo, valor, tb)
        sys.excepthook = gancho


def limpar(con):
    """Apaga eventos com mais de GUARDAR. O vigia chama a cada ciclo (e barato)."""
    corte = (datetime.now(timezone.utc) - GUARDAR).isoformat(timespec="seconds")
    con.execute("DELETE FROM evento WHERE ultimo_em < ?", (corte,))
    con.commit()
