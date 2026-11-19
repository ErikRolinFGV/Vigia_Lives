"""
Contas da interface: quem entra e o que pode fazer.

Dois papeis. O admin ve e faz tudo. O visitante usa o app de verdade num
espaco proprio (os canais que ele adiciona, as lives que ele cola pelo link)
mais os canais que o admin compartilhar com ele; vigia, Registro e contas
sao so do admin. As regras estao em api/escopo.py e valem na API, nao so
nos botoes.

Contas sao criadas pela linha de comando, nunca pela interface:

    python -m api.acessos criar erik --admin --escolher   # voce escolhe a senha
    python -m api.acessos criar cazetv --dias 3           # visitante, senha gerada
    python -m api.acessos compartilhar cazetv @cazetv     # canal seu, com historico
    python -m api.acessos descompartilhar cazetv @cazetv
    python -m api.acessos listar
    python -m api.acessos senha cazetv                    # gera outra senha
    python -m api.acessos revogar cazetv                  # derruba na hora

A senha e mostrada uma vez, na criacao, e guardada so como hash PBKDF2. A
sessao e um cookie assinado com SESSAO_SEGREDO (gerado uma vez no .env, como
o PID_SALT, mas sem o mesmo cuidado: trocar o segredo so obriga todo mundo a
entrar de novo).
"""
import argparse
import base64
import getpass
import hashlib
import hmac
import os
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone

from collector import config, db, yt

PAPEIS = ("admin", "visitante")
COOKIE = "vigia_sessao"
SESSAO_MAX = timedelta(hours=12)
ITERACOES = 400_000
USUARIO_OK = re.compile(r"^[a-z0-9][a-z0-9._@-]{1,63}$")


# ---------------------------------------------------------------- senha

def hash_senha(senha):
    sal = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), sal, ITERACOES)
    return f"pbkdf2_sha256${ITERACOES}${sal.hex()}${h.hex()}"


def confere_senha(senha, guardado):
    try:
        _, it, sal, h = guardado.split("$")
        novo = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(sal), int(it))
    except ValueError:
        return False
    return hmac.compare_digest(novo.hex(), h)


def gerar_senha():
    """Facil de ditar numa reuniao: xxxx-xxxx-xxxx, sem 0/o, 1/l/i."""
    letras = "abcdefghjkmnpqrstuvwxyz23456789"
    return "-".join("".join(secrets.choice(letras) for _ in range(4)) for _ in range(3))


# ---------------------------------------------------------------- sessao

def _segredo():
    s = os.environ.get("SESSAO_SEGREDO")
    if s:
        return s
    s = secrets.token_hex(32)
    with open(config.CAMINHO_ENV, "a", encoding="utf-8") as f:
        f.write(f"\nSESSAO_SEGREDO={s}\n")
    os.environ["SESSAO_SEGREDO"] = s
    return s


def _assinar(carga, senha_hash):
    # o hash da senha entra na assinatura: gerar outra senha (ou recriar a
    # conta com o mesmo nome) invalida os cookies que ja estavam por ai
    return hmac.new(_segredo().encode(), f"{carga}|{senha_hash}".encode(), hashlib.sha256).hexdigest()


def _b64(s):
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip("=")


def _de_b64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode()


def emitir(conta):
    """Cookie de sessao para a conta: (valor, segundos de validade)."""
    fim = datetime.now(timezone.utc) + SESSAO_MAX
    exp = yt.parse_ts(conta["expira_em"])
    if exp and exp < fim:
        fim = exp
    carga = f"{conta['usuario']}|{int(fim.timestamp())}"
    return f"{_b64(carga)}.{_assinar(carga, conta['senha_hash'])}", max(0, int(fim.timestamp() - time.time()))


def valida(con, token):
    """A conta dona do cookie, se ele for valido e a conta ainda valer. Senao None."""
    try:
        b, assinatura = (token or "").split(".")
        usuario, fim = _de_b64(b).split("|")
    except ValueError:
        return None
    if int(fim) < time.time():
        return None
    c = conta(con, usuario)
    if not c or not hmac.compare_digest(_assinar(f"{usuario}|{fim}", c["senha_hash"]), assinatura):
        return None
    return c if situacao(c) == "ativo" else None


# ---------------------------------------------------------------- contas

def conta(con, usuario):
    r = con.execute("SELECT * FROM acesso WHERE usuario = ?", ((usuario or "").strip().lower(),)).fetchone()
    return dict(r) if r else None


