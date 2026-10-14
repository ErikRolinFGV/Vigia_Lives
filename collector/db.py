"""
Camada de banco. SQLite na PoC, migravel para Postgres.
Toda escrita e idempotente: rodar o coletor duas vezes na mesma live
nao duplica mensagem nenhuma, porque msg_id vem da API.
"""
import hashlib
import sqlite3
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import config
except ImportError:  # rodando o arquivo direto
    import config


def agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def conectar(multithread=False):
    """
    multithread=True e para a API: o FastAPI pode abrir a conexao numa
    thread e usar em outra. Cada request continua com a sua conexao.
    """
    # arquivo de tamanho zero conta como inexistente: e o que sobra
    # quando uma execucao anterior morreu antes de aplicar o schema
    primeira_vez = (not config.CAMINHO_DB.exists()
                    or config.CAMINHO_DB.stat().st_size == 0)
    config.CAMINHO_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.CAMINHO_DB, check_same_thread=not multithread,
                          timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    if primeira_vez:
        con.executescript(config.CAMINHO_SCHEMA.read_text(encoding="utf-8"))
        con.commit()
        print(f"[db] banco criado em {config.CAMINHO_DB}")
    migrar(con)
    return con


def _colunas(con, tabela):
    return {r[1] for r in con.execute(f"PRAGMA table_info({tabela})")}


def _add_coluna(con, tabela, coluna, tipo):
    if coluna not in _colunas(con, tabela):
        con.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo}")


