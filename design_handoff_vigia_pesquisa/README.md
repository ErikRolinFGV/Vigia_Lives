# Handoff: Vigia Pesquisa — demonstração do fluxo do pesquisador

## Visão geral
O Vigia vigia canais do YouTube e captura o que uma live produz e perde quando acaba: chat, espectadores simultâneos, enquetes e momentos de reação. Este pacote cobre o **MVP de demonstração da conta "pesquisador"**: login (falso), escolha de plataforma, canais vigiados, transmissões do canal, dados de cada live e geração do relatório final (dossiê).

Regras do plano de pesquisa:
- Até **10 canais** vigiados ao mesmo tempo (prop `limiteSlots`, padrão 10). A demo abre com 2 canais reais. Canais adicionados via modal entram na lista. O contador mostra "N de 10".
- Só dados públicos. Não há acesso OAuth ao canal (isso é do produto "Vigia Canal", fora do escopo).
- Nada é retroativo: vigiar começa na próxima transmissão.

Fora do escopo do MVP: site público/preços, conta empresa, pagamento, outras plataformas além do YouTube (aparecem só como "EM BREVE").

> **Versão atual: `Vigia Pesquisa v2.dc.html`.** A v1 (`Vigia Pesquisa.dc.html`) fica só como histórico. O que mudou está em **Mudanças da v2**, no fim deste arquivo. Se houver conflito, vale a v2.

## Sobre os arquivos de design
`Vigia Pesquisa v2.dc.html` é uma **referência de design feita em HTML**: um protótipo que mostra aparência e comportamento, não código de produção. A tarefa é **recriar essas telas no ambiente do projeto** (se ainda não houver um, sugerimos React + Vite + TypeScript, com estilos em CSS modules ou Tailwind). Para abrir o protótipo, sirva a pasta por HTTP (`npx serve .`) e abra o arquivo. `support.js` é só o runtime do protótipo; não deve ir para o app.

O template (markup) fica entre `<x-dc>` e `</x-dc>`, com `{{ variavel }}` como lacunas, `<sc-if>` para condicionais e `<sc-for>` para listas. A lógica fica na `class Component` no fim do arquivo. `renderVals()` monta todos os dados de cada tela, e é onde estão os textos, números e cores dinâmicas.

## Fidelidade
**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, textos e estados são finais. Recriar com precisão. Todos os estilos estão inline no HTML, então qualquer medida pode ser lida direto do elemento.

## Dados
- `livedata.js` define `window.LIVEDATA = { t, esp, mpm, part }`: quatro arrays paralelos de 112 posições, uma por janela de 60 s da live Brasil × Canadá (08/09/2026).
  - `t`: segundos desde o início (0, 60, 120…)
  - `esp`: espectadores simultâneos (`null` quando a API não respondeu; **nunca interpolar**)
  - `mpm`: mensagens por minuto
  - `part`: fração de participação (0–1), ou seja, autores na janela ÷ espectadores
- Canais, lives, KPIs, momentos e textos do dossiê estão em `dados()` e `liveInfo()` na classe. No app real isso vem da API do backend. Os números são da coleta real e não devem ser inventados. Campo ausente aparece como "não consta" ou "—", nunca como estimativa.
- **Exceção da v2:** os dados das seções novas (método `mvp(D, videoId)`) são **ilustrativos**, feitos para provar o conceito. São eles: quem fala, conversa, moderação, Super Chats e membros, palavras e emojis, vídeo e canal, depois da live, lives anteriores e concorrência. No app, tudo isso vem do backend. A tabela da seção **Mudanças da v2** diz de qual endpoint sai cada um.

## Telas
Navegação por estado (`view`). Ordem do fluxo: `login → plataformas → canais → canal → live (abas dados | relatorio)`. Do canal também se abre `aovivo`, `perdida` e `prevista` (agendada).

