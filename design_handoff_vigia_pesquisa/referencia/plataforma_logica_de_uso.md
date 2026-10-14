# Do coletor à plataforma: lógica de uso

Documento de produto. Define o que a plataforma manipula, como alguém a usa e
o que separa o que já existe do que ainda não existe. Escrito em 09/09/2026,
depois de duas coletas reais e com o coletor funcionando ponta a ponta.

Decisões que este documento assume, tomadas em 09/09/2026:
o operador é uma pessoa só (Erik), o cliente recebe um relatório e não tem
login, e a escolha de infraestrutura fica para quando houver piloto ou dinheiro
em jogo. O desenho, porém, supõe coleta contínua: adiar a decisão de servidor
não é o mesmo que desenhar para um coletor que dorme.

---

## 1. A diferença que define tudo

O [[Deeper]] é fotografia sob demanda. O analista digita um nome quando precisa,
e o dado está lá, porque imprensa e LinkedIn continuam existindo. Se ele não
pesquisar hoje, pesquisa amanhã.

Este produto é vigilância com janela que fecha. O chat ao vivo do YouTube existe
enquanto a transmissão está no ar e some quando ela acaba. Não há coleta
atrasada: há coleta ou não há dado, para sempre.

Quatro consequências, e elas não são detalhes de implementação:

**O objeto central é um canal vigiado, não uma busca.** O usuário assina um
canal uma vez; a obrigação de estar de pé quando a live sobe é da plataforma.
Nunca existirá um botão "coletar a live de ontem".

**O coletor não pode morar num computador pessoal.** Enquanto morar, a promessa
central está quebrada e a plataforma é uma ferramenta de uso assistido, não um
serviço. Isso é honesto de dizer numa reunião, e é a primeira despesa real.

**Cobertura é SLA, não estatística interna.** A métrica que nasceu por
honestidade vira a promessa: "acompanhamos 99,7% da sua transmissão". Live com
cobertura baixa precisa aparecer marcada, nunca misturada às boas.

**Existe um estado que o Deeper não tem: live perdida.** Transmissão que
aconteceu e ninguém coletou. A plataforma deve mostrar isso em vez de omitir,
porque esse buraco é exatamente o que justifica a assinatura.

---

## 2. O que a plataforma manipula

Seis objetos. Os quatro primeiros já existem no banco atual.

| Objeto | O que é | Estado hoje |
|---|---|---|
| **Canal vigiado** | assinatura de vigilância sobre um canal | tabela `canal` existe, mas sem a noção de "vigiado" |
| **Transmissão** | uma live, com estados e cobertura | tabela `live`, com `status` e `cobertura_pct` |
| **Momento** | pico, queda ou virada, com link para o instante | tabela `momento`, detecção por z-score |
| **Enquete** | votação do canal e seus resultados | tabela `enquete`, implementada, sem dado real ainda |
| **Relatório** | versão publicada e compartilhável de uma transmissão | não existe: hoje é arquivo solto em `reports/` |
| **Comparação** | uma transmissão contra o histórico do canal | não existe |

### Os estados de uma transmissão

O ciclo de vida é o esqueleto da interface inteira. Toda tela é uma leitura
diferente desta máquina de estados.

```
                    ┌──────────────┐
                    │   AGENDADA   │  data anunciada, coletor a postos
                    └──────┬───────┘
                           │ a live sobe
                    ┌──────▼───────┐
              ┌─────│    NO AR     │  coletando, cobertura acumulando
              │     └──────┬───────┘
   coleta cai │            │ actualEndTime
              │     ┌──────▼───────┐
              │     │  ENCERRADA   │  relatório pronto
              │     └──────────────┘
              │
        ┌─────▼──────┐        ┌──────────────┐
        │  PARCIAL   │        │   PERDIDA    │
        │ cobertura  │        │ aconteceu e  │
        │  abaixo do │        │ ninguém      │
        │  aceitável │        │ coletou      │
        └────────────┘        └──────────────┘
```

`PERDIDA` e `PARCIAL` não são erros a esconder. São a prova do problema que o
produto resolve, e precisam de tratamento visual próprio.

---

## 3. Como alguém usa

Seis jornadas. A ordem é a do valor percebido, não a de implementação.