def migrar(con):
    """
    Migracao leve e idempotente, para bancos criados antes de uma coluna
    ou tabela existir. Roda em toda conexao, e idempotente e so preenche
    colunas novas na primeira vez que elas aparecem.
    """
    con.execute("""CREATE TABLE IF NOT EXISTS enquete (
        enquete_id TEXT PRIMARY KEY, video_id TEXT NOT NULL,
        offset_segundos INTEGER, pergunta TEXT, status TEXT, opcoes TEXT,
        total_votos INTEGER, bruto TEXT, coletado_em TEXT NOT NULL,
        atualizado_em TEXT)""")
    con.execute("""CREATE INDEX IF NOT EXISTS idx_enquete_live
                   ON enquete(video_id, offset_segundos)""")
    # guarda o snippet original de eventos que nao sao texto simples.
    # E a apolice contra o proximo campo que a API tiver e o codigo ignorar.
    _add_coluna(con, "mensagem", "bruto", "TEXT")

    # v2: canal vigiado. Vigiar e uma assinatura sobre o canal; parar de
    # vigiar preenche removido_em e nao apaga coleta nenhuma.
    novo_vigiado = "vigiado" not in _colunas(con, "canal")
    _add_coluna(con, "canal", "vigiado", "INTEGER NOT NULL DEFAULT 0")
    _add_coluna(con, "canal", "vigiado_desde", "TEXT")
    _add_coluna(con, "canal", "removido_em", "TEXT")
    _add_coluna(con, "canal", "foto_url", "TEXT")      # snippet.thumbnails
    _add_coluna(con, "canal", "foto_local", "TEXT")    # upload do usuario
    if novo_vigiado:
        # canais que ja tem coleta estavam sob vigilancia desde a primeira
        con.execute(
            """UPDATE canal SET vigiado = 1, vigiado_desde = (
                   SELECT MIN(COALESCE(l.coleta_inicio, l.criado_em)) FROM live l
                   WHERE l.canal_id = canal.canal_id)
               WHERE EXISTS (SELECT 1 FROM live l WHERE l.canal_id = canal.canal_id)""")
    _add_coluna(con, "canal", "agenda_lida_em", "TEXT")
    _add_coluna(con, "canal", "uploads_lidos_em", "TEXT")
    # a interface pede para encerrar; o coletor confere a cada volta do loop
    _add_coluna(con, "live", "parar_pedido_em", "TEXT")

    # batimento do vigia: uma linha so, atualizada a cada ciclo. E o que a
    # interface consulta antes de dizer "coleta de pe".
    con.execute("""CREATE TABLE IF NOT EXISTS vigia_batimento (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        iniciado_em TEXT NOT NULL, ultimo_ciclo TEXT NOT NULL, pid INTEGER)""")

    # v2: dados publicos do video e do canal, lidos durante e depois da live.
    # fase: 'durante' (polling do coletor), 'pos' (jobs depois do fim, com
    # rotulo '+1 h'...'+7 d') ou 'avulsa' (leitura fora de agenda, como a
    # que completa uma coleta antiga).
    con.executescript("""
    CREATE TABLE IF NOT EXISTS video_snapshot (
        video_id TEXT NOT NULL, coletado_em TEXT NOT NULL, fase TEXT NOT NULL,
        rotulo TEXT, titulo TEXT, thumb_url TEXT,
        views INTEGER, likes INTEGER, comentarios INTEGER,
        bruto TEXT,
        PRIMARY KEY (video_id, coletado_em, fase));
    CREATE TABLE IF NOT EXISTS canal_snapshot (
        canal_id TEXT NOT NULL, coletado_em TEXT NOT NULL,
        video_id TEXT, fase TEXT, inscritos INTEGER, videos INTEGER,
        PRIMARY KEY (canal_id, coletado_em));
    CREATE TABLE IF NOT EXISTS pos_live_job (
        video_id TEXT NOT NULL, tipo TEXT NOT NULL, rotulo TEXT NOT NULL,
        executar_em TEXT NOT NULL, feito_em TEXT, erro TEXT,
        PRIMARY KEY (video_id, tipo, rotulo));
    -- comentario do video gravado. Autor so por pseudonimo: o handle fica
    -- em autor_identidade, como o de quem escreve no chat.
    CREATE TABLE IF NOT EXISTS comentario_top (
        comentario_id TEXT PRIMARY KEY, video_id TEXT NOT NULL,
        autor_pid TEXT, texto TEXT, likes INTEGER, respostas INTEGER,
        publicado_em TEXT, coletado_em TEXT NOT NULL);
    -- lives do canal lidas da playlist de uploads, vigiadas ou nao
    CREATE TABLE IF NOT EXISTS video_publico (
        video_id TEXT PRIMARY KEY, canal_id TEXT NOT NULL, titulo TEXT,
        publicado_em TEXT, agendada_para TEXT, inicio TEXT, fim TEXT,
        views INTEGER, likes INTEGER, comentarios INTEGER, coletado_em TEXT NOT NULL);
    -- outras lives no ar no mesmo horario (search.list eventType=live)
    CREATE TABLE IF NOT EXISTS concorrencia (
        video_id TEXT NOT NULL, coletado_em TEXT NOT NULL, offset_segundos INTEGER,
        rival_video_id TEXT NOT NULL, rival_canal TEXT, titulo TEXT, espectadores INTEGER,
        PRIMARY KEY (video_id, coletado_em, rival_video_id));
    CREATE TABLE IF NOT EXISTS cambio (
        data TEXT NOT NULL, moeda TEXT NOT NULL, brl REAL NOT NULL,
        PRIMARY KEY (data, moeda));
    CREATE TABLE IF NOT EXISTS publicacao (
        slug TEXT PRIMARY KEY, canal_slug TEXT NOT NULL, video_id TEXT NOT NULL,
        emitido_em TEXT NOT NULL, revogado_em TEXT);
    CREATE TABLE IF NOT EXISTS dossie (
        video_id TEXT PRIMARY KEY, gerado_em TEXT NOT NULL, modelo TEXT NOT NULL,
        conteudo TEXT NOT NULL);
    """)
    # quem publicou o relatorio aparece no rodape do link publico
    _add_coluna(con, "publicacao", "autor_nome", "TEXT")
    _add_coluna(con, "publicacao", "instituicao", "TEXT")
    _add_coluna(con, "publicacao", "orcid", "TEXT")

    # detectada_em: quando a plataforma soube da transmissao pela primeira
    # vez. E o que separa PERDIDA (sabiamos e ninguem coletou) de uma live
    # antiga que so apareceu depois de acabar (nao vigiada).
    if "detectada_em" not in _colunas(con, "live"):
        _add_coluna(con, "live", "detectada_em", "TEXT")
        con.execute("UPDATE live SET detectada_em = COALESCE(coleta_inicio, criado_em)")
    con.commit()


def pid(canal_autor_id: str) -> str:
    """Pseudonimo estavel do autor. Fronteira de dado pessoal do sistema."""
    return hashlib.sha256(
        (canal_autor_id + config.PID_SALT).encode("utf-8")
    ).hexdigest()


