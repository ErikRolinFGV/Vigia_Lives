"""
Conversao de Super Chat para reais pelo cambio do dia do apoio.

Fonte: taxas de referencia do Banco Central Europeu, via frankfurter.app
(publica, sem chave). Cada (dia, moeda) e buscado uma vez e fica em
`cambio`. Moeda que o BCE nao cota (peso argentino, por exemplo) volta
None: a tela mostra "sem cambio" em vez de inventar uma taxa.
"""
import json
import urllib.request

from collector import db

URL = "https://api.frankfurter.app/{data}?from={moeda}&to=BRL"


def taxa(con, moeda, data):
    moeda = (moeda or "").upper()
    if moeda == "BRL":
        return 1.0
    if not moeda or not data:
        return None
    r = con.execute("SELECT brl FROM cambio WHERE data=? AND moeda=?", (data, moeda)).fetchone()
    if r:
        return r["brl"]
    try:
        with urllib.request.urlopen(URL.format(data=data, moeda=moeda), timeout=5) as resp:
            valor = json.loads(resp.read().decode("utf-8"))["rates"]["BRL"]
    except Exception:
        return None
    con.execute("INSERT OR REPLACE INTO cambio (data, moeda, brl) VALUES (?,?,?)", (data, moeda, float(valor)))
    con.commit()
    return float(valor)


def para_brl(con, valor_micros, moeda, quando_iso):
    """Valor em reais, ou None se nao ha cambio para a moeda nesse dia."""
    if valor_micros is None:
        return None
    t = taxa(con, moeda, (quando_iso or db.agora())[:10])
    return None if t is None else round(valor_micros / 1_000_000 * t, 2)
