Copie o bloco abaixo e cole no Claude Code, com a pasta `design_handoff_vigia_pesquisa/` dentro do repositório.

---

```
Você vai implementar a v2 do Vigia Pesquisa (MVP da conta "pesquisador"). A referência de design está em design_handoff_vigia_pesquisa/.

Leia primeiro:
1. design_handoff_vigia_pesquisa/README.md, inteiro, principalmente a seção "Mudanças da v2".
2. design_handoff_vigia_pesquisa/Vigia Pesquisa v2.dc.html. É um protótipo HTML: o markup fica entre <x-dc> e </x-dc> com {{ }}, <sc-if> e <sc-for>, e a lógica fica em class Component, nos métodos renderVals(), dados(), liveInfo() e mvp(). Não copie o HTML: recrie no stack do projeto seguindo os padrões que já existem. Não porte support.js.
3. referencia/*.md, para as regras de produto e de dado.

Se o repositório já tem a v1 implementada, aplique só o diff descrito em "Mudanças da v2":
- Página do canal: foto do canal (channels.list → thumbnails) com ação de trocar ou adicionar, botão "Abrir no YouTube ↗", resumo centralizado, número sequencial por live (#1 = mais antiga, igual a numLive()), lista em ordem decrescente de número, breadcrumb com nome curto da live (apelido()) e selo de estado.
- Live coletada, aba "Dados da coleta": substituir o conteúdo por 6 sub-abas (Resumo, Audiência, Chat, Pessoas e apoio, Vídeo e contexto, Qualidade da coleta). Cada uma empilha seções com título, seguindo a tabela do README e o mapa `grupo` no renderVals(). Remover a faixa "Gerar relatório", o bloco "Ainda não coletado" e as notas técnicas.
- Seções novas: Momentos, Depois da live, Conversa, Moderação, Quem fala no chat, Super Chats e membros, Vídeo e canal, Comparação (lives anteriores + concorrência).

Dados:
- Os números das seções novas no protótipo (método mvp()) são ILUSTRATIVOS. Não os coloque fixos no código. Crie, no backend, a coleta e a agregação de cada um a partir da API pública do YouTube (só chave, sem OAuth), usando a tabela "Fonte de cada seção nova" do README: liveChatMessages (eventos de Super Chat, membros, moderação, authorDetails), videos.list em polling durante e depois da live, channels.list, playlistItems, commentThreads.list e search.list?eventType=live.
- O texto do chat é analisado no backend (palavras, emojis, idioma, sentimento, perguntas, marcas). Ele nunca vai para o modelo do dossiê nem para o link público. Handles de autor aparecem só na versão interna.
- Campo sem dado aparece como "—" ou "não consta", nunca como estimativa. O chat só existe se for coletado durante a live.
- Ignore o limite de cota diária nesta fase (prova de conceito), mas registre o custo por método como já é feito.

Visual: alta fidelidade. Cores, tipografia (Figtree + IBM Plex Mono), raios e espaçamentos estão no README ("Tokens") e inline no protótipo. Números com tabular-nums e formatação pt-BR.

Antes de codar, me mostre um plano curto: arquivos que vai criar ou alterar, modelo de dados das agregações novas e endpoints. Depois implemente por etapas: (1) página do canal, (2) estrutura das sub-abas, (3) cada seção nova com dados mockados vindos de um endpoint, (4) coleta real no backend.
```