### 1. Login (`login`) e Recuperar senha (`recuperar`)
- Fundo `#0B0C0E` em tela cheia. Decoração animada no rodapé: duas curvas SVG que mudam de forma (`morphA` 15 s, `morphB` 19 s), 16 barras pulsando (`barPulse` 3,8 s, cor `#1E232A`) e 7 rótulos mono subindo (`chatUp` 10 s, `#5A616B`, 12px). Tudo é decorativo, com `pointer-events:none`.
- Coluna central com `max-width:392px`. Logo: quadrado 30×30, raio 8, fundo `#ECEDEF` com ponto 10px `#0B0C0E`, e "Vigia" em Figtree 800/22px.
- Card `#13151A`, borda `#23262C`, raio 16, padding `28px 26px 24px`. Título "Entrar na sua conta" (21/700).
- Inputs: fundo `#0E1013`, borda `#2A2E35` (com foco: `#5C646F`), raio 10, padding `11px 13px`, IBM Plex Mono 13.5px. Labels em caixa alta, 11.5px, tracking .06em, `#7D828B`.
- Botão primário claro: `#ECEDEF` (hover `#FFFFFF`), texto `#0B0C0E` 14.5/700, raio 10, `scale(.985)` no active.
- **Validação (falsa):** e-mail no formato `x@y.z`, senha com ≥ 6 caracteres. Erros: "Informe um e-mail válido." / "A senha tem no mínimo 6 caracteres." em caixa `#20161A`/borda `#4A2A2E`/texto `#EFB3B0`. Enter envia o formulário. Qualquer credencial válida entra.
- Recuperar: mesmo layout. Depois de enviar, mostra o estado "Link enviado" com o e-mail informado.

### 2. Plataformas (`plataformas`)
- Fundo `#0B0C0E`. Barra superior com 58px de altura e borda inferior `#1B1E23`, mostrando o e-mail da conta e o botão "Sair".
- Título "Escolha a plataforma" (29/800). Grid `repeat(auto-fit,minmax(232px,1fr))`, gap 14.
- Card: `#13151A`, raio 14, padding 20, altura mínima 186. Hover: `translateY(-3px)` + sombra `0 14px 34px rgba(0,0,0,.45)`.
  - YouTube: ativo, chip "DISPONÍVEL" (`#2A1616`/`#FF7B76`), quadrado `#DC2A25`. Clique leva a `canais`.
  - Twitch, TikTok Live, Kick: `opacity:.5`, chip "EM BREVE", sem clique.

### Header do app (a partir de Canais)
Sticky, fundo `#0F0F0F` (tema YouTube), altura 58, conteúdo com `max-width:1180px`. Da esquerda para a direita: logo (quadrado `#DC2A25`), pílula "YouTube · trocar" (volta para Plataformas), breadcrumbs separados por "/", status "coleta de pé" (ponto verde `#1F9D55` pulsando), botão "?" (abre o painel de ajuda) e avatar com iniciais (abre o menu de conta com o e-mail e "Sair").

### 3. Canais vigiados (`canais`)
- Fundo `#EFEBE1`. Título "Canais vigiados" (30/800).
- Linha de slots: "Em vigilância", "N de 10 canais · coleta de pé há…" e uma barra de progresso de 6px (`#E6E2DB` com preenchimento `#DC2A25`).
- Grid `minmax(320px,1fr)`, gap 16. Card branco, borda `#E6E2DB`, raio 14, padding `20px 22px`. Hover: borda `#C9C2B6`, sombra `0 6px 22px rgba(23,20,15,.09)`, `translateY(-3px)`.
  - Nome (19/700) e handle (mono 12.5).
  - Chip de estado: "no ar agora" (vermelho) ou "fora do ar".
  - Sparkline de audiência (SVG 400×70, `#2563C7`, área com opacidade .12, animação `drawIn`). Canal sem dados mostra caixa tracejada com nota.
  - 3 métricas: Maior pico (`#2563C7`), Coletadas, Cobertura (`#167A4E`).
- Card "Abrir mais um slot" (borda tracejada, hover com borda `#DC2A25`) quando há slot livre. Com todos ocupados, aparece "Todos os slots em uso".
- **Modal Vigiar canal:** input `@handle ou UC…` e aviso de que lives anteriores não serão recuperadas. Botão "Vigiar canal" leva ao passo 2 de confirmação, e o canal entra na lista com estado vazio.