### J1. Colocar um canal sob vigilância
O operador cola `@CazeTV`. A plataforma resolve o canal, mostra as próximas
transmissões e passa a vigiar. Uma vez só; depois é automático.
*Hoje: `agenda.py` já faz a leitura da aba /streams sem custo de cota.*

### J2. Saber o que vem por aí
Agenda do canal: o que está no ar, o que está marcado e quando, o que já foi.
Responde à pergunta operacional de todo dia: preciso estar pronto quando?
*Hoje: existe como saída de terminal.*

### J3. Acompanhar ao vivo
Contador subindo, cobertura acumulando, picos aparecendo conforme acontecem.
Vale menos do que parece: o valor real do produto é o que sobra depois. Mas é
a tela que convence numa demonstração, porque mostra o dado sendo capturado
no instante em que ele existiria e sumiria.
*Hoje: existe como log de terminal rolando.*

### J4. Ler o relatório da transmissão
O entregável. Audiência contra participação, momentos com link para o instante,
enquetes com resultado, vocabulário, doações, cobertura declarada.
*Hoje: pronto, em markdown e em HTML autocontido.*

### J5. Comparar com o histórico
A live de sábado contra as oito anteriores. Onde a participação caiu, qual
formato prendeu mais, que horário rende chat mais quente. É aqui que a
plataforma deixa de ser relatório e vira assinatura: um relatório se lê uma
vez, uma série temporal se consulta toda semana.
*Hoje: não existe. O banco já guarda tudo que ela precisa.*

### J6. Entregar para a marca
O criador manda um link a um anunciante mostrando engajamento verificado.
É a Camada 2 do posicionamento estratégico, e a razão pela qual o relatório
precisa ter uma versão publicável separada da versão de trabalho.
*Hoje: não existe.*

---

## 4. As telas

Fluxo completo, incluindo o que ainda não tem dado por trás.

| # | Tela | Responde | Dado hoje |
|---|---|---|---|
| 1 | **Canais vigiados** | o que estou monitorando e como andou | parcial |
| 2 | **Agenda do canal** | quando preciso estar pronto | sim |
| 3 | **Ao vivo** | está funcionando agora? | sim, em terminal |
| 4 | **Relatório da transmissão** | o que aconteceu nessa live | sim, completo |
| 5 | **Histórico do canal** | como essa live se compara | não, mas o banco tem |
| 6 | **Estados de falha** | por que essa live não tem dado | sim |

A tela 4 é a única com dado real hoje, e é a que já foi validada com a Caze TV
e a CNN. As outras cinco existem para mostrar o produto inteiro; o handoff de
design marca explicitamente o que é real e o que é projeção.

---

## 5. O que temos hoje e o que podemos ter amanhã

Separado pelo critério que importa: o que depende só de escrever código e o
que depende de autorização de terceiro.

### Já coletado e funcionando
Chat completo com autor pseudonimizado e papel (dono, moderador, membro pago);
Super Chat e Super Sticker em micros inteiros; espectadores simultâneos ao
longo do tempo; novos membros e presentes de assinatura; enquetes do canal com
votos por opção; momentos por z-score com link para o instante; cobertura da
coleta; custo em unidades da API.

### Disponível na API pública, ainda não coletado
Mensagens deletadas e usuários banidos, que medem a intensidade da moderação
(e conversam com o leetspeak que já observamos no chat da CNN: gente escrevendo
MEND0NÇA para escapar do filtro). Estatísticas finais do vídeo depois da live.
Metadados de membros por nível. Nada disso exige autorização: exige código.

### Análise que depende de custo, não de permissão
Camada 1 do plano: sentimento por janela e classificação de tópico, com
amostragem estratificada sobre o que a camada 0 já filtrou. O schema já está
versionado por `(msg_id, modelo, prompt_versao)`, então trocar de modelo gera
safra nova ao lado da antiga em vez de sobrescrever.

### Só com OAuth do canal, e é o mais valioso
Retenção de audiência, tempo médio assistido, origem de tráfego, dispositivo,
geografia e demografia agregada. É o conjunto que transforma "1,4% escreveram"
em "quem são os 98,6% que não escreveram". Depende de a Caze TV conceder
acesso, o que é uma conversa comercial, não técnica. As tabelas
`analytics_retencao` e `analytics_dimensao` já existem no schema, vazias,
esperando.

