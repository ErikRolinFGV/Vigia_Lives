-- =============================================================
-- Plataforma de monitoramento de lives  |  Caze TV
-- Schema v0.1  |  SQLite (PoC)  |  migravel para PostgreSQL
--
-- Convencao de tempo: todo timestamp e ISO 8601 em UTC.
-- Convencao de dinheiro: valores monetarios em micros (inteiro),
--   exatamente como a API do YouTube devolve. 1 BRL = 1.000.000 micros.
--   Nunca usar float para dinheiro.
--
-- Principio de privacidade (LGPD): dados que identificam pessoas
--   vivem SOMENTE na tabela autor_identidade. Todo o resto do banco
--   referencia o pseudonimo autor_pid. Apagar autor_identidade
--   anonimiza a base inteira sem quebrar nenhuma analise.
-- =============================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------
-- 1. CANAL E LIVE
-- -------------------------------------------------------------

CREATE TABLE canal (
    canal_id            TEXT PRIMARY KEY,          -- UC... do YouTube
    plataforma          TEXT NOT NULL DEFAULT 'youtube'
                          CHECK (plataforma IN ('youtube','twitch')),
    nome                TEXT NOT NULL,
    handle              TEXT,
    inscritos           INTEGER,
    atualizado_em       TEXT NOT NULL
);

CREATE TABLE live (
    video_id            TEXT PRIMARY KEY,          -- id do video da live
    canal_id            TEXT NOT NULL REFERENCES canal(canal_id),
    titulo              TEXT,
    live_chat_id        TEXT,                      -- some quando a live acaba
    agendada_para       TEXT,
    inicio_real         TEXT,                      -- ancora do offset da timeline
    fim_real            TEXT,
    duracao_segundos    INTEGER,
    status              TEXT NOT NULL DEFAULT 'agendada'
                          CHECK (status IN ('agendada','ao_vivo','encerrada','perdida')),
    coleta_inicio       TEXT,
    coleta_fim          TEXT,
    -- cobertura = fracao da live que a coleta realmente acompanhou.
    -- Metrica de honestidade: sem ela nao da para saber se um vale
    -- no grafico foi silencio do chat ou queda do coletor.
    cobertura_pct       REAL,
    criado_em           TEXT NOT NULL
);

CREATE INDEX idx_live_canal_inicio ON live(canal_id, inicio_real DESC);
CREATE INDEX idx_live_status       ON live(status);

-- -------------------------------------------------------------
-- 2. AUTORES  |  fronteira de dados pessoais
-- -------------------------------------------------------------

-- Contem dado pessoal. Retencao curta e definida em contrato.
-- Serve para moderacao, verificacao e resposta a titular.
CREATE TABLE autor_identidade (
    autor_pid           TEXT PRIMARY KEY,          -- sha256(canal_do_autor + salt)
    canal_autor_id      TEXT NOT NULL UNIQUE,      -- DADO PESSOAL
    nome_exibicao       TEXT,                      -- DADO PESSOAL
    url_foto            TEXT,                      -- DADO PESSOAL
    coletado_em         TEXT NOT NULL,
    expurgar_em         TEXT NOT NULL,             -- data de expurgo programado
    anonimizado_em      TEXT                       -- preenchido apos expurgo
);

CREATE INDEX idx_identidade_expurgo ON autor_identidade(expurgar_em)
    WHERE anonimizado_em IS NULL;

-- Pseudonimizado. Sobrevive ao expurgo. Base de toda analise.
CREATE TABLE autor (
    autor_pid           TEXT PRIMARY KEY,
    primeira_msg_em     TEXT,
    ultima_msg_em       TEXT,
    lives_participadas  INTEGER NOT NULL DEFAULT 0,
    msgs_totais         INTEGER NOT NULL DEFAULT 0,
    doacoes_micros      INTEGER NOT NULL DEFAULT 0,
    -- classificacao heuristica de comportamento, nao de pessoa
    perfil              TEXT CHECK (perfil IN
                          ('novo','recorrente','fiel','doador','suspeito_bot'))
);

-- Papel do autor e dependente da live: moderador em uma, comum em outra.
CREATE TABLE autor_papel_live (
    autor_pid           TEXT NOT NULL REFERENCES autor(autor_pid),
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    is_dono             INTEGER NOT NULL DEFAULT 0,
    is_moderador        INTEGER NOT NULL DEFAULT 0,
    is_membro           INTEGER NOT NULL DEFAULT 0,
    membro_desde_meses  INTEGER,
    is_verificado       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (autor_pid, video_id)
);

-- -------------------------------------------------------------
-- 3. CHAT
-- -------------------------------------------------------------

