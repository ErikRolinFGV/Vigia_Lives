# Plano de implementação — Vigia Pesquisa v2

Escrito em 14/10/2026. Fonte de design: `design_handoff_vigia_pesquisa/`
(protótipo `Vigia Pesquisa v2.dc.html` + README). Regras de produto:
`docs/handoff_design.md` e `docs/plataforma_logica_de_uso.md`.

Decisões fechadas com o Erik:
- Front em React + Vite + TypeScript, do zero (não existe v1 implementada).
- Backend FastAPI sobre o SQLite atual (`data/lives.db`), estendendo o schema
  via `db.migrar()`. Postgres só quando o coletor sair do PC.
- Dossiê com texto fixo por enquanto; números nunca vêm do modelo.
- Tema claro (paleta "1a · quente") + tema escuro, trocável pelo usuário.
  Os tokens dos dois temas já existem em `temaVars()` no protótipo.
- Cota diária ignorada nesta fase, mas custo por método continua em `coleta_log`.
- Dossiê fixo, mas com o insight de apoio reescrito com os números reais
  (R$ 0,00 em Super Chat, 3 novos membros, 1 assinatura presenteada).
- Sem lives fictícias: agenda real da aba /streams. A tela "ao vivo" tem um
  modo **replay da coleta de 08/09**, sinalizado como replay na tela.
- Repositório público (github.com/ErikRolinFGV/Vigia_Lives): `docs/*.docx`,
  `Claude outputs/` e `*.zip` ficam fora do git.

---

## 1. Estrutura de pastas

```
collector/            coletor atual (só stdlib) — ganha eventos e polling novos
  vigia.py            NOVO: processo permanente — agenda dos canais vigiados,
                      sobe coletores, roda jobs pós-live
  pos_live.py         NOVO: jobs agendados (+1h … +7d, comentários, anteriores)
api/                  NOVO: FastAPI (extra opcional [api])
  main.py             app, CORS dev, montagem dos routers, serve web/dist
  deps.py             conexão SQLite por request (reusa collector.db)
  routers/
    canais.py         canais vigiados, foto, agenda
    lives.py          meta, série, seções, ao vivo, previsão
    relatorio.py      dossiê, exportar, publicar
    publico.py        /r/{canal}/{slug} — projeção pública
    operacao.py       cota e saúde
  secoes/             uma função por seção: (con, video_id, versao) -> dict
    resumo.py momentos.py depois.py conversa.py moderacao.py
    pessoas.py apoio.py comunidade.py video.py comparacao.py qualidade.py
  texto/              análise do chat, 100% local (nunca sai do backend)
    lexico.py         stopwords, sentimento por léxico pt-BR, marcas
    idioma.py         detecção por stopwords (pt/es/en/outros)
  fixtures/           mocks da etapa 3 (JSON por seção) e dossiê fixo
web/                  NOVO: Vite + React + TS
  src/theme/          tokens.ts (claro/escuro), global.css, fontes
  src/lib/            format.ts (pt-BR, hhmm, apelido, numLive, slug),
                      chart.ts (gbox, gutter, rmargin, nice, pts, dLine, dArea)
  src/api/            client.ts + types.ts (contrato dos endpoints)
  src/components/     Header, Crumbs, Chip, Kpi, Section, SegTabs, Modal,
                      Drawer, Ajuda, Conta, charts/ (TimeChart, Bars, Spark,
                      HoverSync), LoginDeco
  src/pages/          Login, Recuperar, Plataformas, Canais, Canal, Live/
                      (Dados + 6 sub-abas, Relatorio), AoVivo, Perdida, Prevista
```

Rotas do front: `/login`, `/recuperar`, `/plataformas`, `/yt/canais`,
`/yt/canais/:id`, `/yt/lives/:id?aba=dados|relatorio&sub=…`. A tela da live
escolhe ao vivo / coletada / perdida / agendada pelo estado que a API devolve.
Login, conta (nome, foto, ORCID, fuso, notificações) e tema ficam no front
(localStorage) — não há usuário no backend no MVP.

## 2. Modelo de dados

Princípio: **agregação se calcula do dado bruto, não se digita.** Quase tudo
das seções novas já cabe em `mensagem` (tipo + `bruto` JSON). O que entra:

| Tabela | Para quê |
|---|---|
| `canal` + colunas `vigiado`, `vigiado_desde`, `removido_em`, `foto_url`, `foto_local` | slots, foto (API ou upload) |
| `canal_snapshot(canal_id, coletado_em, inscritos, video_id, fase)` | inscritos antes/depois |
| `video_snapshot(video_id, coletado_em, fase, titulo, thumb_url, views, likes, comentarios, ficha JSON)` | mudanças de título/thumbnail, curtidas, "Depois da live" (+1h…+7d), ficha |
| `pos_live_job(video_id, tipo, executar_em, feito_em, erro)` | agenda dos polls pós-live |
| `comentario_top(video_id, comentario_id, autor_pid, texto, likes, respostas, coletado_em)` | comentários mais curtidos (handle via `autor_identidade`) |
| `video_publico(video_id, canal_id, titulo, publicado_em, agendada, inicio, fim, views, likes, comentarios, coletado_em)` | lives anteriores não vigiadas (Comparação) |
| `concorrencia(video_id, coletado_em, rival_video_id, rival_canal, titulo, espectadores)` | lives no mesmo horário |
| `agregado_secao(video_id, secao, versao_calc, payload JSON, calculado_em)` | cache do cálculo de cada seção; invalida quando entra dado novo |
| `publicacao(slug, canal_slug, video_id, emitido_em, revogado_em)` | link público |
| `analise_mensagem` (já existe) com `modelo='lexico-v1'` | sentimento por mensagem, idioma, pergunta, spam |

Moderação (`messageDeletedEvent`, `userBannedEvent`), Super Chat/Sticker,
membros, presentes e marcos já entram em `mensagem` com `bruto` — só falta
agregar. Valores estrangeiros: conversão para BRL pelo câmbio do dia, numa
tabela `cambio(data, moeda, brl)` preenchida quando aparecer moeda não-BRL.

## 3. Endpoints (prefixo `/api`)

| Método e rota | Devolve |
|---|---|
| `GET /canais` | cards da home: estado, spark, pico, coletadas, cobertura, slots |
| `POST /canais` `{handle}` | resolve o canal (sem cota), passa a vigiar |
| `DELETE /canais/{id}` | para de vigiar (dados ficam) |
| `PUT /canais/{id}/foto` | upload de foto; `GET` serve a imagem |
| `GET /canais/{id}` | cabeçalho, resumo, barras de pico, lives com `numero` e estado |
| `GET /agenda` | próximas transmissões e recentes de todos os canais |
| `GET /lives/{id}` | meta, título, apelido, número, estado, cobertura, KPIs, sub-abas disponíveis |
| `GET /lives/{id}/serie` | `{t, esp, mpm, part}` em janelas de 60 s, `null` sem interpolar |
| `GET /lives/{id}/secoes/{secao}?versao=interna\|publica` | payload de uma seção |
| `GET /lives/{id}/ao-vivo` | estado da coleta em andamento |
| `GET /lives/{id}/previsao` | custo estimado e cota reservada do dia |
| `GET/POST /lives/{id}/dossie` | estado e conteúdo do relatório final |
| `GET /lives/{id}/export.{csv,json,md}` | arquivos |
| `POST/DELETE /lives/{id}/publicacao` | publica/revoga o link |
| `GET /r/{canal}/{slug}` | projeção pública (sem handles, sem cota, sem texto de chat) |
| `GET /operacao/cota`, `GET /operacao/saude` | operação |

A versão pública é uma **projeção no backend**, não um filtro de interface.

## 4. Etapas (todas implementadas em 14/10/2026)

0. Base: `git init`, scaffolding `web/` e `api/`, tokens dos dois temas,
   header, login falso, plataformas, ajuda e conta.