def situacao(c):
    if c["revogado_em"]:
        return "revogado"
    exp = yt.parse_ts(c["expira_em"])
    if exp and exp <= datetime.now(timezone.utc):
        return "expirado"
    return "ativo"


def publica(c):
    """O que a interface pode saber da conta (nunca o hash)."""
    return {"usuario": c["usuario"], "papel": c["papel"], "expira_em": c["expira_em"]}


def criar(con, usuario, papel, senha, validade=None):
    usuario = usuario.strip().lower()
    if not USUARIO_OK.match(usuario):
        raise ValueError("usuário inválido: use letras minúsculas, números, ponto, hífen ou @ (2 a 64 caracteres)")
    if papel not in PAPEIS:
        raise ValueError(f"papel inválido: {papel}")
    velha = conta(con, usuario)
    if velha and situacao(velha) == "ativo":
        raise ValueError(f"'{usuario}' já existe e está ativo. Para outra senha: python -m api.acessos senha {usuario}")
    expira = (datetime.now(timezone.utc) + validade).isoformat(timespec="seconds") if validade else None
    con.execute("DELETE FROM acesso WHERE usuario = ?", (usuario,))
    con.execute("INSERT INTO acesso (usuario, senha_hash, papel, criado_em, expira_em) VALUES (?, ?, ?, ?, ?)",
                (usuario, hash_senha(senha), papel, db.agora(), expira))
    con.commit()
    return conta(con, usuario)


def trocar_senha(con, usuario, senha):
    if not conta(con, usuario):
        raise ValueError(f"'{usuario}' não existe")
    con.execute("UPDATE acesso SET senha_hash = ? WHERE usuario = ?", (hash_senha(senha), usuario.strip().lower()))
    con.commit()


def revogar(con, usuario):
    if not conta(con, usuario):
        raise ValueError(f"'{usuario}' não existe")
    con.execute("UPDATE acesso SET revogado_em = ? WHERE usuario = ? AND revogado_em IS NULL",
                (db.agora(), usuario.strip().lower()))
    con.commit()


# ---------------------------------------------------------------- tentativas

# erros de senha por IP, so em memoria: 5 seguidos travam o IP por 1 min
_falhas: dict[str, tuple[int, float]] = {}
FALHAS_MAX, ESPERA = 5, 60


def travado(ip):
    n, quando = _falhas.get(ip, (0, 0.0))
    return n >= FALHAS_MAX and time.time() - quando < ESPERA


def registrar_falha(ip):
    n, quando = _falhas.get(ip, (0, 0.0))
    if time.time() - quando >= ESPERA:
        n = 0
    _falhas[ip] = (n + 1, time.time())


def limpar_falhas(ip):
    _falhas.pop(ip, None)


# ---------------------------------------------------------------- compartilhar

def _canal(con, ref):
    """Canal ja conhecido pelo banco, pelo @handle ou pelo id UC... (sem gastar cota)."""
    ref = ref.strip()
    h = ref if ref.startswith("@") else "@" + ref
    r = con.execute("SELECT canal_id, nome FROM canal WHERE canal_id = ? OR lower(handle) = lower(?)",
                    (ref, h)).fetchone()
    if not r:
        raise ValueError(f"não conheço o canal {ref}: ele precisa ter sido vigiado ou colado por link antes")
    return r


def compartilhar(con, usuario, ref):
    c, u = _canal(con, ref), conta(con, usuario)
    if not u:
        raise ValueError(f"'{usuario}' não existe")
    if u["papel"] == "admin":
        raise ValueError(f"'{usuario}' é admin: já vê todos os canais")
    con.execute("INSERT OR IGNORE INTO canal_compartilhado (usuario, canal_id, em) VALUES (?, ?, ?)",
                (u["usuario"], c["canal_id"], db.agora()))
    con.commit()
    return c


def descompartilhar(con, usuario, ref):
    c = _canal(con, ref)
    con.execute("DELETE FROM canal_compartilhado WHERE usuario = ? AND canal_id = ?",
                (usuario.strip().lower(), c["canal_id"]))
    con.commit()
    return c


# ---------------------------------------------------------------- linha de comando

def _hora_local(iso):
    t = yt.parse_ts(iso)
    return t.astimezone(timezone(timedelta(hours=-3))).strftime("%d/%m/%Y %H:%M") if t else "sem prazo"