### Outra plataforma
Twitch, previsto desde o início do projeto. O modelo de dados foi desenhado
com `plataforma` em `canal` justamente para isso.

---

## 6. Como plataformizar reusando o que já sabemos

A stack do Deeper serve quase inteira, e isso vale mais que qualquer ganho
técnico: você já operou, já testou e já defendeu essa arquitetura.

| Camada | Deeper | Aqui |
|---|---|---|
| API | FastAPI + Pydantic | igual |
| Banco | PostgreSQL + SQLAlchemy + Alembic | igual, migrando do SQLite |
| Fila | Redis + RQ | igual, com uma diferença importante |
| Front | HTML único | igual |
| LLM | Anthropic SDK | igual, na camada 1 |

**A diferença que importa está na fila.** No Deeper, todo job nasce de um
clique: o analista pede um dossiê, entra na fila, sai um resultado. Aqui existe
um processo que ninguém pediu e que não pode parar: o vigia, que acorda de
tempos em tempos, olha a agenda de cada canal vigiado e decide se precisa
subir um coletor. O trabalho não é disparado por usuário, é disparado pelo
mundo.

Isso cria duas classes de worker:

- **vigia** — um só, permanente, barato, sem cota (lê RSS e a aba /streams)
- **coletor** — um por transmissão no ar, vive o tempo da live, consome cota

Todo o resto do desenho decorre disso: o vigia precisa sobreviver a reinício,
o coletor precisa ser idempotente (já é, o `msg_id` da API garante), e a
plataforma precisa registrar por que uma live ficou sem coleta, porque essa
é a falha que o cliente vai perguntar.

### O que migrar do SQLite para o Postgres
O schema atual vai quase inteiro. As mudanças necessárias:
`AUTOINCREMENT` vira `SERIAL`/`IDENTITY`; os `TEXT` de timestamp viram
`TIMESTAMPTZ`; os campos JSON em `TEXT` (`opcoes`, `emojis_top`, `termos_top`,
`bruto`) viram `JSONB`, o que torna consultável o que hoje é opaco. O princípio
de pseudonimização não muda uma linha: `autor_identidade` continua sendo a
única tabela com dado pessoal, e apagá-la continua anonimizando a base inteira.

### Rotas, no formato do contrato que você já escreveu para o Deeper

| Rota | Função |
|---|---|
| `GET /canais` | canais vigiados, com resumo da última transmissão |
| `POST /canais` | passa a vigiar um canal (`@handle` ou UC...) |
| `DELETE /canais/{id}` | para de vigiar |
| `GET /canais/{id}/agenda` | no ar, agendadas e encerradas |
| `GET /canais/{id}/historico` | série das transmissões para comparação |
| `GET /transmissoes/{id}` | relatório completo |
| `GET /transmissoes/{id}/ao-vivo` | estado da coleta em andamento |
| `POST /transmissoes/{id}/coletar` | força coleta agora (live no ar) |
| `POST /transmissoes/{id}/publicar` | gera a versão compartilhável |
| `GET /r/{token}` | relatório público, sem login, para mandar à marca |
| `GET /operacao/cota` | consumo por dia e por canal |
| `GET /operacao/saude` | vigia de pé, coletas ativas, últimas falhas |

As duas últimas não têm equivalente no Deeper e existem porque aqui há um
processo contínuo que pode estar quebrado sem ninguém perceber.

---

## 7. O que NÃO fazer agora

**Não construir login e multiusuário.** A Fase 2 do Deeper ainda não foi feita
e ele já valeu como demonstração. Um operador só, cliente recebendo link, prova
o valor sem pagar o custo de conta, permissão e isolamento de dados.

**Não prometer a Camada 3.** Os Termos de Serviço da API do YouTube restringem
uso de dado agregado de múltiplos canais para segmentação publicitária. Isso
está registrado no posicionamento e não mudou.

**Não desenhar tela para dado que depende de OAuth** sem marcar claramente que
depende. Uma tela bonita de retenção que a Caze TV não autorizou vira promessa
que você não controla.

**Não trocar o markdown do relatório pelo HTML.** Os dois servem a públicos
diferentes: markdown é o formato de trabalho e de versionamento; o HTML é o que
vai para o cliente.
