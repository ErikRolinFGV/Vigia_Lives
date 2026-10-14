# Handoff de design: plataforma de monitoramento de lives

Material de entrada para a sessão de design. Escrito em 09/09/2026.
Companion de [`plataforma_logica_de_uso.md`](plataforma_logica_de_uso.md), que
tem o raciocínio de produto; aqui está só o que o design precisa saber.

---

## 1. O que é, em uma frase

Uma plataforma que fica de vigília sobre canais do YouTube e captura o que a
live produz e perde: chat, doações, enquetes, curva de audiência e os momentos
em que o público reagiu. O chat ao vivo some quando a transmissão acaba; a
plataforma existe para estar presente na hora em que o dado existe.

## 2. Quem usa

**Operador (um só, o Erik).** Vê todos os canais vigiados, a saúde da coleta e
o consumo de cota. É quem opera a plataforma no dia a dia.

**Cliente (Caze TV).** Não tem login. Recebe um link para um relatório
publicado. É leitor, não usuário: a tela dele precisa se explicar sozinha, sem
tutorial e sem jargão de coleta.

Essa separação é a decisão de produto mais importante para o design: **as telas
1, 2, 3 e 6 são de operação; a 4 tem duas versões (interna e pública); a 5 é
de análise e pode ser mostrada ao cliente.**

## 3. A frase que o produto precisa saber dizer

Dado real da transmissão Brasil x Canadá, sub-20 feminina, 08/09/2026:

> A audiência foi de 4.134 para 71.864 espectadores, 17 vezes maior.
> No mesmo intervalo, a fração que escreve no chat caiu de 0,20% para 0,05%.

Quem olha o painel do YouTube vê a curva subindo e conclui que está indo bem.
São dois públicos diferentes e a métrica nativa não separa um do outro. **Se o
design comunicar só uma coisa, é essa.**

## 4. As telas

Marcadas por origem do dado: **[real]** existe no banco hoje, **[projeção]**
depende de código ainda não escrito, **[bloqueado]** depende de autorização do
canal.

### Tela 1 — Canais vigiados (home do operador)
Cartão por canal: nome, se está no ar agora, quando é a próxima transmissão,
resumo da última (espectadores de pico, participação, cobertura) e um alerta se
houve live perdida.
Estado vazio importa: nenhum canal vigiado ainda, com um único campo para colar
um `@handle`. **[parcial]**

### Tela 2 — Agenda do canal
Três grupos: no ar agora, agendadas com data e contagem regressiva, encerradas
com link para o relatório. Responde "quando eu preciso estar pronto".
Estado vazio: canal sem nada agendado. **[real]**

### Tela 3 — Ao vivo
Coleta acontecendo: mensagens acumuladas, espectadores agora, cobertura
subindo, últimos momentos detectados aparecendo conforme acontecem, cota
consumida nesta coleta. Um botão de encerrar coleta.
É a tela que convence em demonstração, porque mostra dado sendo capturado no
instante em que ele existiria e sumiria. **[real, hoje como log de terminal]**

### Tela 4 — Relatório da transmissão (o entregável)
Já existe implementado e renderizado, em `reports/dashboard_egm9wCyhXac.html`.
**Abrir esse arquivo antes de desenhar: ele é o ponto de partida, não uma
referência solta.** Estrutura atual, que funciona e deve ser preservada na
ordem: números do topo, a frase do achado, três painéis empilhados (audiência,
mensagens por minuto, participação) com eixo de tempo compartilhado, momentos
com link, enquetes, custo de coleta, tabela de dados.
Precisa de duas versões: interna (com custo de cota e diagnóstico) e pública
(sem nada de operação, com o nome do canal em evidência). **[real]**

### Tela 5 — Histórico do canal
Esta live contra as anteriores: participação ao longo das semanas, pico de
audiência por transmissão, quais formatos ou horários rendem chat mais quente.
É o que transforma relatório em assinatura. O banco já tem tudo que ela
precisa. **[projeção]**

### Tela 6 — Estados de falha
Não é uma tela, é um conjunto de situações que precisam de tratamento próprio e
que costumam ser esquecidas em mockup:

- **Live perdida** — aconteceu e ninguém coletou. Não esconder: é a prova do
  problema que o produto resolve.
- **Cobertura parcial** — coletamos 62% da transmissão. Precisa de marca visual
  distinta, nunca misturada às coletas boas, e o relatório precisa dizer onde
  ficou o buraco.
- **Coleta caiu e voltou** — a internet oscilou; há um vale no gráfico que é do
  coletor, não do público.