def _escolher_senha():
    s = getpass.getpass("senha (mínimo 10 caracteres): ")
    if len(s) < 10:
        sys.exit("senha curta demais")
    if getpass.getpass("de novo: ") != s:
        sys.exit("as duas não batem")
    return s


def main():
    p = argparse.ArgumentParser(prog="python -m api.acessos", description="Contas da interface do Vigia")
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("criar", help="cria uma conta (visitante, salvo --admin)")
    c.add_argument("usuario")
    c.add_argument("--admin", action="store_true", help="pode tudo (sem prazo, salvo --dias/--horas)")
    c.add_argument("--dias", type=float, help="validade em dias (visitante: 7 se nada for dito)")
    c.add_argument("--horas", type=float, help="validade em horas")
    c.add_argument("--escolher", action="store_true", help="digitar a senha em vez de gerar uma")
    sub.add_parser("listar", help="lista as contas")
    s = sub.add_parser("senha", help="gera (ou deixa escolher) outra senha; derruba as sessões abertas")
    s.add_argument("usuario")
    s.add_argument("--escolher", action="store_true")
    r = sub.add_parser("revogar", help="desativa a conta na hora")
    r.add_argument("usuario")
    for nome, ajuda in (("compartilhar", "deixa um visitante ver um canal seu (com o histórico) e usar as lives dele"),
                        ("descompartilhar", "tira o canal do espaço do visitante")):
        x = sub.add_parser(nome, help=ajuda)
        x.add_argument("usuario")
        x.add_argument("canal", help="@handle ou id UC... de um canal que o banco já conhece")
    a = p.parse_args()

    con = db.conectar()
    try:
        if a.cmd == "criar":
            papel = "admin" if a.admin else "visitante"
            validade = timedelta(days=a.dias or 0, hours=a.horas or 0) or (None if a.admin else timedelta(days=7))
            senha = _escolher_senha() if a.escolher else gerar_senha()
            nova = criar(con, a.usuario, papel, senha, validade)
            print(f"conta criada: {nova['usuario']} ({papel}), vale até {_hora_local(nova['expira_em'])}")
            if not a.escolher:
                print(f"senha: {senha}")
                print("guarde agora: ela não é mostrada de novo")
        elif a.cmd == "senha":
            senha = _escolher_senha() if a.escolher else gerar_senha()
            trocar_senha(con, a.usuario, senha)
            print(f"senha de {a.usuario} trocada; sessões abertas foram encerradas")
            if not a.escolher:
                print(f"senha: {senha}")
        elif a.cmd == "revogar":
            revogar(con, a.usuario)
            print(f"{a.usuario} revogado: não entra mais e as sessões abertas caem no próximo clique")
        elif a.cmd == "compartilhar":
            c = compartilhar(con, a.usuario, a.canal)
            print(f"{c['nome']} compartilhado com {a.usuario}: aparece no espaço dele no próximo clique")
        elif a.cmd == "descompartilhar":
            c = descompartilhar(con, a.usuario, a.canal)
            print(f"{c['nome']} saiu do espaço de {a.usuario}")
        elif a.cmd == "listar":
            linhas = [conta(con, u) for (u,) in con.execute("SELECT usuario FROM acesso ORDER BY criado_em")]
            if not linhas:
                print("nenhuma conta. Crie a sua: python -m api.acessos criar SEU_NOME --admin --escolher")
            for x in linhas:
                print(f"{x['usuario']:<24} {x['papel']:<10} {situacao(x):<9} até {_hora_local(x['expira_em'])}")
                if x["papel"] == "admin":
                    continue
                proprios = [r[0] for r in con.execute(
                    "SELECT nome FROM canal WHERE dono = ? AND vigiado = 1 AND removido_em IS NULL", (x["usuario"],))]
                comp = [r[0] for r in con.execute(
                    """SELECT c.nome FROM canal_compartilhado s JOIN canal c ON c.canal_id = s.canal_id
                       WHERE s.usuario = ? ORDER BY s.em""", (x["usuario"],))]
                if proprios:
                    print(f"{'':<24} vigia: {', '.join(proprios)}")
                if comp:
                    print(f"{'':<24} compartilhados: {', '.join(comp)}")
    except ValueError as e:
        sys.exit(str(e))
    finally:
        con.close()


if __name__ == "__main__":
    main()
