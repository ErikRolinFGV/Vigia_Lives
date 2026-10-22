# Vigia — monitoramento de lives do YouTube

O Vigia acompanha os canais escolhidos, coleta as lives enquanto estão no ar e
mostra o que aconteceu: quanta gente assistiu, minuto a minuto, quanto da
audiência escreveu no chat, os momentos em que o chat reagiu e o apoio pago.
Depois, compara cada live com as outras e gera um relatório pronto para
compartilhar.

O motivo de existir: **o chat ao vivo some quando a live acaba.** A API do
YouTube não devolve as mensagens depois. Quem não coletou durante a
transmissão perdeu esse dado para sempre. O Vigia fica de olho na agenda dos
canais e começa a coletar sozinho quando a live sobe.

## O que ele faz

**Vigiar canais.** Você cola o @ de um canal e escolhe o que coletar: todas
as lives ou só as que marcar. O vigia lê a agenda da aba /streams do canal
(sem gastar cota), confirma em lote com a API e sobe um coletor por live no ar.
Uma live solta, de um canal que você não vigia, também pode ser coletada pelo
link.

**Coletar.** Durante a live, o coletor guarda:

- o chat inteiro: mensagens, Super Chats, novos membros, assinaturas
  presenteadas, enquetes e mensagens apagadas pela moderação;
- a audiência simultânea, uma leitura por minuto;
- as trocas de título e de thumbnail;
- as lives concorrentes da mesma categoria no ar ao mesmo tempo.

Depois que a live acaba, ele volta ao vídeo várias vezes, de +1 h a +7 dias,
para ler as views e os comentários.

**Mostrar.** Cada transmissão tem uma página com:

- audiência, ritmo do chat e participação (quem escreveu ÷ quem assistia);
- momentos de reação detectados por estatística, com link para o minuto no
  YouTube;
- pessoas e apoio, vídeo e contexto, e a qualidade da coleta, com cada minuto
  coberto ou perdido;
- um replay de como a coleta viu a live.

**Comparar.** Cada live coletada vira uma ficha com 19 métricas. A ficha mostra
a posição da live no canal, na mesma categoria e entre todas as coletas, e uma
página põe até 4 lives lado a lado.

**Entregar.** O dossiê resume a live num veredito e em achados. Ele situa a
live no histórico do canal, e cada número é calculado da coleta. O resultado
pode sair como:

- link público, sem login, que mostra só números agregados;
- arquivo CSV, JSON ou Markdown.

**Dizer a verdade sobre a coleta.**

- **Cobertura.** É medida pelos dados: o tempo em que o coletor estava ligado
  e recebendo resposta do YouTube. Uma queda de internet aparece como buraco,
  e a coleta vira *parcial*.
- **Links reaproveitados.** Quando o canal usa o mesmo link para outra
  transmissão (troca o título e passa outro jogo), a coleta é dividida em
  trechos. A página mostra de que link cada trecho veio e se o mesmo conteúdo
  passou em outro link que não foi coletado.
- **Descarte.** Uma coleta pode ser descartada, com motivo e volta: muito
  parcial, reprise...
- **Cota.** O consumo é previsto e acompanhado.

## Privacidade

- **Identidade separada.** O nome e o canal de quem escreve ficam em uma única
  tabela, `autor_identidade`. O resto do banco usa um pseudônimo, um hash com
  salt. Apagar essa tabela anonimiza a base inteira sem quebrar nenhuma
  análise.
- **Expurgo.** As identidades vencem em 90 dias e são apagadas sozinhas.
- **Link público.** Mostra só agregados: nunca texto de chat, autor, custo ou
  cota.
- **Inteligência artificial.** Nenhuma lê o texto do chat. Quando entrar um
  dossiê escrito por modelo ou um chatbot, eles vão trabalhar só com números
  agregados.

## Como rodar

Passo a passo completo, incluindo como criar a chave gratuita da YouTube Data
API, em **[INSTALL.md](INSTALL.md)**. Versão curta (Windows):

