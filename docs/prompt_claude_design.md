Preciso desenhar as telas de uma plataforma de monitoramento de lives do
YouTube. Quero mockups estáticos, um artboard por tela, em desktop 1440
de largura.

## O produto em uma frase

Uma plataforma que fica de vigília sobre canais do YouTube e captura o que
uma transmissão ao vivo produz e perde: chat, doações, enquetes, curva de
audiência e os momentos em que o público reagiu. O chat ao vivo desaparece
quando a live acaba, então a plataforma existe para estar presente na hora
exata em que o dado existe. Não há coleta atrasada: ou se coletou, ou o dado
não existe mais.

Isso não é um produto de busca, é um produto de vigilância. O usuário assina
um canal uma vez e a obrigação de estar de pé quando a live sobe é da
plataforma. Nunca existirá um botão "coletar a live de ontem".

## Quem usa

Duas pessoas, com necessidades opostas.

O operador, uma pessoa só, que vê todos os canais vigiados, a saúde da coleta
e o consumo de cota da API. Interface densa, de mesa de operação.

O cliente, uma produtora de transmissão esportiva, que não tem login e recebe
um link para um relatório. É leitor, não usuário: a tela dele precisa se
explicar sozinha, sem tutorial e sem jargão de coleta.

## A ideia que a plataforma precisa comunicar

Dado real de uma transmissão coletada:

  A audiência foi de 4.134 para 71.864 espectadores, 17 vezes maior.
  No mesmo intervalo, a fração que escreve no chat caiu de 0,20% para 0,05%.

Quem abre o painel do YouTube vê a curva de espectadores subindo e conclui
que a live foi bem. São dois públicos diferentes e a métrica nativa não
separa um do outro. Se o design comunicar uma coisa só, é essa.

## As telas

1. Canais vigiados, home do operador. Um cartão por canal com nome, se está
   no ar agora, quando é a próxima transmissão, resumo da última (pico de
   espectadores, participação, cobertura) e aviso quando houve live perdida.
   Desenhar também o estado vazio, com um único campo para colar um @handle.

2. Agenda do canal. Três grupos: no ar agora, agendadas com data e contagem
   regressiva, encerradas com link para o relatório. Responde à pergunta
   operacional de todo dia, que é "quando eu preciso estar pronto".

3. Ao vivo. A coleta acontecendo: mensagens acumuladas subindo, espectadores
   agora, cobertura acumulando, momentos aparecendo conforme são detectados,
   cota consumida nesta coleta, e um botão de encerrar. É a tela que convence
   em demonstração, porque mostra o dado sendo capturado no instante em que
   ele existiria e sumiria.

4. Relatório da transmissão. O entregável principal, e a única tela que já
   existe implementada. A ordem atual funciona e deve ser preservada: números
   no topo, a frase do achado em destaque, três painéis empilhados (audiência,
   mensagens por minuto, participação) com o mesmo eixo de tempo, tabela de
   momentos com link para o instante do vídeo, enquetes com resultado,
   vocabulário do chat, custo de coleta, tabela de dados completa.

5. Histórico do canal. Esta transmissão contra as anteriores: participação ao
   longo das semanas, pico de audiência por live, que formatos e horários
   rendem chat mais quente. É o que transforma relatório avulso em assinatura.

6. Estados de falha, numa folha só. Não é uma tela, é o conjunto de situações
   que mockup costuma esquecer e que aqui são o coração do argumento:
   live perdida (aconteceu e ninguém coletou), cobertura parcial (coletamos
   62% da transmissão), coleta que caiu e voltou (o vale no gráfico é do
   coletor e não do público), cota diária estourada, e canal sem transmissão
   agendada, que é estado normal e não erro.

Live perdida e cobertura parcial não devem ser escondidas nem suavizadas.
São a prova do problema que o produto resolve.

## Dados reais para popular as telas

Use estes números, são de coletas verdadeiras. Não invente outros.

