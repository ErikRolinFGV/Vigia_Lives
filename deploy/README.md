# Levar o Vigia para um servidor

Hoje o Vigia roda no PC: se ele dorme, desliga ou perde a internet, a
coleta para. No servidor, o mesmo código roda sempre ligado, como serviço
do sistema, e o PC passa a ser só um jeito de abrir a interface.

Este guia é para um servidor **Linux com systemd** (Ubuntu, Debian e
parecidos). Nada aqui muda como o Vigia roda no PC.

## O que roda no servidor

| serviço | o que faz | se cair |
|---|---|---|
| `vigia-api` | API e interface, em `127.0.0.1:8000` | volta sozinho em 5 s |
| `vigia` | lê a agenda dos canais e sobe um coletor por live no ar | volta sozinho em 30 s; desligado pela interface, fica desligado |
| `vigia-backup.timer` | cópia diária do banco às 4h30, mantém 14 dias | — |
| nginx | recebe o acesso de fora, HTTPS (o login é da interface) | — |

Os coletores são filhos do vigia. Reiniciar o vigia ou a API não derruba
uma coleta em andamento, como no PC.

## O que o servidor precisa ter

- Linux com systemd e acesso por SSH, com permissão para instalar pacotes
- Python 3.11 ou mais, com `venv` (`sudo apt install python3 python3-venv`)
- Node 18 ou mais, só para construir a interface (`sudo apt install nodejs npm`)
- git e nginx
- Ligado o tempo todo, com o relógio certo (NTP)
- Uns 2 GB livres de disco. O banco tem 32 MB hoje e cresce perto de 10 MB
  por live movimentada.

## Passo a passo

### 1. Código e segredos

```bash
git clone https://github.com/ErikRolinFGV/Vigia_Lives.git ~/Vigia_Lives
cd ~/Vigia_Lives
```

Copie o `.env` do PC para `~/Vigia_Lives/.env` (por `scp`, nunca pelo
GitHub). Ele tem a chave da API do YouTube e o `PID_SALT`.

> **O `PID_SALT` precisa ser o mesmo do PC.** Ele define o pseudônimo de
> quem escreve no chat. Com outro salt, cada pessoa do histórico vira uma
> pessoa nova. Se o `.env` chegar sem ele e o banco já tiver autores, o
> Vigia se recusa a subir e avisa.

### 2. Instalar

```bash
bash deploy/instalar.sh
sudo loginctl enable-linger $USER   # serviços sobem no boot, sem ninguém logado
```

O script cria o ambiente Python, constrói a interface, instala os serviços
e liga a API e o backup. **O vigia não é ligado**: isso fica para a troca.
Sem conta, ninguém entra na interface: a sua conta de admin está no passo 6.

### 3. Ensaio, com o vigia ainda no PC

```bash
.venv/bin/python -m collector.checar
```

Confere Python, `.env`, banco, disco, relógio, a chave da API (1 unidade)
e, principalmente, **se o YouTube entrega a página dos canais a partir do
IP do servidor**. A agenda depende dessa página. Alguns datacenters
recebem uma tela de consentimento ou um bloqueio em vez dela. Se essa
conferência falhar, pare aqui e converse antes de seguir.

### 4. A troca do PC para o servidor

Num horário sem live marcada:

1. **No PC:** desligue o vigia pela interface e espere as coletas em
   andamento terminarem. O cabeçalho mostra "coletando 0 lives".
2. **No PC:** copie o banco com segurança:
   ```
   .venv\Scripts\python -m collector.backup --para lives-servidor.db
   ```
3. Envie para o servidor:
   ```
   scp lives-servidor.db usuario@servidor:~/Vigia_Lives/data/lives.db
   ```
4. **No servidor:** confira e ligue:
   ```bash
   .venv/bin/python -m collector.checar
   systemctl --user start vigia
   tail -f data/vigia.log
   ```
5. A partir daqui, **não ligue mais o vigia do PC.** Dois vigias com a
   mesma chave coletam tudo em dobro e gastam a cota em dobro.

### 5. Acesso de fora: nginx e HTTPS

Quem protege os dados é o login da própria interface (`api/acessos.py`):
toda rota da API pede uma conta. O nginx só recebe o acesso de fora e
cuida do HTTPS.

```bash
sudo cp deploy/nginx/vigia.conf /etc/nginx/sites-available/vigia
sudo nano /etc/nginx/sites-available/vigia        # troque vigia.exemplo.br
sudo ln -s /etc/nginx/sites-available/vigia /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d vigia.exemplo.br           # HTTPS, se houver domínio
```

> **Use HTTPS quando o acesso for de fora.** Sem ele, a senha e o cookie
> da sessão passam pela rede sem criptografia.

### 6. As contas

Contas são criadas no servidor, pela linha de comando. Não há cadastro
nem "esqueci a senha" pela tela.

```bash
.venv/bin/python -m api.acessos criar erik --admin --escolher   # a sua: você digita a senha
.venv/bin/python -m api.acessos criar cazetv --dias 3           # visitante: a senha é gerada e mostrada uma vez
.venv/bin/python -m api.acessos compartilhar cazetv @cazetv     # um canal seu, com o histórico, no espaço dele
.venv/bin/python -m api.acessos listar                          # contas, e o que cada visitante vigia e recebeu
.venv/bin/python -m api.acessos revogar cazetv                  # derruba na hora
```

