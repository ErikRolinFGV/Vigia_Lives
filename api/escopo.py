"""
O que cada conta enxerga e o que pode mudar.

O admin ve e faz tudo. As outras contas (usuario, que e fixa, e visitante,
que expira) tem um espaco proprio, mais o que o admin compartilhar com elas:

  canal visivel   o que ele adicionou (canal.dono = ele) ou que o admin
                  compartilhou (canal_compartilhado; python -m api.acessos
                  compartilhar)
  canal parcial   canal de que ele so colou lives pelo link: a pagina do
                  canal mostra so essas
  live visivel    de canal visivel, ou colada pelo link por ele (live_acesso)

O que se faz numa live (marcar para coleta, encerrar, descartar, dividir,
publicar, gerar dossie) vale em toda live visivel. Configuracao do canal
(modo de coleta, foto, parar de vigiar) so em canal que ele mesmo
adicionou. Vigia, Registro do sistema e contas: so o admin.

A trava das rotas com id no caminho fica aqui (autorizar, chamada pelo
middleware de api/main.py). As listas (canais, agenda, fichas, coletas em
andamento) filtram no proprio router, com Escopo.
"""
import re

# visitante pode ter ate tantos canais proprios vigiados (a cota do YouTube e
# uma so para todo mundo; o limite geral do plano continua valendo). O usuario
# fixo fica so com o limite do plano.
SLOTS_VISITANTE = 3
# canais proprios por plano da conta fixa (api/acessos.py, PLANOS)
CANAIS_POR_PLANO = {"gratuito": 1, "pesquisador": 10, "empresarial": 4}
NOME_PLANO = {"gratuito": "Gratuito", "pesquisador": "Pesquisador", "empresarial": "Empresarial"}

SO_ADMIN = [("POST", re.compile(r"^/api/operacao/vigia/")), ("GET", re.compile(r"^/api/operacao/eventos"))]
CANAL = re.compile(r"^/api/canais/([^/]+)(/[^/]+)?$")
LIVE = re.compile(r"^/api/lives/([^/]+)(/.*)?$")
GERENCIA = [("DELETE", None), ("PUT", "/modo"), ("PUT", "/foto")]


def base(video_id):
    """'V~2' (trecho) -> 'V' (video)."""
    return (video_id or "").split("~")[0]


class Escopo:
    def __init__(self, con, conta):
        self.usuario = conta["usuario"]
        self.papel = conta["papel"]
        self.admin = self.papel == "admin"
        self.plano = conta.get("plano") if self.papel == "usuario" else None
        # None (admin): sem limite proprio, vale so o geral
        self.limite_proprio = (SLOTS_VISITANTE if self.papel == "visitante"
                               else CANAIS_POR_PLANO.get(self.plano or "gratuito") if self.papel == "usuario" else None)
        self.proprios, self.compartilhados, self.soltas, self.parciais = set(), set(), set(), set()
        if self.admin:
            return
        u = self.usuario
        self.proprios = {r[0] for r in con.execute("SELECT canal_id FROM canal WHERE dono = ?", (u,))}
        self.compartilhados = {r[0] for r in con.execute("SELECT canal_id FROM canal_compartilhado WHERE usuario = ?", (u,))}
        rows = con.execute("""SELECT a.video_id, l.canal_id FROM live_acesso a JOIN live l ON l.video_id = a.video_id
                              WHERE a.usuario = ?""", (u,)).fetchall()
        self.soltas = {r[0] for r in rows}
        self.parciais = {r[1] for r in rows} - self.proprios - self.compartilhados

    def canal(self, canal_id):
        """Ve o canal inteiro."""
        return self.admin or canal_id in self.proprios or canal_id in self.compartilhados

    def canal_ou_parcial(self, canal_id):
        return self.canal(canal_id) or canal_id in self.parciais

    def live(self, video_id, canal_id):
        return self.canal(canal_id) or base(video_id) in self.soltas

    def gerencia(self, canal_id):
        """Pode mudar a configuracao do canal."""
        return self.admin or canal_id in self.proprios

    def marcas(self, canal_id, dono):
        """O que a tela precisa saber do canal para mostrar ou esconder botoes."""
        return {"dono": dono, "pode_gerenciar": self.gerencia(canal_id),
                "compartilhado": not self.admin and canal_id in self.compartilhados}


def autorizar(con, conta, metodo, caminho, query):
    """None se pode; (status, mensagem) se nao. 404 quando a conta nem deve saber que existe."""
    e = Escopo(con, conta)
    if e.admin:
        return None
    if any(metodo == m and r.match(caminho) for m, r in SO_ADMIN):
        return 403, "Só o administrador faz isso."

    m = CANAL.match(caminho)
    if m:
        canal_id, sub = m.group(1), m.group(2)
        if metodo in ("GET", "HEAD"):
            return None if e.canal_ou_parcial(canal_id) else (404, "canal não encontrado")
        if (metodo, sub) in GERENCIA:
            if e.gerencia(canal_id):
                return None
            if e.canal(canal_id):
                return 403, "Esse canal foi compartilhado com você: só quem o adicionou muda a configuração dele."
            return 404, "canal não encontrado"
        return None if e.canal(canal_id) else (404, "canal não encontrado")

    m = LIVE.match(caminho)
    if m and m.group(1) != "link":  # /lives/link e /lives/link/ler: colar um link novo
        return None if _ve_live(con, e, m.group(1)) else (404, "transmissão não encontrada")

    if caminho == "/api/comparar":
        ids = [i for i in (query.get("ids") or "").split(",") if i]
        if not all(_ve_live(con, e, i) for i in ids):
            return 404, "Sem ficha (coleta não encerrada ou id errado)."
    return None


def _ve_live(con, e, video_id):
    r = con.execute("SELECT canal_id FROM live WHERE video_id = ?", (base(video_id),)).fetchone()
    return bool(r) and e.live(video_id, r[0])
