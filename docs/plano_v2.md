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
- Agenda sem corte (20/10): a aba /streams lista as agendadas da mais
  distante para a mais próxima, e o corte em 15 ids deixava de fora as
  lives do dia (Vasco × Boca). Agora a leitura pega a aba inteira e rola
  as páginas seguintes (sem cota) até achar uma live já encerrada.
- Live pelo link (20/10): "Coletar pelo link" na agenda lê o vídeo
  (1 un.) e marca só aquela live. Canal não vigiado entra no banco sem
  vigilância (`live.avulsa = 1`): fica fora da lista de canais, não ocupa
  slot, e o vigia relê só as avulsas (todo ciclo perto do horário, 5 min
  no ar, 30 min longe). Link de canal vigiado só marca a live. Live
  encerrada é recusada: o chat só existe enquanto ela está no ar.
- Ficha e comparação (20/10, etapas A e B do relatório novo):
  `api/ficha.py` calcula as mesmas métricas (`ficha-v1`) para toda live
  coletada, com cache por assinatura; `/lives/{id}/ficha` dá a posição
  no canal, na categoria do YouTube e em todas as coletas, e `/comparar`
  põe 2 a 4 lives lado a lado (curvas alinhadas no início de cada uma).
  Fora do ranking: totais de coleta parcial, números do vídeo inteiro num
  trecho e qualquer coleta com menos de 15 min. Empate divide a posição.
  Com poucas lives, posição e faixa (menor, mediana, maior), não média.
- Dossiê `regra-v2` (20/10): continua texto fixo, mas lê a ficha das
  outras lives coletadas do canal. O veredito diz onde a live fica no
  histórico (1ª ou última em métricas-chave, com 3 ou mais lives), e entram
  enquetes, quem sustenta a conversa e views depois da live. Dossiê antigo
  aparece marcado na tela com o convite a gerar de novo.
- Comparação por seções (20/10): a página lado a lado mostra números-chave
  (ficha completa recolhida) e gráficos por seção: audiência, mensagens
  por minuto, participação, "quando a conversa acontece" (chat acumulado
  × parcela da coleta), picos de reação no tempo, quem escreve quanto,
  enquetes e views depois da live.
- Momentos detectados ao fechar a coleta (20/10): só o comando v1
  (`report.py`) rodava a detecção, e as coletas do vigia ficavam sem
  momento nenhum. Agora o coletor (e o vigia, ao fechar coleta órfã)
  chama `report.pos_coleta`; as coletas antigas foram processadas.
- IA (20/10): dossiê por modelo e chatbot só com agregados. O texto das
  mensagens não vai para modelo nenhum; rever depois da apresentação a
  investidor.
- Vigia solto (20/10): a API sobe o vigia por um intermediário
  (`collector/lancar.py`) que sai na hora. Sem pai vivo, reiniciar ou
  fechar a API não derruba o vigia nem as coletas.
- Live que some do videos.list (21/10): o "Logo após" de Vasco × Boca
  ficou fora da resposta do lote enquanto esteve no ar e voltou só depois
  de acabar; o vigia nunca soube que subiu e a live se perdeu. Agora, live
  marcada, já na hora e ausente da resposta é lida sozinha (1 un.) e, se
  ainda faltar, conferida na página pública do vídeo (`isLiveNow`, sem
  cota): no ar, vira ao_vivo e o coletor tenta a cada ciclo. O log do vigia
  registra quando muda o conjunto de ids que o YouTube não devolveu.
- Link e transmissão (21/10): "link" é o vídeo do YouTube (uma URL);
  "transmissão" é o conteúdo (cada linha da lista, ou trecho). Um link é
  chamado pelo que era quando abriu ("o link “Vasco × Boca Juniors”"), e o
  nome não muda quando o canal troca o título. A página de transmissão
  abre com um mapa: a frase "esta página é o 2º trecho do link que começou
  como…" e uma faixa por link (o dela, os que passaram o mesmo conteúdo e os
  coletados no mesmo horário por 15 min ou mais), um bloco por trecho, a
  mesma cor para o mesmo conteúdo, tracejado sem coleta. Lista, início,
  comparação e o gráfico de picos dizem "2º trecho do link …".
- Corte fantasma (21/10): troca de título corrigida em menos de 5 min
  (CORTE_MIN) não vira trecho; vale o corte da correção.
- Cobertura medida pelos dados (21/10): o `cobertura_pct` gravado pelo
  coletor só via a última execução dele, e "acompanhada" ia do primeiro ao
  último minuto sem olhar os buracos. A ginástica de 20/10 (coletor caiu e
  voltou 5 vezes com a internet oscilando) aparecia "100% acompanhada,
  cobertura 91,5%" com 28% dos minutos lidos. Agora `transmissoes.medir`
  conta o tempo com o coletor vivo: entre duas chamadas com resposta no
  `coleta_log` a até 150 s uma da outra. Cobertura = vivo ÷ janela de
  coleta; acompanhada = vivo ÷ transmissão (ou trecho). O gravado fica só
  para coleta sem chamadas registradas.
- Descartar coleta (21/10): reversível. Tabela `descarte` (id de live, de
  trecho ou do vídeo inteiro, que vale para todos os trechos), com motivo.
  Descartada sai da lista (fica no filtro "Descartadas"), da comparação, do
  ranking, da ficha e dos totais do canal; os dados brutos ficam e
  "Restaurar" traz de volta. Apagar de vez não existe.
- Live marcada que vira privada (21/10): a CazéTV pôs no privado o link
  reservado do Palmeiras × Fluminense e passou o jogo em outro link, e a tela
  seguia dizendo "coletor a postos" e reservando cota. O vigia grava em
  `sumida` o que a página do vídeo diz (privada, indisponível, fora do ar),
  e a agendada atrasada cujo conteúdo (mesmo núcleo de título) subiu em
  outro link do canal aponta para ele. Nos dois casos ela sai da reserva de
  cota. Se o link voltar, o coletor sobe normalmente. O mesmo vale para a
  live que continua outra ainda no ar (o "Logo após" que seguiu no link do
  jogo: o título de uma contém o da outra).
- Estado "privada" (22/10): live que foi ao ar com a página pedindo login
  não tinha chat público, então não é perdida. A linha de `sumida` fica
  (`voltou_em`) depois que o YouTube volta a devolver o vídeo, e a live
  encerrada sem coleta que o vigia viu privada durante o ar ganha o estado
  "privada", em tom neutro. Não conta como "outro link sem coleta". Os três
  links reservados da CazéTV de 21/10 foram registrados à mão, pelo log.
- Trecho fantasma no fim (22/10): a CazéTV renomeou o link 34 s antes de
  encerrar. Uma troca de título nos últimos `CORTE_MIN` da live não abre
  trecho.

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