1. Canais + página do canal (foto, "Abrir no YouTube ↗", resumo centralizado,
   numeração #N, ordem decrescente, breadcrumb com apelido e selo).
2. Live coletada: abas, 6 sub-abas, seções do Resumo/Audiência/Chat com a
   série real (hover sincronizado), ao vivo, perdida, agendada.
3. Seções novas com dado mockado vindo de `/secoes/{secao}` (fixtures).
4. Coleta e agregação reais: eventos novos, polling de vídeo/canal, jobs
   pós-live, `vigia.py`, análise de texto; troca fixture por cálculo.
5. Relatório final, exportar e publicar.

## 5. Divergências entre protótipo e banco real (vale o banco)

- CNN: o protótipo diz "CNN Prime Time" sem série. No banco é "CNN Novo Dia",
  com 23 leituras de audiência e 26 janelas → a CNN ganha gráficos.
- Apoio da CazéTV: o protótipo mostra R$ 2.338,40 (ilustrativo). O real é
  R$ 0,00, 3 novos membros e 1 presente.
- Enquete: os 696 votos vieram de captura de tela. No banco há o `pollEvent`,
  mas sem pergunta nem votos (o código de `pollDetails` entrou depois).
- Lives do protótipo que não existem no banco (semifinal no ar, 05/09
  perdida, agendadas 11/09 e 13/09) não serão inventadas.
- Seções que dependem de coleta durante/depois da live (Depois da live,
  mudanças de título, concorrência, moderação) aparecem como "não consta"
  nas duas lives antigas. Recuperável hoje: comentários, lives anteriores,
  ficha do vídeo, inscritos atuais, foto do canal.

## 6. Decisões tomadas durante a implementação

- Cobertura aparece em dois números: cobertura da janela coletada (chat sem
  buraco) e fração da transmissão acompanhada. Transmissão vira PARCIAL se
  qualquer um ficar abaixo de 90%, ou se a coleta fechar com a live no ar.
- Participação = autores distintos na janela ÷ espectadores (definição do
  README), não mensagens ÷ espectadores.
- Mensagens e pessoas contam só o que foi escrito durante a transmissão
  (offset ≥ 0), sem eventos de moderação: 3.125 mensagens e 1.018 pessoas
  em Brasil × Canadá.
- Título de live coletada é o que ela tinha no ar; renomeação posterior
  aparece em "Mudanças" como feita depois da live.
- Dossiê `regra-v1`: texto fixo escolhido pelo que os números mostram,
  todos os números calculados. Nenhuma mensagem de chat entra.
- Análise de conversa (`lexico-v1`) é heurística local: tom por léxico,
  idioma por palavras funcionais. Marcas "Vivo" e "Claro" fora da lista
  (palavras comuns em português).
- Concorrência filtrada pelo idioma declarado do vídeo: o
  `relevanceLanguage` do search.list é só preferência.
- Escolha do que coletar (17/10): cada canal tem modo `todas` ou
  `escolhidas`, e cada live pode ser marcada (`live.coletar` 1/0, NULL
  segue o canal). Motivo: a CazéTV transmite num domingo mais lives do que
  a cota de 10.000 unidades coleta. Live sem coleta por escolha é
  NÃO ESCOLHIDA (neutra), não PERDIDA (falha). Mudar o modo vale daqui
  para a frente: live encerrada guarda o modo da época.
- Cota prevista por dia (`/cota/previsao` e `/agenda`): lives escolhidas
  × duração mediana do canal × unidades/h medidas nas coletas do canal,
  com o pico de lives simultâneas e o que já foi gasto no dia.

## 7. Pendências da coleta de 18/10 (implementadas em 18/10, depois das lives)

Como ficou:
- Trechos: `api/trechos.py` (id "V~n", corte detectado na troca do núcleo
  do título durante a live, ajustável em `PUT /lives/{id}/divisao`, tabela
  `divisao`). Numa requisição de trecho, visões TEMP com o nome das tabelas
  mostram só a janela dele; seções, dossiê, exportação e link público
  funcionam sem saber que é trecho. Dado do vídeo inteiro depois da live
  (comentários, +1 h … +7 d) não entra em trecho; o vídeo inteiro segue no
  id original.
- Título da transmissão = o que ela tinha quando a coleta começou (o
  coletor não sobrescreve mais a cada minuto).
- "Mesmo jogo": `/lives/{id}` devolve `mesmo_jogo` (mesmo núcleo de título,
  ±12 h) e `trechos`; a tela liga as transmissões e diz que não houve
  coleta dobrada. `/operacao/saude` lista os coletores rodando e o gasto.
- Filtro por situação na página do canal (`?filtro=`) e na agenda.
- Concorrência: 1ª busca aos 10 min, depois de hora em hora, máx. 3 por live;
  `CONCORRENCIA=0` desliga.
- Agenda: agendada atrasada há mais de 2 h não deixa o canal "quente".
- Vigia reiniciado: `live.coletor_pid`; com o processo vivo, não sobe outro.
- Previsão: un./h medidas sem `search.list` + custo fixo das buscas + leitura
  de agenda (~300 un./canal/dia).
- Botão "Assistir no YouTube ↗" em todas as telas de transmissão (trecho
  abre no minuto do corte).

Registro original:

Contexto: primeira coleta passiva com escolha de lives (Leeds × Man Utd,
Canadá × Brasil e Lorient × Mônaco). Coleta sem erro, mas apareceram os
pontos abaixo. Nada disso foi mexido durante a coleta.

1. **Live renomeada no meio vira trechos.** A CazéTV reaproveitou o link
   de Leeds × Man Utd (dy_KAxVd80M, no ar desde 08:45) e renomeou para
   Canadá × Brasil às 11:54, quando o jogo acabou (a audiência cai de 322 mil
   para 179 mil logo depois). Ao mesmo tempo encerrou a live agendada de
   Canadá × Brasil (IXyPT6B-mtA, 44 min, 100% coletada).
   - Detectar troca de título durante a coleta (o histórico está em
     `video_snapshot`) e sugerir um corte ali, ajustável pelo analista.
   - Cada trecho vira uma transmissão própria na lista do canal, com
     estado próprio: o trecho de Leeds aparece **COLETADA, finalizada**
     (08:45 → 11:54), não "no ar". Dados e relatório calculados só com o
     que caiu na janela do trecho.
   - O corte é metadado sobre o dado bruto (desfazer/mover sem perda).
     Pessoas contam em cada trecho; à parte, quantas estiveram nos dois.
   - Título exibido de cada trecho = título que o vídeo tinha naquele
     trecho, com aviso "renomeada às 11:54".
   - Ligar transmissões do mesmo jogo (trecho Canadá × Brasil e a live
     de reserva), para não parecerem duplicadas.
2. **Deixar claro que não há coleta dobrada.** Hoje a tela mostra duas
   "Canadá × Brasil" (uma coletada, outra no ar) e parece que a mesma live
   está sendo coletada duas vezes, com a cota caindo em dobro. Na verdade
   são dois vídeos diferentes e a reserva já terminou. A interface precisa
   mostrar isso: um coletor por vídeo, quais estão rodando agora e quanto
   cada um gasta.
3. **Filtro na lista de transmissões** (página do canal e agenda):
   coletando agora / coletadas / vão ser coletadas / não escolhidas /
   perdidas. Hoje fica difícil ver o que está em cada situação.
4. **Busca de concorrência cara demais.** `search.list` custa 100 un. e
   roda a cada 15 min por live: em Leeds foram 1.100 un., mais que o chat
   (1.035). Fazer bem menos vezes (início e pico) ou deixar opcional.
5. **Agenda relida a cada minuto.** Live presa como "agendada" no passado
   (Valencia × Athletic de 17/10) deixa o canal "quente" para sempre: ~60
   un./h à toa (450 un. até o meio-dia). Atrasada há mais de 2 h deixa de
   contar como prestes a começar.
6. **Vigia reiniciado sobe coletor duplicado.** O vigia guarda os
   coletores só em memória; reiniciado no meio de uma live, não reconhece o
   coletor que já roda e sobe outro para o mesmo vídeo. Conferir coleta
   aberta com processo vivo (pid) antes de subir.
7. **Previsão de cota** com os gastos medidos hoje: Leeds gastou ~860 un./h
   contra 625 estimadas, e a previsão não somava a concorrência nem a
   leitura de agenda.
8. **Botão "Assistir no YouTube ↗"** na tela de transmissão sendo coletada
   (e nas outras telas de transmissão): hoje não há link para a live. A API
   já devolve `url` em `/lives/{id}`; abrir em nova aba, sem sair da tela.
9. Depois de tudo: commit (o da escolha de lives ficou pendente para depois
   de ver a coleta funcionar).
