"""
Analise do texto do chat. Roda inteira no backend, sem modelo e sem rede:
o texto das mensagens nunca sai daqui (nem para o dossie, nem para o link
publico).

E heuristica de proposito, e a tela diz isso: tom por lexico, idioma por
palavras funcionais, pergunta por ponto de interrogacao. Barato, auditavel
e reprocessavel. Uma camada com modelo pode entrar depois, gravando em
analise_mensagem com outro `modelo` ao lado desta.
"""
import re
import unicodedata
from collections import Counter

from collector.report import RE_SHORTCODE, STOPWORDS

MODELO = "lexico-v1"

# Bandeira = par de indicadores regionais; o resto, um pictograma com
# variacao, tom de pele e sequencias ZWJ opcionais.
RE_EMOJI = re.compile(
    "(?:[\U0001F1E6-\U0001F1FF]{2})"
    "|(?:[\U0001F300-\U0001FAFF☀-➿⭐⭕←-⇿]"
    "[️\U0001F3FB-\U0001F3FF]?"
    "(?:‍[\U0001F300-\U0001FAFF☀-➿][️\U0001F3FB-\U0001F3FF]?)*)"
)
RE_PALAVRA = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
RE_RISO = re.compile(r"^(k{3,}|(ha){2,}h?|(ja){2,}j?|(rs){2,}|(he){2,}h?|lol+)$")


def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def limpar(texto):
    """Texto sem shortcodes de emoji do YouTube."""
    return RE_SHORTCODE.sub(" ", texto or "")


def palavras(texto):
    """Palavras com significado: sem stopword, sem risada, sem emoji."""
    saida = []
    for p in RE_PALAVRA.findall(limpar(texto)):
        b = p.lower()
        if sem_acento(b) in STOPWORDS or RE_RISO.match(b):
            continue
        saida.append(b)
    return saida


def emojis(texto):
    """Emojis unicode e emojis do proprio YouTube (":hand-pink-waving:")."""
    t = texto or ""
    return RE_EMOJI.findall(t) + RE_SHORTCODE.findall(t)


# ---------------------------------------------------------------- idioma

FUNCIONAIS = {
    "pt": set("que nao não de do da dos das em um uma pra para com por isso esse essa você voce vc muito tá ta é eh ele ela foi vai tem mais mas meu minha agora aqui galera jogo kkk kkkk".split()),
    "es": set("que el los las del por para con una muy pero esto este esta está como más mas gracias hola jaja jajaja vamos partido hermano usted ustedes".split()),
    "en": set("the and you is are this that what for with was have not but lol game go good nice love omg wow they".split()),
}
NOMES_IDIOMA = {"pt": "Português", "es": "Espanhol", "en": "Inglês", "outros": "Outros"}


def idioma(texto):
    """
    'pt', 'es', 'en', 'outros' ou None (curta demais para dizer). Conta
    palavras funcionais de cada lingua; empate ou nenhuma = indeterminado.
    """
    ps = [p.lower() for p in RE_PALAVRA.findall(limpar(texto))] + \
         [p.lower() for p in re.findall(r"\b\w{1,2}\b", limpar(texto))]
    if len(ps) < 2:
        return None
    pontos = {k: sum(1 for p in ps if p in v) for k, v in FUNCIONAIS.items()}
    melhor = max(pontos, key=pontos.get)
    vals = sorted(pontos.values(), reverse=True)
    if vals[0] == 0:
        # "BRASIL BRASIL VAMOS" nao tem palavra funcional de lingua nenhuma:
        # e indeterminado, nao "outro idioma"
        return None
    if vals[0] == vals[1]:
        # "que" e "de" sao das duas linguas: no empate, o chat e brasileiro
        return "pt" if pontos["pt"] == vals[0] else None
    return melhor


# ---------------------------------------------------------------- tom

