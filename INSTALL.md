# Instalacao — Monitor de lives v0.1

Guia completo, do zero ate o primeiro relatorio rodando. Tempo estimado:
10 minutos, sendo que metade e esperar o Google Cloud responder.

---

## Antes de tudo: por que quase nao ha o que instalar

O coletor foi escrito usando **somente a biblioteca padrao do Python**.
Nada de `requests`, nada de `google-api-python-client`, nada de `pandas`.
A API do YouTube e REST simples, e `urllib` da conta; o banco e SQLite, que
ja vem no Python; a analise da camada 0 usa `statistics` e `json`.

Isso e uma decisao de projeto, nao uma limitacao:

- instalar em outra maquina nao depende de compilar nada nem de resolver
  conflito de versao
- o custo em unidades de cota de cada chamada fica visivel no proprio
  codigo, em vez de escondido dentro de uma camada de cliente
- o projeto continua rodando daqui a dois anos sem ninguem mexer

Por isso o `requirements.txt` esta praticamente vazio. Ele existe para
deixar isso explicito e para ser o lugar onde uma dependencia futura entra.

O `pip install` continua valendo a pena por outro motivo: ele registra os
**comandos de linha** do projeto, entao voce passa a escrever
`lives-coletar` em vez de `python collector/collector.py`.

---

## Passo 1 — Confirmar o Python

E preciso Python **3.9 ou superior**. Abra o terminal na pasta do projeto.

**Windows** (PowerShell ou Prompt de Comando):

```powershell
py --version
```

**macOS ou Linux**:

```bash
python3 --version
```

Se o comando nao existir, instale em https://www.python.org/downloads/.
No Windows, marque a caixa **"Add Python to PATH"** na primeira tela do
instalador. Pular isso e a causa mais comum de `python nao e reconhecido`
depois.

---

## Passo 2 — Criar o ambiente virtual

O ambiente virtual isola este projeto do resto do seu Python. Sem ele,
qualquer pacote que voce instalar aqui vale para a maquina inteira.

**Windows** (PowerShell). Os dois comandos sao necessarios, o segundo
so funciona depois do primeiro:

```powershell
cd C:\Users\erikn\Desktop\Pastas\Lives_YTB
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Repare no `.\` na frente. Sem ele o PowerShell acha que voce esta chamando
um modulo e responde `Nao foi possivel carregar o modulo '.venv'`, que
parece erro de venv quebrado e nao e.

Se aparecer erro de politica de execucao, rode isto antes e tente de novo.
Vale so para a janela aberta, nao muda configuracao da maquina:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

**macOS ou Linux**:

```bash
cd caminho/para/Lives_YTB
python3 -m venv .venv
source .venv/bin/activate
```

Deu certo quando aparece `(.venv)` no comeco da linha do terminal.

Toda vez que abrir um terminal novo para mexer no projeto, ative de novo.
E so a linha do `activate`, nao precisa recriar o ambiente.

---

## Passo 3 — Atualizar o pip e o setuptools

Este passo parece dispensavel e nao e. O `setuptools` que vem junto com
alguns Pythons e antigo demais para ler o formato moderno do
`pyproject.toml`, e a instalacao passa **sem erro nenhum** produzindo um
pacote chamado `UNKNOWN-0.0.0`, sem comando nenhum registrado.

```
python -m pip install --upgrade pip setuptools wheel
```

Precisa de `setuptools` 61 ou mais novo. Confira com:

```
pip show setuptools
```

---

## Passo 4 — Instalar o projeto

```
pip install -e .
```

O `-e` significa **editavel**: o pip aponta para esta pasta em vez de
copiar o codigo para dentro do ambiente. Toda alteracao que voce fizer nos
arquivos vale na hora, sem reinstalar. E o modo certo para um projeto em
desenvolvimento.

Deu certo quando a ultima linha diz:

```
Successfully installed lives-monitor-0.1.0
```

Se disser `lives-monitor-0.0.0` ou `UNKNOWN`, volte ao passo 3.

### Extras opcionais

Nenhum e necessario agora. Instale so quando a etapa chegar:

```
pip install -e ".[dashboard]"   # streamlit, pandas, plotly — quando for construir o painel
pip install -e ".[llm]"         # cliente de LLM — quando a camada 1 entrar
pip install -e ".[dev]"         # pytest e ruff — para testes e lint
```

---

## Passo 5 — Verificar sem gastar cota

Antes de configurar chave nenhuma, prove que o pipeline inteiro funciona
usando a live sintetica:

```
lives-demo
lives-report --video DEMO_SINTETICO
```

Deve aparecer algo como `171 janelas agregadas | 9 momentos | 55 mensagens
marcadas como spam` e o caminho de um relatorio em `reports/`. Abra esse
arquivo: e exatamente o formato que sairia de uma live de verdade.

O dado do `lives-demo` e **inventado**. Serve para validar o codigo, nunca
para mostrar a cliente.

---

## Passo 6 — Configurar a chave da API

1. Copie `.env.example` para `.env`.
2. Acesse https://console.cloud.google.com e crie um projeto
   (sugestao: `lives-monitor`).
3. **APIs e servicos > Biblioteca**, busque **YouTube Data API v3**,
   clique em **Ativar**.
4. **APIs e servicos > Credenciais > Criar credenciais > Chave de API**.
5. Cole a chave no `.env`, na linha `YT_API_KEY=`.
6. Recomendado: em **Restringir chave**, limite a YouTube Data API v3.

A cota gratuita e de 10.000 unidades por dia e nao pede cartao. Acompanhe o
consumo em **APIs e servicos > YouTube Data API v3 > Cotas**.

### Sobre o PID_SALT

Na primeira execucao o coletor gera sozinho uma linha `PID_SALT=` no `.env`.
Esse valor e o que transforma o canal de cada autor no pseudonimo
`autor_pid`. **Nao apague e nao troque**: se ele mudar, todo autor vira uma
pessoa nova e o historico de participacao se perde. Ele tambem nunca deve
ir para um repositorio publico, por isso o `.gitignore` ja exclui o `.env`.

---

## Passo 7 — Primeira coleta real

Comece por um teste curto, para medir cota antes de comprometer o dia:

```
lives-coletar --video VIDEO_ID --minutos 20
lives-quota --dias 1
```

Compare o numero do `lives-quota` com o painel do Google Cloud. Os dois
precisam bater. E essa comparacao que transforma a arquitetura v0.1 de
hipotese em fato medido.

Depois disso:

```
lives-coletar --video VIDEO_ID          # live inteira
lives-coletar --canal @cazetvoficial    # espera a live comecar sozinho
lives-report  --video VIDEO_ID          # relatorio
```

`Ctrl+C` encerra com seguranca: o banco fecha, a cobertura e calculada e o
relatorio fica disponivel.

---

## Comandos registrados pelo pip

| comando | equivalente sem instalar | o que faz |
|---|---|---|
| `lives-coletar` | `python collector/collector.py` | coleta chat e audiencia de uma live |
| `lives-report` | `python collector/report.py` | camada 0 de analise e relatorio |
| `lives-quota` | `python collector/quota.py` | auditoria de consumo de cota |
| `lives-demo` | `python collector/seed_demo.py` | gera live sintetica de teste |

Os tres modos funcionam e produzem exatamente o mesmo resultado:

```
lives-coletar --video X              # com o venv ativo
python -m collector.collector --video X   # instalado, sem PATH
python collector/collector.py --video X   # sem instalar nada
```

O `pip install` e conveniencia, nao requisito. Se o ambiente estiver
atrapalhando na hora que uma live estiver no ar, use a terceira forma e
resolva o ambiente depois: o chat ao vivo nao espera.

---

## Onde cada coisa fica

```
Lives_YTB/
  .env                  chave da API e PID_SALT   (nunca versionar)
  .env.example          modelo do arquivo acima
  pyproject.toml        metadados e comandos do pacote
  requirements.txt      ponteiro para o pip install -e .
  README.md             uso e decisoes de projeto
  INSTALL.md            este arquivo
  collector/            codigo
  db/schema.sql         schema v0.1
  data/lives.db         banco, criado na primeira execucao
  reports/              relatorios gerados
  docs/                 arquitetura e posicionamento
