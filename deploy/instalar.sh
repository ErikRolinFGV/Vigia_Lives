#!/usr/bin/env bash
# Instala o Vigia num servidor Linux, como servicos do usuario (sem sudo,
# a nao ser o "loginctl enable-linger" do fim). Rode da raiz do projeto:
#
#     bash deploy/instalar.sh
#
# Pode rodar de novo depois de um git pull: refaz o ambiente e a interface
# e reinstala os servicos. NAO liga o vigia: a troca do PC para o servidor
# e manual (deploy/README.md, "A troca"), para nunca haver dois vigias.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
PY="${PYTHON:-python3}"

passo() { printf '\n== %s\n' "$*"; }
falha() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

passo "conferindo o que o servidor precisa ter"
command -v "$PY" >/dev/null || falha "$PY nao encontrado (precisa de Python 3.11 ou mais)"
"$PY" -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
  || falha "Python 3.11 ou mais e necessario; este e $("$PY" --version)"
"$PY" -c 'import venv, sqlite3' 2>/dev/null || falha "falta o modulo venv (no Debian/Ubuntu: sudo apt install python3-venv)"
command -v npm >/dev/null || falha "npm nao encontrado (Node 18 ou mais, so para construir a interface)"
command -v systemctl >/dev/null || falha "systemctl nao encontrado: este script e para servidores com systemd"
[ -f .env ] || falha ".env nao existe em $RAIZ. Copie o .env do PC (com o MESMO PID_SALT) antes de instalar"

passo "ambiente Python (.venv) e dependencias da API"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -e ".[api]"

passo "interface (web/dist)"
(cd web && npm ci --silent && npm run build --silent)

passo "configuracao do servidor no .env"
# o botao "ligar vigia" da interface liga o servico, em vez de um processo solto
grep -q '^VIGIA_LIGAR_CMD=' .env || printf '\nVIGIA_LIGAR_CMD=systemctl --user start vigia\n' >> .env
mkdir -p data

passo "servicos (systemctl --user)"
DESTINO="$HOME/.config/systemd/user"
mkdir -p "$DESTINO"
for u in vigia.service vigia-api.service vigia-backup.service vigia-backup.timer; do
  sed "s#@RAIZ@#$RAIZ#g" "deploy/systemd/$u" > "$DESTINO/$u"
done
systemctl --user daemon-reload
systemctl --user enable --now vigia-api.service vigia-backup.timer
# o vigia fica habilitado para subir no boot, mas nao e ligado agora
systemctl --user enable vigia.service

passo "conferencia final"
.venv/bin/python -m collector.checar --sem-cota || true

cat <<FIM

Instalado. A API esta em http://127.0.0.1:8000 (systemctl --user status vigia-api).

Falta, uma vez so:
  1. Servicos no boot sem login: sudo loginctl enable-linger $USER
  2. nginx com senha na frente da API: deploy/nginx/vigia.conf
  3. Ligar o vigia SO depois de desligar o do PC (deploy/README.md, "A troca"):
       systemctl --user start vigia
FIM