- **Cota estourada** — as 10 mil unidades do dia acabaram; a próxima live não
  será coletada.
- **Canal sem transmissão agendada** — estado normal, não erro.

## 5. Linguagem visual

O Deeper (`CEO_Mais/frontend/index_v2.html`) usa fundo escuro quente, acento
âmbar `#F5921E`, Space Grotesk nos títulos e Nunito no texto, com tokens em
escalas numeradas (`--sup1..4`, `--bd1..5`, `--tx1..6`). **Herdar essa estrutura
de tokens** dá coerência ao seu portfólio e economiza decisão.

Uma ressalva técnica que o design precisa respeitar: **o acento da marca não
pode ser cor de série de dado.** O âmbar do Deeper colide com o laranja usado
hoje para "mensagens por minuto". A paleta de dados do dashboard atual foi
validada por script para daltonismo e contraste nos modos claro e escuro:
azul `#2a78d6` para audiência, laranja `#eb6834` para chat, verde `#1baf7a`
para participação (variantes escuras `#3987e5`, `#d95926`, `#199e70`). Se a
superfície mudar para o marrom escuro do Deeper, **a paleta precisa ser
revalidada contra a nova superfície**, não adaptada no olho.

Duas regras de gráfico que não são preferência estética:

1. **Nunca eixo duplo.** Audiência e mensagens têm escalas diferentes e vão em
   painéis empilhados com o mesmo eixo de tempo. Sobrepor as duas curvas num
   eixo só distorce exatamente a comparação que é o argumento do produto.
2. **Cobertura sempre visível.** Em toda tela que mostra número de uma
   transmissão, a cobertura aparece junto. É o que separa "o público ficou
   quieto" de "o coletor caiu", e é a promessa contratual da plataforma.

## 6. Tom

O cliente é uma produtora de transmissão esportiva, não uma consultoria. A
interface deve soar como uma mesa de operação: direta, densa em número, sem
celebração. Nada de "insights incríveis" nem de linguagem de dashboard
corporativo. Quando o dado for ruim ou faltar, dizer que faltou.

## 7. Dados reais para popular as telas

Use estes números, não números inventados. São de coletas verdadeiras e estão
no banco.

**Brasil x Canadá, sub-20 feminina, CazéTV, 08/09/2026** (1h51 coletada)
73.729 espectadores no pico · 3.125 mensagens · 1.059 autores únicos ·
1,4% de participação no pico · cobertura 99,7% · 1.126 unidades de cota (11,3%)
· 5 picos de chat, o maior 10,7 sigma · gol detectado aos 62:00 com 8,8 sigma ·
R$ 0,00 em doações (a CazéTV não usa Super Chat) · 15 membros pagos escreveram

**CNN Novo Dia, CNN Brasil, 08/09/2026** (33 min coletados)
17.761 espectadores no pico · 805 mensagens · 89 autores · 0,5% de
participação · cobertura 99,7% · zero momentos detectados, porque chat de
telejornal é estável e isso é resultado, não falha

**Enquete** (capturada da tela da CazéTV, formato real do que a API devolve)
"ESSE 1 A 0 VAI VIRAR O QUÊ?" com 696 votos:
GOLEADA! Pode abrir a porteira! · Cabe mais um pra tranquilizar! ·
1 a 0 tá ótimo, pode acabar!

## 8. O que não desenhar

- Login, cadastro, recuperação de senha, times, permissões. O MVP tem um
  operador só.
- Qualquer tela de retenção, demografia ou origem de tráfego **sem marcar que
  depende de autorização da Caze TV**. Prometer visualmente o que não se
  controla é dívida com o cliente.
- Marketplace de criador e anunciante. Esbarra em restrição de uso de dados da
  API e está fora do escopo.
- Nome ou foto de quem escreveu no chat. O banco guarda dado pessoal numa única
  tabela isolada, com expurgo programado, e a interface trabalha só com
  pseudônimo. Isso é decisão de arquitetura e argumento comercial, não detalhe.

## 9. Perguntas em aberto para a sessão de design

1. A tela ao vivo e a tela de relatório são a mesma tela em estados diferentes,
   ou duas telas? A primeira opção é mais elegante e mais arriscada.
2. O histórico do canal é uma tela própria ou uma faixa dentro do relatório
   comparando com a média das anteriores?
3. O relatório público deve parecer produto da plataforma ou material do
   próprio canal? Muda se o objetivo é vender a plataforma ou servir o cliente.