CREATE TABLE mensagem (
    msg_id              TEXT PRIMARY KEY,          -- id da API, garante idempotencia
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    autor_pid           TEXT NOT NULL REFERENCES autor(autor_pid),
    publicado_em        TEXT NOT NULL,
    -- segundos desde live.inicio_real: e isso que permite cruzar
    -- chat com o momento do video e gerar link com timestamp
    offset_segundos     INTEGER,
    tipo                TEXT NOT NULL,             -- textMessageEvent, superChatEvent,
                                                   -- superStickerEvent, newSponsorEvent,
                                                   -- membershipGiftingEvent, etc
    texto               TEXT,
    -- monetario: preenchido apenas em super chat e super sticker
    moeda               TEXT,
    valor_micros        INTEGER,
    tier                INTEGER,                   -- 1 a 5, cor do super chat
    coletado_em         TEXT NOT NULL
);

CREATE INDEX idx_msg_live_offset ON mensagem(video_id, offset_segundos);
CREATE INDEX idx_msg_autor       ON mensagem(autor_pid);
CREATE INDEX idx_msg_tipo        ON mensagem(video_id, tipo);
CREATE INDEX idx_msg_doacao      ON mensagem(video_id, offset_segundos)
    WHERE valor_micros IS NOT NULL;

-- Enquetes que o proprio canal cria no chat. Chegam como pollEvent e
-- os resultados NAO ficam em lugar nenhum depois que a live acaba: o
-- YouTube nao guarda, o criador nao exporta. E dado de pesquisa de
-- audiencia que o canal produziu e perdeu.
CREATE TABLE enquete (
    enquete_id          TEXT PRIMARY KEY,          -- msg_id do pollEvent
    video_id            TEXT NOT NULL,
    offset_segundos     INTEGER,
    pergunta            TEXT,
    status              TEXT,                      -- active, closed
    opcoes              TEXT,                      -- JSON [{texto, votos}]
    total_votos         INTEGER,
    bruto               TEXT,                      -- payload original, apolice de seguro
    coletado_em         TEXT NOT NULL,
    atualizado_em       TEXT
);

CREATE INDEX idx_enquete_live ON enquete(video_id, offset_segundos);

-- -------------------------------------------------------------
-- 4. AUDIENCIA  |  serie temporal por polling
-- -------------------------------------------------------------

CREATE TABLE snapshot_audiencia (
    snapshot_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    coletado_em         TEXT NOT NULL,
    offset_segundos     INTEGER,
    espectadores        INTEGER,                   -- concurrentViewers
    views_acumuladas    INTEGER,
    likes               INTEGER,
    UNIQUE (video_id, coletado_em)
);

CREATE INDEX idx_snapshot_live ON snapshot_audiencia(video_id, offset_segundos);

-- Estatisticas finais, coletadas depois do fim da live
CREATE TABLE estatistica_final (
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    coletado_em         TEXT NOT NULL,
    views               INTEGER,
    likes               INTEGER,
    comentarios         INTEGER,
    PRIMARY KEY (video_id, coletado_em)
);

-- -------------------------------------------------------------
-- 5. ANALYTICS SOB OAUTH  |  so existe se a Caze TV conceder acesso
-- -------------------------------------------------------------

-- Curva de retencao: audienceWatchRatio por fatia relativa do video
CREATE TABLE analytics_retencao (
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    fracao_video        REAL NOT NULL,             -- 0.0 a 1.0
    watch_ratio         REAL,
    retencao_relativa   REAL,
    coletado_em         TEXT NOT NULL,
    PRIMARY KEY (video_id, fracao_video)
);

-- Tabela larga e generica: uma linha por (video, tipo de corte, valor do corte).
-- Evita criar uma tabela nova a cada dimensao que a Caze TV pedir.
CREATE TABLE analytics_dimensao (
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    dimensao            TEXT NOT NULL,             -- trafficSourceType, deviceType,
                                                   -- country, ageGroup, gender
    valor               TEXT NOT NULL,             -- SUBSCRIBER, MOBILE, BR, age25-34...
    views               INTEGER,
    minutos_assistidos  REAL,
    duracao_media_seg   REAL,
    pct_do_total        REAL,
    coletado_em         TEXT NOT NULL,
    PRIMARY KEY (video_id, dimensao, valor)
);

-- -------------------------------------------------------------
-- 6. CAMADA DE ANALISE  |  saida de LLM e heuristicas
-- -------------------------------------------------------------