### 4. Canal (`canal`)
- Cabeçalho: nome (30/800), "handle · vigiado desde…" e chip no ar/fora do ar.
- Dois painéis lado a lado: **Pico de audiência por transmissão** (barras, fundo `#F5F9FE`/borda `#D9E5F5`) e **Resumo do canal** (coletadas, cobertura média, maior pico, lives perdidas).
- **Transmissões:** lista vertical, gap 8. Linha branca com raio 12 e borda esquerda de 3px na cor do estado: data (mono, 104px), título com ellipsis, subtítulo, chip de estado, pico e "→". Hover: `translateX(3px)`.
- Estados e cores (chip bg / borda / texto / acento):
  - NO AR `#FDF2F1 / #F3C9C7 / #B8221D / #DC2A25` → abre `aovivo`
  - COLETADA `#EAF6EE / #B9DFC6 / #146B3A / #1F9D55` → abre `live`
  - PERDIDA `#FDF2F1 / #F3C9C7 / #B8221D / #DC2A25` → abre `perdida`
  - AGENDADA `#F4F2EE / #E6E2DB / #4E4A42 / #DDD8CF` → abre `prevista`
  - PARCIAL `#FDF4E7 / #F0D9AE / #8A5A11` (definido, sem exemplo na demo)
- Canal novo, sem lives: estado vazio "De pé, esperando a primeira transmissão".

### 5. Ao vivo (`aovivo`)
- Chip "NO AR" pulsando, "coletando há…" e botão "Encerrar coleta". Barra de 2px com varredura (`sweep` 2,4 s).
- 4 KPIs com fundo tingido: Assistindo agora (azul `#F5F9FE`), Mensagens (laranja `#FDF7F2`), Participação (verde `#F4FAF6`) e Cota desta coleta (rosa `#FDF3F2`, com barra).
- Gráficos de audiência (com ponto pulsando na ponta) e de msg/min. A demo avança uma janela a cada 2,4 s, a partir do índice 46 até 111.
- Momentos detectados até agora (hora, tipo, σ) e o painel "Coleta em andamento".

### 6. Perdida (`perdida`) e Agendada (`prevista`)
- Perdida: o que se sabe (canal, janela, motivo, cota 0), o que não existe (faixa de 97 janelas vazias) e por que a linha continua na lista. Coluna de 820px.
- Agendada: "Coletor a postos", custo estimado em unidades de cota (609 un./h) e cota reservada do dia (de 10.000), dividida com outras coletas da data. Coluna de 880px.

### 7. Live coletada (`live`): aba **Dados**
- Meta mono "canal · data · duração" e chip "99,7% acompanhada". Título 24–32px (clamp). Abas "Dados" | "Relatório" (aba ativa com borda inferior de 2px).
- 4 KPIs brancos (31/700, cor por métrica).
- **Três painéis com o mesmo eixo de tempo:** audiência (240 de altura, linhas verticais nos momentos), mensagens por minuto (barras `#C6541A`) e participação (`#167A4E`). Uma **linha de hover sincronizada** cruza os três, e o readout no canto mostra o valor da janela. As três geometrias precisam ter as mesmas margens (ver `gbox`/`gutter`/`rmargin` na lógica).
- Momentos em que o chat reagiu: cards com link para o instante no vídeo (`youtube.com/watch?v=egm9wCyhXac&t=…`), σ e barra de intensidade.
- Mensagens acumuladas e histograma de distribuição, com textos derivados (mediana, pico ÷ mediana, correlação).
- **Chamada para gerar o relatório:** card com borda esquerda `#DC2A25` e botão "Gerar relatório final".
- Extras: quem escreveu, enquete, apoio financeiro, faixa de consulta de espectadores janela a janela (azul = reportado, `#E8A9A6` = sem resposta, `#DDD8CF` = antes do primeiro número) e "Ainda não coletado".
- CNN (`cnn-0809`) não tem série: mostra o placeholder tracejado no lugar dos gráficos. Isso é intencional.