```

`data/` e `reports/` sao criados sozinhos. Nao precisa fazer nada.

---

## Problemas comuns

**`python nao e reconhecido como comando` (Windows)**  
O Python nao entrou no PATH. Reinstale marcando "Add Python to PATH", ou
use `py` no lugar de `python`.

**A instalacao termina em `UNKNOWN-0.0.0` e nenhum comando `lives-` existe**  
`setuptools` antigo demais. Rode
`python -m pip install --upgrade pip setuptools wheel` e instale de novo.

**`lives-coletar nao e reconhecido` depois de instalar com sucesso**  
Quase sempre significa que o `pip install` rodou **fora** do ambiente
virtual. O sinal esta na propria saida do pip:

```
Defaulting to user installation because normal site-packages is not writeable
WARNING: The scripts lives-coletar.exe ... are installed in
'C:\Users\...\AppData\Roaming\Python\Python314\Scripts'
which is not on PATH.
```

Nesse caso os comandos existem, so nao estao no PATH. Tres saidas, da mais
rapida para a mais definitiva:

1. Chamar o modulo, que funciona de qualquer pasta e sem PATH:
   `python -m collector.collector --video VIDEO_ID --minutos 20`
2. Chamar o arquivo direto, de dentro da pasta do projeto:
   `python collector\collector.py --video VIDEO_ID --minutos 20`
3. Criar o ambiente virtual (passo 2), ativar e reinstalar com
   `pip install -e .`. Dentro do venv os comandos entram no PATH sozinhos.

Se o venv existe mas os comandos sumiram, ele so nao esta ativo: rode
`.\.venv\Scripts\Activate.ps1` (Windows) ou `source .venv/bin/activate`.
Confirme pelo `(.venv)` no comeco da linha.

**`YT_API_KEY nao configurada`**  
Falta o arquivo `.env` na raiz do projeto, ou a chave nao foi colada nele.
Confira que o arquivo se chama `.env` mesmo, nao `.env.txt`: o Windows
esconde extensoes por padrao.

**`ATENCAO: essa live ja acabou`**  
Nao ha o que fazer. O chat ao vivo deixa de existir quando a transmissao
termina, e a API nao devolve as mensagens depois. A coleta precisa estar
rodando durante a live.

**A coleta para com erro de cota (HTTP 403)**  
As 10.000 unidades do dia acabaram. A cota reseta a meia-noite no horario
do Pacifico. Rode `lives-quota` para ver onde foram gastas e considere
aumentar a janela em `collector/config.py`.

**Erro de conexao no meio da coleta**  
O `yt.py` ja tenta de novo tres vezes com espera crescente. Quedas curtas
se resolvem sozinhas e aparecem em `cobertura_pct` no fim, que e
exatamente o proposito dessa metrica.
