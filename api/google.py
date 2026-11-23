"""
Entrar com o Google (OpenID Connect, fluxo de codigo com PKCE).

So identifica a pessoa: os escopos sao openid, email e profile. Nao da acesso
a nenhum dado do YouTube; isso seria "conectar canal", outra autorizacao.
Quem entra e decidido pela Lively: o e-mail precisa estar ligado a uma conta
(python -m api.acessos email USUARIO EMAIL, ou criar ... --email EMAIL).

No .env:

    GOOGLE_CLIENT_ID=....apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=...
    URL_PUBLICA=https://lively.app.br   # opcional; sem ela, vem da requisicao

No Google Cloud, o URI de redirecionamento autorizado e URL_PUBLICA mais
/api/auth/google/retorno (em desenvolvimento,
http://localhost:8000/api/auth/google/retorno).

O ID token chega direto do endpoint de token do Google, por HTTPS e com o
nosso client secret: nesse caso a documentacao do Google dispensa conferir a
assinatura. Conferimos emissor, destinatario, validade, nonce e e-mail
verificado.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
EMISSORES = ("https://accounts.google.com", "accounts.google.com")
COOKIE = "lively_google"
CAMINHO_COOKIE = "/api/auth/google"
VALIDADE = 600  # segundos entre sair para o Google e voltar


def _cliente():
    return os.environ.get("GOOGLE_CLIENT_ID", "").strip()


def _segredo_cliente():
    return os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()


def configurado():
    return bool(_cliente() and _segredo_cliente())


def retorno(base):
    return base.rstrip("/") + "/api/auth/google/retorno"


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _assinar(texto, chave):
    return hmac.new(chave.encode(), texto.encode(), hashlib.sha256).hexdigest()


def iniciar(url_retorno, chave):
    """O endereco do Google e o cookie que amarra a volta a esta ida (state, nonce e PKCE)."""
    state, nonce, verificador = secrets.token_urlsafe(24), secrets.token_urlsafe(24), secrets.token_urlsafe(48)
    q = {
        "client_id": _cliente(),
        "redirect_uri": url_retorno,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": _b64(hashlib.sha256(verificador.encode()).digest()),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    carga = f"{state}.{nonce}.{verificador}.{int(time.time()) + VALIDADE}"
    return AUTORIZAR + "?" + urllib.parse.urlencode(q), f"{carga}.{_assinar(carga, chave)}"


def ler_cookie(valor, chave):
    """(state, nonce, verificador) se o cookie for desta API e recente; senao None."""
    try:
        state, nonce, verificador, fim, assinatura = (valor or "").split(".")
        carga = f"{state}.{nonce}.{verificador}.{fim}"
        if not hmac.compare_digest(_assinar(carga, chave), assinatura) or int(fim) < time.time():
            return None
    except ValueError:
        return None
    return state, nonce, verificador


def _conteudo_jwt(jwt):
    parte = jwt.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4)))


def trocar_codigo(codigo, verificador, url_retorno):
    """Troca o codigo da volta pelo ID token e devolve o conteudo dele."""
    corpo = urllib.parse.urlencode({
        "code": codigo,
        "client_id": _cliente(),
        "client_secret": _segredo_cliente(),
        "redirect_uri": url_retorno,
        "grant_type": "authorization_code",
        "code_verifier": verificador,
    }).encode()
    req = urllib.request.Request(TOKEN, data=corpo, headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            dados = json.load(r)
    except urllib.error.HTTPError as e:
        raise ValueError(f"o Google recusou o codigo (HTTP {e.code})") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise ValueError(f"sem resposta do Google: {e}") from e
    if "id_token" not in dados:
        raise ValueError("resposta do Google sem id_token")
    return _conteudo_jwt(dados["id_token"])


def conferir(dados, nonce, agora=None):
    """(email, sub) de um ID token valido para este cliente; ValueError com o motivo se nao for."""
    agora = agora or time.time()
    if dados.get("iss") not in EMISSORES:
        raise ValueError("emissor inesperado")
    aud = dados.get("aud")
    if aud != _cliente() and not (isinstance(aud, list) and _cliente() in aud):
        raise ValueError("token de outro cliente")
    if int(dados.get("exp", 0)) < agora:
        raise ValueError("token vencido")
    if not hmac.compare_digest(str(dados.get("nonce", "")), nonce):
        raise ValueError("nonce diferente do enviado")
    if dados.get("email_verified") not in (True, "true"):
        raise ValueError("e-mail nao verificado pelo Google")
    email, sub = (dados.get("email") or "").strip().lower(), str(dados.get("sub") or "")
    if not email or not sub:
        raise ValueError("token sem e-mail")
    return email, sub