### 8. Live coletada: aba **Relatório** (dossiê)
Três estados para cada live (`relFeitos[liveId]`, `relGerando`):
1. **Não gerado:** explicação, lista de 4 passos e botão "Gerar relatório final". Nota: consome tokens do modelo, não cota do YouTube.
2. **Gerando:** os 4 passos são marcados um a um (a demo avança a cada 620 ms) com ponto pulsando.
3. **Pronto:**
   - Faixa "dossiê gerado" com meta (data/hora) e "Gerar de novo".
   - Veredito em card `#FBF6EC`/`#E8DCC4`, com selo "redigido pelo modelo" e frase em 19–25px/600.
   - Insights: cards com borda esquerda de 3px `#C6541A`, título, texto e "base: …" em mono.
   - Recomendação, achados (3 cards com número grande e barra) e gráfico duplo de audiência × participação normalizadas.
   - Enquete, "O que não está neste relatório" e "O que o modelo recebeu / não recebeu".
   - Ações: **Exportar** (modal de formatos `.csv`, `.json`, `.md` com prévia; `.csv` bloqueado quando não há série) e **Publicar link** (modal com URL `vigia.app/r/{canal}/{slug-do-nome}-{data}`, listas "vai no link público" / "fica só na versão interna", texto pronto para o anunciante e passos do backend).
- No MVP, o texto do dossiê pode continuar fixo (como no protótipo) ou vir de uma chamada real ao modelo. **Os números nunca vêm do modelo** e nenhuma mensagem de chat é enviada a ele, só agregados.

### Painel de ajuda ("?")
Drawer à direita, 560px, fundo branco. Contém: o que é o Vigia, 4 passos, "o que você precisa saber" (4 itens com borda esquerda colorida) e os estados de uma transmissão.

## Interações e animação
- Troca de tela: `viewIn` (.34s, `cubic-bezier(.2,.8,.2,1)`, opacity e translateY de 10px até 0). Login e plataformas usam `fadeIn` .4s.
- Linhas de gráfico: `drawIn` 1.4–1.7s via `pathLength=1` + `stroke-dasharray`. Áreas: `fadeIn` com .3s de atraso. Barras: `growY` .7–.8s.
- Hover de card: elevação de 2–3px + borda `#C9C2B6`. Transições de .18–.25s.
- Modais: overlay `rgba(23,20,15,.34–.38)`, clique fora fecha, card com `stopPropagation`.
- `prefers-reduced-motion`: desliga todas as animações.

## Estado (mínimo para o MVP)
`view`, `plataforma`, `canal`, `liveId`, `aba` ('dados'|'relatorio'), `hi` (índice do hover, −1 = nenhum), `help`, `sair`, modais (`add`/`addStep`/`handle`, `exp`/`expFmt`, `pub`), `novos` (canais adicionados), relatório (`relFeitos`, `relGerando`, `relStep`, `relEm`) e login (`email`, `senha`, `verSenha`, `erro`, `recEmail`, `recEnviado`). Sugestão: usar rotas em vez de `view`, como `/login`, `/plataformas`, `/yt/canais`, `/yt/canais/:id`, `/yt/lives/:id?aba=relatorio`.

## Tokens
**Tipografia:** Figtree (400/500/600/700/800) para UI e números. IBM Plex Mono (400/500) para handles, datas, metadados e eixos. Corpo 15px/1.5. Escala: 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16.5, 17, 19, 20, 21, 26, 29, 30, 31, 34px. Títulos com tracking de −.01 a −.03em. Rótulos em caixa alta, 11–11.5px, tracking .06–.07em. Números sempre com `font-variant-numeric: tabular-nums`. Formatação pt-BR (73.729 e 0,05%).