-- Separada de mensagem de proposito: reprocessar com outro modelo
-- nao pode tocar no dado bruto coletado.
CREATE TABLE analise_mensagem (
    msg_id              TEXT NOT NULL REFERENCES mensagem(msg_id),
    modelo              TEXT NOT NULL,             -- identificador do modelo usado
    prompt_versao       TEXT NOT NULL,             -- versionamento do prompt
    sentimento          TEXT CHECK (sentimento IN
                          ('positivo','neutro','negativo','misto')),
    sentimento_score    REAL,                      -- -1.0 a 1.0
    topico              TEXT,
    subtopico           TEXT,
    is_spam             INTEGER,
    spam_motivo         TEXT,
    confianca           REAL,
    analisado_em        TEXT NOT NULL,
    PRIMARY KEY (msg_id, modelo, prompt_versao)
);

CREATE INDEX idx_analise_topico ON analise_mensagem(topico);

-- Agregacao por janela fixa. E o que o dashboard le, nao a tabela bruta.
CREATE TABLE janela_agregada (
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    bucket_segundos     INTEGER NOT NULL,          -- 30, 60, 300
    bucket_inicio       INTEGER NOT NULL,          -- offset do inicio da janela
    msgs                INTEGER NOT NULL DEFAULT 0,
    autores_unicos      INTEGER NOT NULL DEFAULT 0,
    msgs_por_minuto     REAL,
    espectadores_medio  REAL,
    -- razao entre mensagens e espectadores: separa "muita gente calada"
    -- de "pouca gente muito engajada"
    taxa_participacao   REAL,
    sentimento_medio    REAL,
    doacoes_micros      INTEGER NOT NULL DEFAULT 0,
    doacoes_qtd         INTEGER NOT NULL DEFAULT 0,
    emojis_top          TEXT,                      -- JSON
    termos_top          TEXT,                      -- JSON
    calculado_em        TEXT NOT NULL,
    PRIMARY KEY (video_id, bucket_segundos, bucket_inicio)
);

-- Momentos detectados automaticamente, com link direto para o video
CREATE TABLE momento (
    momento_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id            TEXT NOT NULL REFERENCES live(video_id),
    offset_segundos     INTEGER NOT NULL,
    duracao_segundos    INTEGER,
    tipo                TEXT NOT NULL CHECK (tipo IN
                          ('pico_chat','pico_audiencia','pico_doacao',
                           'queda_audiencia','virada_sentimento')),
    magnitude           REAL,                      -- desvios padrao acima da base
    rotulo              TEXT,                      -- resumo gerado por LLM
    url_timestamp       TEXT,                      -- youtube.com/watch?v=..&t=..s
    detectado_em        TEXT NOT NULL
);

CREATE INDEX idx_momento_live ON momento(video_id, offset_segundos);

-- -------------------------------------------------------------
-- 7. OPERACAO  |  auditoria de coleta e cota
-- -------------------------------------------------------------

CREATE TABLE coleta_log (
    log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- SEM chave estrangeira de proposito: a primeira chamada a API
    -- acontece antes da live existir no banco, e o log de auditoria
    -- precisa registrar tambem o que falhou antes de qualquer insercao.
    video_id            TEXT,
    metodo              TEXT NOT NULL,             -- videos.list, liveChatMessages.list
    chamado_em          TEXT NOT NULL,
    custo_unidades      INTEGER NOT NULL,
    http_status         INTEGER,
    itens_recebidos     INTEGER,
    page_token          TEXT,                      -- permite retomar de onde parou
    erro                TEXT
);

CREATE INDEX idx_coleta_dia ON coleta_log(chamado_em);

-- -------------------------------------------------------------
-- 8. VIEWS DE CONVENIENCIA
-- -------------------------------------------------------------

CREATE VIEW v_resumo_live AS
SELECT
    l.video_id,
    l.titulo,
    c.nome                              AS canal,
    l.inicio_real,
    l.duracao_segundos,
    l.cobertura_pct,
    COUNT(DISTINCT m.msg_id)            AS total_msgs,
    COUNT(DISTINCT m.autor_pid)         AS autores_unicos,
    COALESCE(SUM(m.valor_micros),0)/1000000.0 AS doacoes_total,
    MAX(s.espectadores)                 AS pico_espectadores,
    AVG(s.espectadores)                 AS media_espectadores
FROM live l
JOIN canal c              ON c.canal_id = l.canal_id
LEFT JOIN mensagem m      ON m.video_id = l.video_id
LEFT JOIN snapshot_audiencia s ON s.video_id = l.video_id
GROUP BY l.video_id;

CREATE VIEW v_timeline AS
SELECT
    j.video_id,
    j.bucket_inicio,
    j.bucket_segundos,
    j.msgs,
    j.msgs_por_minuto,
    j.espectadores_medio,
    j.taxa_participacao,
    j.sentimento_medio,
    j.doacoes_micros/1000000.0 AS doacoes_reais
FROM janela_agregada j
ORDER BY j.video_id, j.bucket_inicio;