```
py -m venv .venv && .venv\Scripts\activate
pip install -e ".[api]"
copy .env.example .env          # cole sua chave em YT_API_KEY
lives-api                        # API em http://127.0.0.1:8000
cd web && npm install && npm run dev    # interface em http://localhost:5173
```

Na interface, o botão do cabeçalho liga o vigia. Ele roda como processo
próprio: fechar ou reiniciar a API não interrompe uma coleta em andamento.
Sem o vigia de pé nada é coletado, e a interface avisa. O login é de
demonstração: qualquer e-mail válido e senha com 6 ou mais caracteres.
Depois de `npm run build`, a própria API serve a interface.

Para rodar num servidor Linux, sempre ligado, veja **[deploy/README.md](deploy/README.md)**:
serviços do systemd, nginx com senha, backup diário e a troca do PC para o servidor.

## Limites de hoje

- **O coletor roda no seu computador.** Ele precisa ficar ligado, sem dormir e
  com internet durante as lives. Cada queda vira um buraco na coleta, que a
  plataforma mostra. O projeto já está pronto para ir para um servidor
  ([deploy/README.md](deploy/README.md)).
- **Cota.** A cota gratuita do YouTube é de 10.000 unidades por dia. Uma live
  com chat movimentado gasta perto de 1.000 unidades por hora. A tela do canal
  prevê o gasto do dia antes de você marcar mais lives.
- **Estrutura.** O banco é SQLite e o login é de demonstração. Servidor,
  Postgres e contas de verdade ficam para quando a coleta sair do PC.

## Como está organizado

| pasta | o que tem |
|---|---|
| `collector/` | coletor, vigia, cliente da API do YouTube, banco e relatório da camada 0. Só a biblioteca padrão do Python |
| `api/` | API FastAPI: canais, transmissões, trechos, ficha e comparação, dossiê, exportação e link público |
| `web/` | interface em React + Vite + TypeScript, temas claro e escuro |
| `deploy/` | serviços do systemd, nginx e script de instalação para servidor Linux ([guia](deploy/README.md)) |
| `docs/` | plano da v2 e decisões tomadas, com o porquê de cada uma ([plano_v2.md](docs/plano_v2.md)) |
| `design_handoff_vigia_pesquisa/` | protótipo e especificação de design |
| `data/` | banco SQLite e log do vigia (fora do git) |

## Decisões técnicas

**Custo de cota visível.** Toda chamada à API é registrada com o custo em
unidades (`coleta_log`). É daí que saem a previsão de cota e a medida de
cobertura.

**Janela adaptativa do chat.** `liveChatMessages.list` custa 5 unidades. O
coletor pede a cada 20 s e ajusta entre 5 s e 60 s conforme o volume. Espaçar
não perde mensagem: o `nextPageToken` devolve tudo desde a última chamada.

**Descobrir lives sem gastar cota.** A agenda vem da página pública do canal.
A API entra só para confirmar, 1 unidade para até 50 vídeos. Uma live marcada
que some da resposta da API é conferida na página do vídeo.

**Números nunca vêm de um modelo.** O dossiê de hoje é escrito por regras:
frases fixas, escolhidas pelo que os números mostram, e cada número é
calculado da coleta.

**Dinheiro em micros inteiros**, como a API devolve. Nunca float.

## Linha de comando

O coletor original continua funcionando sozinho, sem a interface:

```bash
lives-coletar --video VIDEO_ID            # coletar uma live no ar
lives-coletar --canal @canal              # esperar a live do canal subir
lives-report --video VIDEO_ID             # relatório da live coletada
lives-quota --dias 7                      # auditoria de cota
python -m collector.backup                # copia segura do banco, com o vigia rodando
python -m collector.checar                # esta maquina esta pronta para o vigia?
lives-demo && lives-report --video DEMO_SINTETICO   # testar sem chave nem live
```