Brasil x Canadá, Copa do Mundo FIFA Feminina Sub-20, canal CazéTV, 1h51
coletada: 73.729 espectadores no pico, 3.125 mensagens, 1.059 autores únicos,
1,4% de participação no pico, cobertura de 99,7%, 1.126 unidades de cota
(11,3% do limite diário), 5 picos de chat detectados, o maior de 10,7 sigma,
gol detectado aos 62:00 com 8,8 sigma, R$ 0,00 em doações porque esse canal
não usa Super Chat, 15 membros pagos escreveram.

CNN Novo Dia, canal CNN Brasil, 33 minutos coletados: 17.761 espectadores no
pico, 805 mensagens, 89 autores, 0,5% de participação, cobertura de 99,7%,
zero momentos detectados porque chat de telejornal é estável, e isso é
resultado e não falha.

Enquete real capturada durante o jogo, com 696 votos:
"ESSE 1 A 0 VAI VIRAR O QUÊ?" com as opções "GOLEADA! Pode abrir a porteira!",
"Cabe mais um pra tranquilizar!" e "1 a 0 tá ótimo, pode acabar!".

## Linguagem visual

Herde o sistema de outra ferramenta que eu mesmo construí, para os dois
produtos parecerem da mesma casa. Fundo escuro quente, tokens em escala:

  superfícies  #0E0B07 (fundo), #14100A, #161109, #18130C, #1F180E
  bordas       #211A11, #251D13, #332818, #463822, #4A3C26
  texto        #F5EFE6, #EDE6DA, #CFC3B0, #B3A48E, #8A7A64, #5E5240
  acento       #F5921E, claro #FFB25C, escuro #E06D10
  estado       negativo #E5484D, neutro #8A7A64, positivo #46A758

Space Grotesk nos títulos e no wordmark, Nunito no texto corrido. Raios de 9
a 14px. Cartões com fundo de superfície e borda de um passo acima. Itens de
navegação com barra de acento de 2px à esquerda quando ativos. Densidade alta,
sem áreas grandes vazias.

## Duas regras de gráfico que não são preferência estética

Primeira: nunca eixo duplo. Audiência e mensagens por minuto têm escalas
completamente diferentes e vão em painéis empilhados compartilhando o eixo de
tempo. Sobrepor as duas curvas em um eixo só distorce exatamente a comparação
que é o argumento do produto.

Segunda: o acento âmbar da marca não pode ser cor de série de dado. A paleta
de dados é azul #2a78d6 para audiência, laranja #eb6834 para chat e verde
#1baf7a para participação, validada para daltonismo e contraste. Se ela for
usada sobre o fundo marrom escuro, precisa ser revalidada contra essa
superfície, não ajustada no olho.

Terceira, que é de produto e não de gráfico: em toda tela que mostra número de
uma transmissão, a cobertura da coleta aparece junto. É o que separa "o
público ficou quieto" de "o coletor caiu", e é a promessa contratual da
plataforma.

## Tom

O cliente é uma produtora de transmissão esportiva, não uma consultoria. A
interface deve soar como mesa de operação: direta, densa em número, sem
celebração. Nada de linguagem de dashboard corporativo, nada de "insights
incríveis". Quando o dado faltar, dizer que faltou.

## O que não desenhar

Login, cadastro, times e permissões, porque o MVP tem um operador só.

Qualquer tela de retenção de audiência, demografia ou origem de tráfego sem
marcar visualmente que depende de autorização do canal. Esses dados existem
na API do YouTube mas só com OAuth concedido pelo cliente, o que é conversa
comercial e não sprint. Prometer visualmente o que não se controla é dívida.

Marketplace ligando criador e anunciante, que esbarra em restrição de uso de
dados da API.

Nome ou foto de quem escreveu no chat. O banco isola dado pessoal em uma
única tabela com expurgo programado e a interface trabalha só com pseudônimo.
Isso é decisão de arquitetura e argumento comercial, não detalhe.

## Uma decisão que eu ainda não tomei

O relatório que o canal manda para uma marca deve parecer material do próprio
canal, com a marca dele em evidência e a plataforma discreta no rodapé, ou
produto da plataforma, com a minha marca em evidência e o canal como assunto?
O primeiro serve melhor ao cliente, o segundo transforma cada relatório
compartilhado em divulgação para anunciantes. Desenhe as duas versões se
achar que vale, ou me pergunte antes de escolher.