Cada visitante usa o app de verdade, num **espaço próprio**: os canais
que ele adiciona, as lives que ele cola pelo link e os canais que você
compartilhar com ele. O admin vê tudo. As regras ficam em `api/escopo.py`
e valem na API, não só nos botões.

| | admin | visitante |
|---|---|---|
| vê | tudo | o espaço dele |
| adiciona canais, coleta pelo link | sim | sim, até 3 canais próprios |
| marca lives, encerra coleta, descarta, publica, exporta | sim | em toda live que vê |
| modo de coleta, foto, parar de vigiar | sim | só nos canais que ele adicionou |
| liga/desliga o vigia, Registro do sistema, contas | sim | não |

Um visitante não consegue adicionar um canal que já tem dados de outra
conta: a tela pede para ele falar com o admin, que decide se compartilha.
A cota do YouTube é uma só para todas as contas: o visitante vê o total
previsto do dia, mas não o título das coletas dos outros.

Para uma apresentação: crie o visitante na véspera com `--dias 2`,
compartilhe os canais que fazem sentido mostrar, mande o link e o usuário
por um canal e a senha por outro, e revogue depois. Os canais que o
visitante adicionou continuam vigiados depois de revogar: o `listar`
mostra quais são, e você os para pela interface.
`python -m api.acessos senha cazetv` gera outra senha e encerra as sessões
abertas.

O `.env` ganha sozinho um `SESSAO_SEGREDO` na primeira vez que alguém
entra: é o que assina o cookie da sessão. Trocar esse valor só obriga todo
mundo a entrar de novo (diferente do `PID_SALT`, que não pode mudar).

O link público de relatório (`/r/...`) continua abrindo sem login, como
deve: ele só mostra números agregados.

Sem domínio nem acesso de fora, dá para usar só por túnel SSH, sem nginx:
`ssh -L 8000:127.0.0.1:8000 usuario@servidor` e abrir
`http://localhost:8000` no PC.

## Dia a dia

| para | comando |
|---|---|
| ver se está tudo de pé | `systemctl --user status vigia vigia-api` |
| acompanhar o vigia e as coletas | `tail -f data/vigia.log` |
| log da API | `journalctl --user -u vigia-api -f` |
| atualizar o código | `git pull && bash deploy/instalar.sh`, depois `systemctl --user restart vigia-api` |
| carregar código novo no vigia | `systemctl --user restart vigia`: os coletores em andamento seguem com o código antigo até a live acabar |
| cópia do banco agora | `.venv/bin/python -m collector.backup` |
| backups | `ls data/backups/` |
| contas | `.venv/bin/python -m api.acessos listar` (e `criar`, `senha`, `revogar`) |

## Erros e avisos: onde ver

Você não precisa entrar na máquina para saber se algo deu errado:

- **Na interface:** **Minha conta → Registro do sistema** (só o admin vê).
  Lá ficam os avisos e erros do vigia, de cada coletor e da API, com a
  live envolvida e o detalhe técnico (traceback). O mesmo erro repetido em
  poucos minutos vira uma linha só, com a contagem. Ficam 60 dias.
- **No cabeçalho:** aparece **"erro novo"** quando houve erro depois da
  última vez que você abriu o Registro.

O que vai para o Registro:

| origem | exemplos |
|---|---|
| vigia | agenda de um canal que não leu, ciclo que falhou, cota esgotada, coletor que caiu no meio da live |
| coletor | chat que parou de responder, rede fora, cota esgotada, processo que caiu |
| API | qualquer erro não previsto numa tela (a tela mostra uma mensagem amigável), vigia que não subiu pelo botão |

O histórico fino, linha a linha, continua em texto:

| para | comando |
|---|---|
| o vigia e os coletores (cada linha diz de qual live é) | `tail -f data/vigia.log` |
| a API | `journalctl --user -u vigia-api -f` |

O `data/vigia.log` gira toda semana (8 semanas guardadas) depois do
passo 4 da lista que o `instalar.sh` mostra no fim.

**O limite:** o Registro só mostra o que o Vigia conseguiu anotar. Se a
máquina inteira cair, não há quem anote. Para isso, o próximo passo é um
monitor de fora, que avisa por e-mail quando o endereço para de responder.

## Voltar para o PC

Desligue o vigia do servidor (`systemctl --user stop vigia`), copie o
banco de volta com `collector.backup` + `scp` e ligue o vigia do PC pela
interface. O caminho é o mesmo da troca, ao contrário.

## Privacidade

O banco guarda o nome e o canal de quem escreve no chat por 90 dias
(tabela `autor_identidade`, apagada sozinha depois disso). Num servidor de
terceiros, combine com o responsável quem tem acesso à máquina e às cópias
em `data/backups/`. Nunca coloque `.env`, `data/` ou backups no GitHub: o
repositório é público.

## O que ainda falta para abrir para clientes

- Cadastro de contas e compartilhamento pela tela (hoje: linha de comando)
- Troca de senha e recuperação por e-mail pela tela (hoje: linha de comando)
- Banco Postgres, se houver vários clientes ou muito volume (SQLite aguenta
  bem o volume de hoje)
- Aviso por e-mail: quando surgir um erro no Registro, e um monitor de fora
  para quando a máquina inteira cair (hoje os erros ficam na página
  Registro do sistema, e é preciso abrir para ver)