# ---------------------------------------------------------------- canal e live

def upsert_canal(con, canal_id, nome, handle=None, inscritos=None):
    con.execute(
        """INSERT INTO canal (canal_id, nome, handle, inscritos, atualizado_em)
           VALUES (?,?,?,?,?)
           ON CONFLICT(canal_id) DO UPDATE SET
             nome=excluded.nome,
             handle=COALESCE(excluded.handle, canal.handle),
             inscritos=COALESCE(excluded.inscritos, canal.inscritos),
             atualizado_em=excluded.atualizado_em""",
        (canal_id, nome, handle, inscritos, agora()),
    )


def upsert_live(con, video_id, canal_id, **campos):
    con.execute(
        "INSERT OR IGNORE INTO live (video_id, canal_id, criado_em) VALUES (?,?,?)",
        (video_id, canal_id, agora()),
    )
    if campos:
        campos = {k: v for k, v in campos.items() if v is not None}
        if campos:
            sets = ", ".join(f"{k}=?" for k in campos)
            con.execute(
                f"UPDATE live SET {sets} WHERE video_id=?",
                (*campos.values(), video_id),
            )


def get_live(con, video_id):
    return con.execute("SELECT * FROM live WHERE video_id=?", (video_id,)).fetchone()


# ---------------------------------------------------------------- autores

def registrar_autor(con, canal_autor_id, nome_exibicao, url_foto, video_id, papeis):
    autor_pid = pid(canal_autor_id)
    ts = agora()
    expurgo = (
        datetime.now(timezone.utc) + timedelta(days=config.RETENCAO_IDENTIDADE_DIAS)
    ).isoformat(timespec="seconds")

    con.execute(
        """INSERT INTO autor_identidade
             (autor_pid, canal_autor_id, nome_exibicao, url_foto, coletado_em, expurgar_em)
           VALUES (?,?,?,?,?,?)
           ON CONFLICT(autor_pid) DO UPDATE SET nome_exibicao=excluded.nome_exibicao""",
        (autor_pid, canal_autor_id, nome_exibicao, url_foto, ts, expurgo),
    )
    con.execute(
        """INSERT INTO autor (autor_pid, primeira_msg_em, ultima_msg_em)
           VALUES (?,?,?)
           ON CONFLICT(autor_pid) DO UPDATE SET ultima_msg_em=excluded.ultima_msg_em""",
        (autor_pid, ts, ts),
    )
    con.execute(
        """INSERT INTO autor_papel_live
             (autor_pid, video_id, is_dono, is_moderador, is_membro,
              membro_desde_meses, is_verificado)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(autor_pid, video_id) DO UPDATE SET
             is_moderador=MAX(autor_papel_live.is_moderador, excluded.is_moderador),
             is_membro=MAX(autor_papel_live.is_membro, excluded.is_membro),
             membro_desde_meses=COALESCE(excluded.membro_desde_meses,
                                         autor_papel_live.membro_desde_meses)""",
        (
            autor_pid, video_id,
            int(papeis.get("dono", False)),
            int(papeis.get("moderador", False)),
            int(papeis.get("membro", False)),
            papeis.get("membro_meses"),
            int(papeis.get("verificado", False)),
        ),
    )
    return autor_pid


def registrar_identidade(con, canal_autor_id, nome_exibicao):
    """
    Pseudonimo de quem aparece fora do chat (autor de comentario do video).
    Mesma fronteira de dado pessoal do chat: o nome fica so em
    autor_identidade, com o mesmo expurgo programado.
    """
    autor_pid = pid(canal_autor_id)
    expurgo = (
        datetime.now(timezone.utc) + timedelta(days=config.RETENCAO_IDENTIDADE_DIAS)
    ).isoformat(timespec="seconds")
    con.execute(
        """INSERT INTO autor_identidade
             (autor_pid, canal_autor_id, nome_exibicao, url_foto, coletado_em, expurgar_em)
           VALUES (?,?,?,NULL,?,?)
           ON CONFLICT(autor_pid) DO UPDATE SET nome_exibicao=excluded.nome_exibicao""",
        (autor_pid, canal_autor_id, nome_exibicao, agora(), expurgo),
    )
    return autor_pid


# ---------------------------------------------------------------- mensagens

