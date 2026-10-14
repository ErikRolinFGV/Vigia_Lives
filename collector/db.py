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


def conectar():
    # arquivo de tamanho zero conta como inexistente: e o que sobra
    # quando uma execucao anterior morreu antes de aplicar o schema
    primeira_vez = (not config.CAMINHO_DB.exists()
                    or config.CAMINHO_DB.stat().st_size == 0)
    config.CAMINHO_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.CAMINHO_DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    if primeira_vez:
        con.executescript(config.CAMINHO_SCHEMA.read_text(encoding="utf-8"))
        con.commit()
        print(f"[db] banco criado em {config.CAMINHO_DB}")
    else:
        migrar(con)
    return con


def migrar(con):
    """
    Migracao leve e idempotente, para bancos criados antes de uma coluna
    ou tabela existir. Roda em toda conexao e nao toca em dado nenhum.
    """
    con.execute("""CREATE TABLE IF NOT EXISTS enquete (
        enquete_id TEXT PRIMARY KEY, video_id TEXT NOT NULL,
        offset_segundos INTEGER, pergunta TEXT, status TEXT, opcoes TEXT,
        total_votos INTEGER, bruto TEXT, coletado_em TEXT NOT NULL,
        atualizado_em TEXT)""")
    con.execute("""CREATE INDEX IF NOT EXISTS idx_enquete_live
                   ON enquete(video_id, offset_segundos)""")
    cols = {r[1] for r in con.execute("PRAGMA table_info(mensagem)")}
    if "bruto" not in cols:
        # guarda o snippet original de eventos que nao sao texto simples.
        # E a apolice contra o proximo campo que a API tiver e o codigo ignorar.
        con.execute("ALTER TABLE mensagem ADD COLUMN bruto TEXT")
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
