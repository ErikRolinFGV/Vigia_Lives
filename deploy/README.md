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
| nginx | recebe o acesso de fora, pede senha, HTTPS | — |

Os coletores são filhos do vigia. Reiniciar o vigia ou a API não derruba
uma coleta em andamento, como no PC.

## O que o servidor precisa ter

- Linux com systemd e acesso por SSH, com permissão para instalar pacotes
- Python 3.11 ou mais, com `venv` (`sudo apt install python3 python3-venv`)
- Node 18 ou mais, só para construir a interface (`sudo apt install nodejs npm`)
- git, nginx e `apache2-utils` (para criar a senha)
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

### 5. Acesso de fora: nginx com senha

O login da interface ainda é de demonstração (aceita qualquer e-mail). Até
existir login de verdade, quem protege os dados é a senha do nginx.

```bash
sudo cp deploy/nginx/vigia.conf /etc/nginx/sites-available/vigia
sudo nano /etc/nginx/sites-available/vigia        # troque vigia.exemplo.br
sudo ln -s /etc/nginx/sites-available/vigia /etc/nginx/sites-enabled/
sudo htpasswd -c /etc/nginx/vigia.htpasswd erik
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d vigia.exemplo.br           # HTTPS, se houver domínio
```

O link público de relatório (`/r/...`) continua abrindo sem senha, como
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

- Login de verdade, com contas e senhas, no lugar do login de demonstração
- Banco Postgres, se houver vários clientes ou muito volume (SQLite aguenta
  bem o volume de hoje)
- Monitoramento: um aviso por e-mail se o vigia ficar parado