def inserir_mensagem(con, m):
    cur = con.execute(
        """INSERT OR IGNORE INTO mensagem
             (msg_id, video_id, autor_pid, publicado_em, offset_segundos,
              tipo, texto, moeda, valor_micros, tier, coletado_em, bruto)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            m["msg_id"], m["video_id"], m["autor_pid"], m["publicado_em"],
            m["offset_segundos"], m["tipo"], m["texto"], m["moeda"],
            m["valor_micros"], m["tier"], agora(), m.get("bruto"),
        ),
    )
    return cur.rowcount == 1


def consolidar_autores(con, video_id):
    """Recalcula contadores agregados de autor a partir do dado bruto."""
    con.execute(
        """UPDATE autor SET
             msgs_totais = (SELECT COUNT(*) FROM mensagem m
                            WHERE m.autor_pid = autor.autor_pid),
             doacoes_micros = (SELECT COALESCE(SUM(valor_micros),0) FROM mensagem m
                               WHERE m.autor_pid = autor.autor_pid),
             lives_participadas = (SELECT COUNT(DISTINCT video_id) FROM mensagem m
                                   WHERE m.autor_pid = autor.autor_pid)
           WHERE autor_pid IN (SELECT DISTINCT autor_pid FROM mensagem
                               WHERE video_id = ?)""",
        (video_id,),
    )
    # Perfil e classificacao de comportamento, nunca de pessoa.
    con.execute(
        """UPDATE autor SET perfil = CASE
             WHEN doacoes_micros > 0 THEN 'doador'
             WHEN lives_participadas >= 5 THEN 'fiel'
             WHEN lives_participadas >= 2 THEN 'recorrente'
             ELSE 'novo' END
           WHERE autor_pid IN (SELECT DISTINCT autor_pid FROM mensagem
                               WHERE video_id = ?)""",
        (video_id,),
    )


# ---------------------------------------------------------------- audiencia

def inserir_snapshot(con, video_id, offset_seg, espectadores, views, likes):
    con.execute(
        """INSERT OR IGNORE INTO snapshot_audiencia
             (video_id, coletado_em, offset_segundos, espectadores,
              views_acumuladas, likes)
           VALUES (?,?,?,?,?,?)""",
        (video_id, agora(), offset_seg, espectadores, views, likes),
    )


# ---------------------------------------------------------------- expurgo LGPD

def expurgar_identidades(con):
    """
    Apaga dado pessoal vencido. O pseudonimo e toda a analise sobrevivem.
    Este metodo e a prova pratica do argumento de privacidade da proposta.
    """
    cur = con.execute(
        """UPDATE autor_identidade
             SET canal_autor_id = 'ANON:' || autor_pid,
                 nome_exibicao = NULL,
                 url_foto = NULL,
                 anonimizado_em = ?
           WHERE expurgar_em <= ? AND anonimizado_em IS NULL""",
        (agora(), agora()),
    )
    con.commit()
    return cur.rowcount


def registrar_enquete(con, msg_id, video_id, offset_seg, poll_details):
    """
    Grava ou atualiza uma enquete do chat. O pollEvent pode reaparecer com
    a contagem atualizada enquanto a votacao esta aberta, entao o insert e
    idempotente e a ultima leitura vence.
    """
    import json
    meta = (poll_details or {}).get("metadata") or {}
    opcoes = []
    total = 0
    for o in meta.get("options", []) or []:
        votos = o.get("tally")
        votos = int(votos) if votos is not None else None
        opcoes.append({"texto": o.get("optionText"), "votos": votos})
        total += votos or 0
    con.execute(
        """INSERT INTO enquete (enquete_id, video_id, offset_segundos, pergunta,
                                status, opcoes, total_votos, bruto, coletado_em)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(enquete_id) DO UPDATE SET
             pergunta=COALESCE(excluded.pergunta, enquete.pergunta),
             status=COALESCE(excluded.status, enquete.status),
             opcoes=COALESCE(excluded.opcoes, enquete.opcoes),
             total_votos=MAX(COALESCE(excluded.total_votos,0),
                             COALESCE(enquete.total_votos,0)),
             bruto=excluded.bruto,
             atualizado_em=excluded.coletado_em""",
        (msg_id, video_id, offset_seg, meta.get("questionText"),
         meta.get("status"), json.dumps(opcoes, ensure_ascii=False),
         total or None, json.dumps(poll_details, ensure_ascii=False), agora()),
    )