**Cores — app (claro):**
- Fundo `#EFEBE1`, superfície `#FFFFFF`, superfície suave `#FBFAF8` / `#F4F2EE`
- Texto `#17140F`, secundário `#4E4A42`, terciário `#6C6559`, apagado `#8F887C`
- Bordas `#E6E2DB`, `#DDD8CF`, hover `#C9C2B6`, tracejada `#D8D3C9`, divisória `#F0EDE7`, trilho `#EFECE5`
- Marca/YouTube `#DC2A25`, hover `#B8221D`, escuro `#8E1915`; tint `#FDF2F1` / `#F3C9C7`
- Audiência `#2563C7` (tint `#F5F9FE` / `#D9E5F5`)
- Mensagens `#C6541A` (tint `#FDF7F2` / `#F0E0D0`)
- Participação/cobertura `#167A4E` (tint `#F4FAF6` / `#D7E9DE`); OK `#1F9D55`, `#146B3A`, `#EAF6EE`, `#B9DFC6`
- Dossiê/aviso `#FBF6EC` / `#E8DCC4`; âmbar `#8A5A11` / `#FDF4E7` / `#F0D9AE`
- Eixos de gráfico: grade `#DCD6C8`, rótulos `#8F887C` mono

**Cores — login/plataformas (escuro neutro):** `#0B0C0E`, card `#13151A`, borda `#23262C`, input `#0E1013` / `#2A2E35`, texto `#ECEDEF`, secundário `#8B9098` / `#9AA0A9`, terciário `#7D828B` / `#6B717A`.
**Header do app (YouTube):** `#0F0F0F`, pílulas `#1C1C1C` / `#2E2E2E`, texto `#EDEDED` / `#C9C9C9`. As cores da plataforma só aparecem depois que ela é escolhida.

**Raios:** 99 (pílulas), 16 (modais, card de login), 14 (cards), 12 (linhas, cards menores), 10–11 (inputs, botões, sub-cards), 9 (botões secundários), 7–8 (ícones, logos), 2–5 (barras).
**Sombras:** hover de card `0 6px 22px rgba(23,20,15,.09)`, linha `0 3px 14px rgba(23,20,15,.06)`, modal `0 12px 40px rgba(23,20,15,.16)` / `0 16px 48px rgba(23,20,15,.2)`, escuro `0 14px 34px rgba(0,0,0,.45)`, menu `0 18px 44px rgba(0,0,0,.5)`.
**Espaço:** contêiner de 1180px com padding lateral de 24px. Gaps de 8 / 12 / 16. Padding de card `18–22px 20–24px`. Rodapé da página com 72px.

## Assets
Não há imagens nem ícones externos. Logo, pontos e chips são feitos em CSS. Os gráficos são SVG gerados a partir dos dados (viewBox 1000×H, `preserveAspectRatio` padrão). Fontes vêm do Google Fonts.

## Arquivos
- `Vigia Pesquisa v2.dc.html`: **protótipo atual** (template + lógica)
- `Vigia Pesquisa.dc.html`: v1, só para histórico
- `PROMPT_CLAUDE_CODE.md`: prompt pronto para colar no Claude Code
- `livedata.js`: série real de 112 janelas
- `support.js`: runtime do protótipo, só para abrir o HTML (não portar)
- `referencia/handoff_design.md`, `referencia/plataforma_logica_de_uso.md`: contexto de produto e regras de dado

Use a prop `telaInicial` (login, recuperar, plataformas, canais, canal, live, aovivo, perdida, prevista) e `abaLiveInicial` (dados, relatorio) no `data-props` do script para abrir o protótipo direto numa tela.

---

## Mudanças da v2