POSITIVAS = set(sem_acento(p) for p in """
gol gool goool gooool golaço golaco lindo linda lindas lindo maravilha maravilhosa maravilhoso
incrivel incrível top demais show perfeito perfeita parabens parabéns orgulho amo amei
boa bom otimo ótimo otima ótima excelente brabo braba craque monstra monstro genial
vamos vamo bora vai vaaai obrigado obrigada valeu feliz alegria emocionante sensacional
fenomenal espetacular sucesso campeao campeã campea vitoria vitória ganhamos massa
""".split())
NEGATIVAS = set(sem_acento(p) for p in """
horrivel horrível ridiculo ridícula ridiculo pessimo péssimo pessima péssima lixo vergonha
vergonhoso roubado roubo roubada ladrao ladrão absurdo absurda raiva odeio odio ódio chato
chata ruim fraco fraca fraquinho errado erro merda porcaria nojo nojento triste tristeza
perdemos derrota desastre palhaçada palhacada vexame cagada lamentavel lamentável injusto
injustiça injustica mentira mentiroso burro burra incompetente cai caiu travou travando
""".split())
EMOJI_POS = set("😍🥰😁😀😃😄😊🙌👏🔥❤💛💚💙💜🤩🥳🎉⚽🏆✨💪😎👍🙏🇧🇷")
EMOJI_NEG = set("😡🤬😠👎😤💩😒🙄😞😢😭🤮🤢")


def tom(texto):
    """'positivo', 'negativo' ou 'neutro', por contagem de lexico."""
    t = texto or ""
    ps = [sem_acento(p.lower()) for p in RE_PALAVRA.findall(limpar(t))]
    pos = sum(1 for p in ps if p in POSITIVAS) + sum(1 for c in t if c in EMOJI_POS)
    neg = sum(1 for p in ps if p in NEGATIVAS) + sum(1 for c in t if c in EMOJI_NEG)
    if pos > neg:
        return "positivo"
    if neg > pos:
        return "negativo"
    return "neutro"


# ---------------------------------------------------------------- perguntas

def pergunta(texto):
    """Forma normalizada da pergunta, para agrupar repeticoes; None se nao e."""
    t = limpar(texto).strip()
    if "?" not in t:
        return None
    t = t.split("?")[0] + "?"
    n = sem_acento(t.lower())
    n = re.sub(r"[^\w\s?]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n if len(n) >= 8 else None


# ---------------------------------------------------------------- marcas

# Marcas que costumam aparecer em transmissao esportiva e de noticia no
# Brasil. Lista editavel: citacao e contada por palavra inteira. Vivo e
# Claro ficam de fora de proposito: "ao vivo" e "claro" sao portugues comum
# e encheriam a contagem de falso positivo.
MARCAS = [
    "Nike", "Adidas", "Puma", "Umbro", "Guaraná Antarctica", "Brahma", "Skol", "Heineken",
    "Ambev", "Itaú", "Bradesco", "Santander", "Nubank", "Mercado Livre", "Mercado Pago",
    "Betano", "Bet365", "Superbet", "Sportingbet", "KTO", "Pixbet", "Estrela Bet", "Blaze",
    "Coca-Cola", "Pepsi", "McDonald's", "iFood", "Amazon",
    "Netflix", "Globo", "SporTV", "Sportv", "Shopee", "Magalu", "Casas Bahia", "Volkswagen",
]
_RE_MARCAS = [(m, re.compile(r"(?<!\w)" + re.escape(sem_acento(m.lower())) + r"(?!\w)")) for m in MARCAS]


def marcas(texto):
    t = sem_acento((texto or "").lower())
    vistas = []
    for nome, rx in _RE_MARCAS:
        canonico = "SporTV" if nome.lower() == "sportv" else nome
        if rx.search(t) and canonico not in vistas:
            vistas.append(canonico)
    return vistas


def contar_palavras(listas, n=12):
    """
    Conta palavras juntando grafias com e sem acento ("canadá" e "canada")
    e mostra a forma mais usada.
    """
    total, formas = Counter(), {}
    for ps in listas:
        for p in ps:
            k = sem_acento(p)
            total[k] += 1
            formas.setdefault(k, Counter())[p] += 1
    return [(formas[k].most_common(1)[0][0], v) for k, v in total.most_common(n)]
