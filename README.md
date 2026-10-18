# Monitor de lives — coletor v0.1

Coleta chat, doacoes e curva de audiencia de uma live do YouTube enquanto
ela esta no ar, e gera um relatorio da live sem nenhuma chamada de LLM.

O chat ao vivo **deixa de existir quando a live acaba**. A API nao devolve as
mensagens depois. Por isso o coletor precisa estar rodando durante a transmissao.

## v2: plataforma Vigia

Interface web sobre o mesmo banco. Plano e decisoes em
[docs/plano_v2.md](docs/plano_v2.md); design em `design_handoff_vigia_pesquisa/`.

```
pip install -e ".[api]"          # FastAPI + uvicorn, so para a API
lives-api                        # API em http://127.0.0.1:8000 (docs em /api/docs)
lives-vigia                      # vigia: le agendas e sobe um coletor por live no ar
cd web && npm install && npm run dev   # front em http://localhost:5173
```

Sao tres processos. Sem o `lives-vigia` rodando nada e coletado, e a
interface diz isso ("vigia parado") em vez de fingir que esta de pe.
O botao "vigia parado · ligar" no cabecalho sobe o vigia pela propria
interface (saida em `data/vigia.log`) e, rodando, desliga: o pedido vai
pelo banco e o vigia sai em segundos. Coletas em andamento seguem ate o
fim da live.
O login e de demonstracao: qualquer e-mail valido e senha com 6 ou mais
caracteres entra. Com `npm run build`, a propria API passa a servir o front.

Relatorio publico: depois de gerar o dossie de uma transmissao, "Publicar
link" cria `/r/{canal}/{nome-da-live-data}`, que abre sem login e so le
agregados (sem cota, custo, texto de chat ou autor).

## Instalacao

Passo a passo completo em **[INSTALL.md](INSTALL.md)**. Versao curta:

```
py -m venv .venv && .venv\Scripts\activate      # Windows
python -m pip install --upgrade pip setuptools
pip install -e .
copie .env.example para .env e cole sua chave em YT_API_KEY
```

Nao ha dependencia externa: o coletor usa so a biblioteca padrao do
Python 3.9 ou superior. O `pip install -e .` serve para registrar os
comandos `lives-coletar`, `lives-report`, `lives-quota` e `lives-demo`.
Rodar `python collector/collector.py` direto tambem funciona.

### Como gerar a chave da API (uma vez, gratuito)

1. Acesse https://console.cloud.google.com e crie um projeto
   (sugestao de nome: `lives-monitor`).
2. Menu **APIs e servicos > Biblioteca**, busque **YouTube Data API v3**
   e clique em **Ativar**.
3. Menu **APIs e servicos > Credenciais > Criar credenciais > Chave de API**.
4. Copie a chave e cole no `.env` em `YT_API_KEY=`.
5. Opcional mas recomendado: em **Restringir chave**, limite a chave a
   YouTube Data API v3.

A cota gratuita e de 10.000 unidades por dia e nao exige cartao.
Acompanhe o consumo em **APIs e servicos > YouTube Data API v3 > Cotas**.

## Uso

```bash
# coletar uma live que ja esta no ar
python collector/collector.py --video VIDEO_ID

# vigiar um canal e comecar sozinho quando a live subir
python collector/collector.py --canal @cazetvoficial

# teste curto, para medir cota antes de comprometer o dia inteiro
python collector/collector.py --video VIDEO_ID --minutos 20

# relatorio da live coletada
python collector/report.py --video VIDEO_ID

# auditoria de consumo de cota
python collector/quota.py --dias 7

# testar o pipeline inteiro sem chave e sem live, com dado sintetico
python collector/seed_demo.py && python collector/report.py --video DEMO_SINTETICO
```

Ctrl+C encerra a coleta com seguranca: o banco e fechado, a cobertura e
calculada e o relatorio fica disponivel.

## Arquivos

| arquivo | papel |
|---|---|
| `collector/config.py` | parametros de coleta e leitura do `.env` |
| `collector/db.py` | banco, pseudonimizacao e expurgo de dado pessoal |
| `collector/yt.py` | cliente da API, com custo de cada chamada registrado |
| `collector/collector.py` | loop de coleta: chat, audiencia, cobertura |
| `collector/report.py` | camada 0 de analise e relatorio da live |
| `collector/quota.py` | auditoria de consumo de cota |
| `collector/seed_demo.py` | live sintetica para testar sem gastar cota |
| `db/schema.sql` | schema v0.1 |
| `data/lives.db` | banco (criado na primeira execucao) |
| `reports/` | relatorios gerados |

## Decisoes que estao embutidas no codigo

**Janela adaptativa de 20 s.** `liveChatMessages.list` custa 5 unidades. A
cada 5 s, uma live de 3 h consome 10.800 unidades e estoura a cota sozinha.
A 20 s, cerca de 2.700 unidades, ou 27% da cota. Espacar o polling **nao
perde mensagem**: o `nextPageToken` devolve tudo desde a ultima chamada.
Espacar troca latencia por cota, nao completude por cota. A janela encurta
sozinha quando a pagina volta saturada e alarga quando volta vazia.

**RSS em vez de search.list.** Desde junho de 2026 o `search.list` tem bucket
proprio de cerca de 100 chamadas por dia. Descobrir que a live comecou por
ali e caro demais. O feed publico do canal nao consome cota nenhuma, e a
confirmacao com `videos.list` custa 1 unidade.

**Dado pessoal so em `autor_identidade`.** Todo o resto do banco referencia
`autor_pid = sha256(canal_do_autor + salt)`. Apagar a tabela de identidades
anonimiza a base inteira sem quebrar analise nenhuma, e atender um pedido de
titular vira apagar uma linha. O expurgo por vencimento roda sozinho a cada
execucao do coletor.

**Dinheiro em micros inteiros**, exatamente como a API devolve. Nunca float.

**`cobertura_pct` e metrica de primeira classe.** Sem ela nao da para saber
se um vale no grafico foi silencio do publico ou coletor caido. O relatorio
mostra esse numero no topo, antes de qualquer outro.

**Analise escalonada.** A camada 0 (contagem, emoji, dedup, heuristica de
spam, deteccao de pico por z-score) elimina uma fatia do volume e ja produz
o relatorio inteiro com custo zero. O LLM entra depois, so para rotular o
que a estatistica ja apontou.

## O que ainda precisa ser medido numa live real

1. Consumo real de cota contra os 2.700 previstos, no painel do Google Cloud
   e no `quota.py`. Os dois numeros precisam bater.
2. Custo do `liveChatMessages.streamList`. Metodo novo, conexao persistente,
   custo nao documentado. Se for cobrado por conexao e nao por chamada, o
   gargalo de cota some.
3. Comportamento da janela adaptativa num chat de verdade: com que frequencia
   ela encosta no piso de 5 s.