### Página do canal
- Foto do canal ao lado do nome, com ação "adicionar foto" / "trocar foto" embaixo. No app real, a foto vem de `channels.list` → `snippet.thumbnails`.
- Botão "Abrir no YouTube ↗" que abre `youtube.com/{handle}` em nova aba.
- Métricas do Resumo do canal centralizadas no card.
- Cada live ganha um **número sequencial** por canal, em ordem cronológica (`numLive()`: #1 é a mais antiga). O número aparece na lista, no título da live e no breadcrumb.
- Lista de transmissões em ordem decrescente de número (agendadas no topo).
- Breadcrumb mostra o nome curto da live (`apelido()`) e um selo pequeno com o estado (agendada, ao vivo, perdida ou coletada).
- Saíram os subtítulos desnecessários e as notas de rodapé técnicas.

### Live coletada: aba "Dados da coleta"
Saíram a faixa "Gerar relatório", o bloco "Ainda não coletado" e as notas técnicas. A aba agora tem **6 sub-abas** em controle segmentado: estado `sub`, ação `setSub(k)`, e `goLive` volta para `resumo`. Cada sub-aba empilha seções, e cada seção abre com um título de 19/800 seguido de uma linha `#E6E2DB` até a borda.

| Sub-aba | Seções (em ordem) |
|---|---|
| Resumo | KPIs + curva de audiência · **Momentos** |
| Audiência | audiência + participação · **Depois da live** |
| Chat | mensagens/min, acumulado, distribuição · **Conversa** · **Moderação** |
| Pessoas e apoio | **Quem fala no chat** · **Super Chats e membros** · Comunidade (enquete) |
| Vídeo e contexto | **Vídeo e canal** · **Comparação** (lives anteriores + concorrência) |
| Qualidade da coleta | consulta de espectadores janela a janela |

O mapeamento seção → sub-aba está em `grupo` no `renderVals()`. Sub-abas que dependem de série ou extras somem quando a live não tem esses dados (caso da CNN).

**Fonte de cada seção nova (só API pública, com chave e sem OAuth):**

| Seção | O que mostra | De onde vem |
|---|---|---|
| Momentos | 3 recordes (pico de audiência, chat e apoio) com link; os 6 momentos com msgs vs mediana, espectadores, Super Chats, palavras e "Ver trecho ↗" | séries já coletadas + `liveChatMessages` (texto) |
| Depois da live | views ao fim, +1 h, +6 h, +24 h, +2 d, +3 d, +5 d, +7 d; comentários mais curtidos | `videos.list` (statistics) em polling após o fim; `commentThreads.list` |
| Conversa | tom positivo/neutro/negativo a cada 5 min, palavras, emojis, idiomas, perguntas repetidas, marcas citadas | texto de `liveChatMessages` processado no backend |
| Moderação | apagadas, suspensões, banimentos ao longo da live e por moderador | eventos `messageDeletedEvent` e `userBannedEvent` (`banType`, `banDurationSeconds`) |
| Quem fala no chat | pessoas distintas, msgs/pessoa, quem voltou na live seguinte, composição por tipo de conta, concentração, quem mais escreveu | `authorDetails` (`isChatSponsor`, `isChatModerator`, `isChatOwner`, `isVerified`, `channelId`) |
| Super Chats e membros | total em R$, valor a cada 5 min, faixas de valor, moedas, maiores apoiadores com mensagem, novos membros por nível, quem presenteou, marcos | `superChatEvent`, `superStickerEvent` (`amountMicros`, `currency`), `newSponsorEvent`, `membershipGiftingEvent`, `memberMilestoneChatEvent` |
| Vídeo e canal | agendada × início × fim, curtidas acumuladas, mudanças de título e thumbnail, inscritos antes e depois (arredondados), ficha do vídeo | `videos.list` (`liveStreamingDetails`, `snippet`, `statistics`, `contentDetails`, `topicDetails`, `status`) em polling; `channels.list` |
| Comparação | views, curtidas/mil views, comentários, duração e atraso das lives anteriores; posição; concorrência no mesmo horário com a fatia da audiência | `playlistItems` (uploads) + `videos.list`; `search.list?eventType=live` + `videos.list` (`concurrentViewers`) |

Regras:
- O chat só existe se for coletado **durante** a live. Não há replay de chat pela API.
- Espectadores são sempre simultâneos, nunca únicos.
- Inscritos são arredondados pelo YouTube e a seção diz isso.
- Valores em moeda estrangeira são convertidos para BRL pelo câmbio do dia.
- A cota diária foi ignorada de propósito nesta prova de conceito.
- O link público e o dossiê continuam **sem** texto de chat e sem identificador de autor. As seções novas com handles (quem fala, apoiadores, moderadores) são só da versão interna.

### Coerência de dados ajustada
- O insight do dossiê sobre receita agora usa os mesmos números da seção Super Chats (R$ 2.338,40, pico de R$ 410,00 entre 1:00 e 1:05).
- A live 05/09 aparece como "perdida" (1h37) na Comparação, igual à lista do canal.
- Os 6 momentos do KPI agora aparecem todos na lista, incluindo a queda de audiência às 0:25.
