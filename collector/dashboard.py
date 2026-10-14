"""
Dashboard HTML de uma live coletada.

    python collector/dashboard.py --video VIDEO_ID

Gera um arquivo unico e autocontido em reports/, sem dependencia externa e
sem nada vindo de CDN: abre em qualquer navegador, pode ser enviado por
email ou anexado numa proposta. E o formato certo para mostrar a um cliente
que nao vai instalar Python para ver o resultado.

Le apenas as tabelas ja calculadas pelo report.py. Rode o report antes.
"""
import argparse
import json
import sqlite3

try:
    from . import config, db
except ImportError:
    import config
    import db

# Paleta validada com o script de checagem de daltonismo e contraste,
# nos dois modos. Uma serie por painel, entao nao ha par adjacente
# competindo: audiencia, chat e participacao nunca dividem o mesmo eixo.
COR = {
    "aud": ("#2a78d6", "#3987e5"),
    "chat": ("#eb6834", "#d95926"),
    "part": ("#1baf7a", "#199e70"),
}

L, R, T, B = 62, 18, 16, 26      # margens internas de cada painel
W = 1000


def hhmm(seg):
    seg = int(seg or 0)
    return f"{seg//3600:d}:{(seg%3600)//60:02d}"


def fmt(v, casas=0):
    if v is None:
        return "n/d"
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def carregar(con, video_id, bucket=60):
    live = con.execute(
        """SELECT l.*, c.nome canal FROM live l
           JOIN canal c ON c.canal_id = l.canal_id WHERE l.video_id=?""",
        (video_id,)).fetchone()
    if not live:
        return None
    resumo = con.execute("SELECT * FROM v_resumo_live WHERE video_id=?",
                         (video_id,)).fetchone()
    serie = con.execute(
        """SELECT bucket_inicio t, msgs, msgs_por_minuto mpm, autores_unicos au,
                  espectadores_medio esp, taxa_participacao part, doacoes_micros doa
           FROM janela_agregada
           WHERE video_id=? AND bucket_segundos=? AND bucket_inicio >= 0
           ORDER BY bucket_inicio""", (video_id, bucket)).fetchall()
    momentos = con.execute(
        """SELECT offset_segundos t, tipo, magnitude, url_timestamp
           FROM momento WHERE video_id=? AND offset_segundos >= 0
           ORDER BY magnitude DESC""", (video_id,)).fetchall()
    try:
        enquetes = con.execute(
            "SELECT * FROM enquete WHERE video_id=? ORDER BY offset_segundos",
            (video_id,)).fetchall()
    except sqlite3.OperationalError:
        enquetes = []
    cota = con.execute(
        """SELECT metodo, COUNT(*) n, SUM(custo_unidades) u FROM coleta_log
           WHERE video_id=? GROUP BY metodo ORDER BY u DESC""",
        (video_id,)).fetchall()
    return dict(live=live, resumo=resumo, serie=serie, momentos=momentos,
                enquetes=enquetes, cota=cota)


# ------------------------------------------------------------------ svg

def _escala(vals, alto):
    """
    Area de plot: do topo T ate a base (alto - B). O rotulo do maior valor
    precisa da margem T acima dele, senao sai cortado na borda do SVG.
    """
    vs = [v for v in vals if v is not None]
    topo = (max(vs) if vs else 1) * 1.12 or 1
    h = alto - T - B
    return topo, (lambda v: alto - B - (v or 0) / topo * h)


def _eixo_x(ts):
    t0, t1 = (ts[0], ts[-1]) if ts else (0, 1)
    span = (t1 - t0) or 1
    return lambda t: L + (t - t0) / span * (W - L - R)


def _grade(alto, topo, x_de, ts, unidade=""):
    p = [f'<rect x="0" y="0" width="{W}" height="{alto}" fill="var(--surface-1)"/>']
    casas = 2 if topo < 2 else (1 if topo < 20 else 0)
    h = alto - T - B
    for i in range(5):
        v = topo * i / 4
        y = alto - B - (v / topo) * h
        p.append(f'<line x1="{L}" y1="{y:.1f}" x2="{W-R}" y2="{y:.1f}" '
                 f'stroke="var(--grid)" stroke-width="1"/>')
        rot = fmt(v, casas) + unidade
        p.append(f'<text x="{L-8}" y="{y+4:.1f}" text-anchor="end" '
                 f'class="tick">{rot}</text>')
    if ts:
        passo = max(1, len(ts) // 8)
        for i in range(0, len(ts), passo):
            x = x_de(ts[i])
            p.append(f'<text x="{x:.1f}" y="{alto-6}" text-anchor="middle" '
                     f'class="tick">{hhmm(ts[i])}</text>')
    return "".join(p)


def _momentos_svg(momentos, x_de, alto):
    p = []
    for m in momentos[:8]:
        x = x_de(m["t"])
        if not (L <= x <= W - R):
            continue
        cor = "var(--moment-alta)" if (m["magnitude"] or 0) >= 5 else "var(--moment)"
        p.append(f'<line x1="{x:.1f}" y1="{T}" x2="{x:.1f}" y2="{alto-B}" '
                 f'stroke="{cor}" stroke-width="1"/>')
    return "".join(p)


def painel_linha(ts, vals, alto, cor_var, x_de, unidade="", area=True):
    topo, y_de = _escala(vals, alto)
    pts = [(x_de(t), y_de(v)) for t, v in zip(ts, vals) if v is not None]
    if not pts:
        return "", topo
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    svg = [_grade(alto, topo, x_de, ts, unidade)]
    if area:
        base = alto - B
        svg.append(f'<path d="{d} L{pts[-1][0]:.1f} {base} L{pts[0][0]:.1f} {base} Z" '
                   f'fill="{cor_var}" opacity="0.10"/>')
    svg.append(f'<path d="{d}" fill="none" stroke="{cor_var}" stroke-width="2" '
               'stroke-linejoin="round" stroke-linecap="round"/>')
    x, y = pts[-1]
    svg.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{cor_var}" '
               'stroke="var(--surface-1)" stroke-width="2"/>')
    return "".join(svg), topo


def painel_barras(ts, vals, alto, cor_var, x_de, unidade=""):
    topo, y_de = _escala(vals, alto)
    svg = [_grade(alto, topo, x_de, ts, unidade)]
    if len(ts) > 1:
        larg = max(1.5, min(24.0, (x_de(ts[1]) - x_de(ts[0])) - 2))
    else:
        larg = 24.0
    base = alto - B
    r = min(4.0, larg / 2)
    for t, v in zip(ts, vals):
        if not v:
            continue
        x = x_de(t) - larg / 2
        y = y_de(v)
        h = base - y
        if h < 0.5:
            continue
        rr = min(r, h)
        # topo arredondado, base quadrada, ancorada na linha zero
        svg.append(
            f'<path d="M{x:.1f} {base} L{x:.1f} {y+rr:.1f} '
            f'Q{x:.1f} {y:.1f} {x+rr:.1f} {y:.1f} '
            f'L{x+larg-rr:.1f} {y:.1f} Q{x+larg:.1f} {y:.1f} {x+larg:.1f} {y+rr:.1f} '
            f'L{x+larg:.1f} {base} Z" fill="{cor_var}"/>')
    return "".join(svg), topo


# ------------------------------------------------------------------ html

CSS = """
:root{color-scheme:light;
 --surface-0:#f6f6f4; --surface-1:#fcfcfb; --border:#e4e3df;
 --text-primary:#0b0b0b; --text-secondary:#52514e; --text-muted:#77766f;
 --grid:#e9e8e4; --moment:#d9d8d3; --moment-alta:#c9b8b0;
 --aud:#2a78d6; --chat:#eb6834; --part:#1baf7a;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 color-scheme:dark;
 --surface-0:#121211; --surface-1:#1a1a19; --border:#33322f;
 --text-primary:#ffffff; --text-secondary:#c3c2b7; --text-muted:#8e8d84;
 --grid:#2b2a28; --moment:#3a3936; --moment-alta:#5b4a44;
 --aud:#3987e5; --chat:#d95926; --part:#199e70;}}
:root[data-theme="dark"]{color-scheme:dark;
 --surface-0:#121211; --surface-1:#1a1a19; --border:#33322f;
 --text-primary:#ffffff; --text-secondary:#c3c2b7; --text-muted:#8e8d84;
 --grid:#2b2a28; --moment:#3a3936; --moment-alta:#5b4a44;
 --aud:#3987e5; --chat:#d95926; --part:#199e70;}
*{box-sizing:border-box}
body{margin:0;background:var(--surface-0);color:var(--text-primary);
 font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.wrap{max-width:1080px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:23px;line-height:1.25;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:15px;margin:34px 0 12px;color:var(--text-secondary);
 text-transform:uppercase;letter-spacing:.07em;font-weight:600}
.sub{color:var(--text-secondary);margin:0 0 4px}
.sub a{color:inherit}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));
 gap:10px;margin:22px 0 8px}
.tile{background:var(--surface-1);border:1px solid var(--border);
 border-radius:10px;padding:13px 15px}
.tile .k{font-size:11px;color:var(--text-muted);text-transform:uppercase;
 letter-spacing:.06em;margin-bottom:5px}
.tile .v{font-size:26px;font-weight:650;letter-spacing:-.02em;
 font-variant-numeric:tabular-nums}
.tile .n{font-size:12px;color:var(--text-secondary);margin-top:3px}
.destaque{background:var(--surface-1);border:1px solid var(--border);
 border-left:3px solid var(--chat);border-radius:10px;padding:16px 18px;margin:18px 0}
.destaque b{font-variant-numeric:tabular-nums}
.card{background:var(--surface-1);border:1px solid var(--border);
 border-radius:10px;padding:14px 4px 4px;margin-bottom:10px;position:relative}
.card .rot{font-size:12.5px;color:var(--text-secondary);padding:0 14px 4px;
 display:flex;justify-content:space-between;align-items:baseline}
.card .rot b{color:var(--text-primary);font-size:13.5px}
svg{display:block;width:100%;height:auto}
.tick{fill:var(--text-muted);font-size:11px;
 font-family:ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums}
table{border-collapse:collapse;width:100%;font-size:13.5px;
 background:var(--surface-1);border:1px solid var(--border);border-radius:10px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border)}
th{color:var(--text-muted);font-weight:600;font-size:11.5px;
 text-transform:uppercase;letter-spacing:.05em}
tr:last-child td{border-bottom:none}
td.num{text-align:right;font-variant-numeric:tabular-nums}
a{color:var(--aud)}
.bar{height:7px;background:var(--part);border-radius:4px;display:inline-block;
 vertical-align:middle;margin-right:8px}
details{margin-top:12px}
summary{cursor:pointer;color:var(--text-secondary);font-size:13.5px;padding:6px 0}
.rodape{margin-top:38px;padding-top:16px;border-top:1px solid var(--border);
 color:var(--text-muted);font-size:12.5px}
#tt{position:fixed;pointer-events:none;opacity:0;transition:opacity .1s;
 background:var(--surface-1);border:1px solid var(--border);border-radius:8px;
 padding:9px 11px;font-size:12.5px;box-shadow:0 6px 22px rgba(0,0,0,.14);z-index:9}
#tt .t{color:var(--text-muted);margin-bottom:4px}
#tt .l{display:flex;gap:8px;align-items:center;justify-content:space-between}
#tt .sw{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:6px}
#tt b{font-variant-numeric:tabular-nums}
.cross{stroke:var(--text-muted);stroke-width:1;opacity:0}
.chip{display:inline-block;background:var(--surface-1);border:1px solid var(--border);
 border-radius:99px;padding:3px 11px;margin:0 6px 6px 0;font-size:13px}
.chip s{text-decoration:none;color:var(--text-muted);font-variant-numeric:tabular-nums}
"""

JS = """
const D=DADOS, tt=document.getElementById('tt');
function f(n,c){return n==null?'n/d':n.toLocaleString('pt-BR',
  {minimumFractionDigits:c||0,maximumFractionDigits:c||0});}
function hhmm(s){return Math.floor(s/3600)+':'+String(Math.floor(s%3600/60)).padStart(2,'0');}
document.querySelectorAll('.card').forEach(card=>{
  const svg=card.querySelector('svg'), cross=svg.querySelector('.cross');
  if(!cross) return;
  const mover=e=>{
    const r=svg.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width*1000;
    if(px<D.L||px>1000-D.R){cross.style.opacity=0;tt.style.opacity=0;return;}
    const frac=(px-D.L)/(1000-D.L-D.R);
    const i=Math.max(0,Math.min(D.t.length-1,Math.round(frac*(D.t.length-1))));
    const x=D.L+(1000-D.L-D.R)*(i/Math.max(1,D.t.length-1));
    cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.style.opacity=.45;
    tt.innerHTML='<div class="t">'+hhmm(D.t[i])+' de transmissao</div>'+
      '<div class="l"><span><i class="sw" style="background:var(--aud)"></i>'+
      'Espectadores</span><b>'+f(D.esp[i])+'</b></div>'+
      '<div class="l"><span><i class="sw" style="background:var(--chat)"></i>'+
      'Mensagens/min</span><b>'+f(D.mpm[i],1)+'</b></div>'+
      '<div class="l"><span><i class="sw" style="background:var(--part)"></i>'+
      'Participacao</span><b>'+(D.part[i]==null?'n/d':f(D.part[i]*100,3)+'%')+'</b></div>';
    tt.style.opacity=1;
    const w=tt.offsetWidth,h=tt.offsetHeight;
    tt.style.left=Math.min(window.innerWidth-w-12,Math.max(12,e.clientX+16))+'px';
    tt.style.top=Math.max(12,e.clientY-h-14)+'px';
    document.querySelectorAll('.cross').forEach(c=>{
      c.setAttribute('x1',x);c.setAttribute('x2',x);c.style.opacity=.45;});
  };
  svg.addEventListener('mousemove',mover);
  svg.addEventListener('mouseleave',()=>{tt.style.opacity=0;
    document.querySelectorAll('.cross').forEach(c=>c.style.opacity=0);});
});
"""


def gerar(con, video_id, bucket=60):
    d = carregar(con, video_id, bucket)
    if not d:
        return None
    live, r, serie = d["live"], d["resumo"], d["serie"]
    ts = [s["t"] for s in serie]
    esp = [s["esp"] for s in serie]
    mpm = [s["mpm"] for s in serie]
    part = [s["part"] for s in serie]
    x_de = _eixo_x(ts)

    H1, H2, H3 = 210, 165, 150
    p1, _ = painel_linha(ts, esp, H1, "var(--aud)", x_de)
    p2, _ = painel_barras(ts, mpm, H2, "var(--chat)", x_de)
    p3, _ = painel_linha(ts, [(p * 100 if p is not None else None) for p in part],
                         H3, "var(--part)", x_de, unidade="%", area=False)
    mom = _momentos_svg(d["momentos"], x_de, H1)

    def card(rot, nota, svg, alto):
        return (f'<div class="card"><div class="rot"><b>{rot}</b>'
                f'<span>{nota}</span></div><svg viewBox="0 0 {W} {alto}" '
                f'role="img" aria-label="{rot}">{svg}'
                f'<line class="cross" x1="0" y1="{T}" x2="0" y2="{alto-B}"/>'
                '</svg></div>')

    # numeros do topo
    pico = r["pico_espectadores"] or 0
    autores = r["autores_unicos"] or 0
    msgs = sum(s["msgs"] for s in serie)
    dur = live["duracao_segundos"] or (ts[-1] if ts else 0)
    unid = sum((c["u"] or 0) for c in d["cota"])
    part_pico = (100 * autores / pico) if pico else 0

    tiles = [
        ("Pico de espectadores", fmt(pico), "simultaneos"),
        ("Escreveram no chat", fmt(autores), f"{part_pico:.1f}% do pico"),
        ("Mensagens", fmt(msgs), f"{msgs/(dur/60):.0f} por minuto" if dur else ""),
        ("Cobertura da coleta", f'{live["cobertura_pct"] or 0:.1f}%',
         "da transmissao acompanhada"),
        ("Momentos detectados", fmt(len(d["momentos"])), "sem LLM, custo zero"),
        ("Cota consumida", f"{100*unid/10000:.1f}%", f"{fmt(unid)} de 10.000/dia"),
    ]
    html_tiles = "".join(
        f'<div class="tile"><div class="k">{k}</div><div class="v">{v}</div>'
        f'<div class="n">{n}</div></div>' for k, v, n in tiles)

    # a frase que resume o achado
    destaque = ""
    val = [(s["esp"], s["mpm"]) for s in serie if s["esp"] and s["mpm"]]
    if len(val) >= 6:
        n = max(3, len(val) // 6)
        e0 = sum(v[0] for v in val[:n]) / n
        e1 = sum(v[0] for v in val[-n:]) / n
        m0 = sum(v[1] for v in val[:n]) / n
        m1 = sum(v[1] for v in val[-n:]) / n
        pa, pb = (m0 / e0 * 100), (m1 / e1 * 100)
        if e1 > e0 * 1.2 and pb < pa:
            destaque = (
                f'<div class="destaque">A audiencia foi de <b>{fmt(e0)}</b> para '
                f'<b>{fmt(e1)}</b> espectadores, <b>{e1/e0:.1f}x</b> maior. '
                f'No mesmo intervalo a fracao que escreve no chat caiu de '
                f'<b>{pa:.2f}%</b> para <b>{pb:.2f}%</b>.<br>'
                'Sao dois publicos diferentes, e a curva de espectadores '
                'sozinha nao separa um do outro.</div>')

    # momentos
    nome = {"pico_chat": "pico de chat", "pico_doacao": "pico de doacao",
            "queda_audiencia": "queda de audiencia",
            "pico_audiencia": "pico de audiencia",
            "virada_sentimento": "virada de sentimento"}
    linhas_m = "".join(
        f'<tr><td>{hhmm(m["t"])}</td><td>{nome.get(m["tipo"], m["tipo"])}</td>'
        f'<td class="num">{m["magnitude"]:.1f}</td>'
        f'<td><a href="{m["url_timestamp"]}" target="_blank">abrir no video</a></td></tr>'
        for m in d["momentos"][:12])
    bloco_momentos = (
        '<h2>Momentos detectados</h2><table><tr><th>Momento</th><th>Tipo</th>'
        '<th class="num">Intensidade</th><th></th></tr>' + linhas_m + '</table>'
        '<p class="sub" style="font-size:13px;margin-top:8px">Deteccao estatistica '
        'por desvio sobre a media movel. Nenhuma chamada de modelo de linguagem, '
        'custo zero por momento.</p>') if linhas_m else ""

    # enquetes
    bloco_enq = ""
    for e in d["enquetes"]:
        ops = json.loads(e["opcoes"] or "[]")
        tot = e["total_votos"] or sum(o.get("votos") or 0 for o in ops) or 1
        li = "".join(
            f'<tr><td>{o.get("texto") or "?"}</td>'
            f'<td class="num">{fmt(o.get("votos"))}</td>'
            f'<td style="width:38%"><span class="bar" style="width:'
            f'{100*(o.get("votos") or 0)/tot:.0f}%"></span>'
            f'{100*(o.get("votos") or 0)/tot:.0f}%</td></tr>' for o in ops)
        bloco_enq += (f'<p class="sub"><b>{hhmm(e["offset_segundos"])}</b> '
                      f'{e["pergunta"] or "pergunta nao capturada"} '
                      f'({fmt(tot)} votos)</p><table>{li}</table>')
    if bloco_enq:
        bloco_enq = ('<h2>Enquetes do canal</h2>' + bloco_enq +
                     '<p class="sub" style="font-size:13px;margin-top:8px">'
                     'O YouTube nao guarda estes resultados depois que a live '
                     'acaba, e o canal nao tem como exporta-los.</p>')

    linhas_cota = "".join(
        f'<tr><td>{c["metodo"]}</td><td class="num">{fmt(c["n"])}</td>'
        f'<td class="num">{fmt(c["u"])}</td></tr>' for c in d["cota"])

    tabela_dados = "".join(
        f'<tr><td>{hhmm(s["t"])}</td><td class="num">{fmt(s["esp"])}</td>'
        f'<td class="num">{fmt(s["mpm"],1)}</td><td class="num">{fmt(s["au"])}</td>'
        f'<td class="num">'
        f'{("%.3f%%" % (s["part"]*100)) if s["part"] is not None else "n/d"}</td></tr>'
        for s in serie)

    dados_js = json.dumps({
        "L": L, "R": R, "t": ts, "esp": esp, "mpm": mpm, "part": part,
    }, ensure_ascii=False)

    titulo = live["titulo"] or video_id
    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{titulo}</title><style>{CSS}</style></head><body>
<div class="wrap">
<h1>{titulo}</h1>
<p class="sub">{live["canal"]} &middot; inicio {live["inicio_real"] or "n/d"} &middot;
<a href="https://youtube.com/watch?v={video_id}" target="_blank">ver no YouTube</a></p>
<div class="tiles">{html_tiles}</div>
{destaque}
<h2>Audiencia, chat e participacao ao longo da transmissao</h2>
{card("Espectadores simultaneos", "linhas verticais marcam os momentos detectados",
      p1 + mom, H1)}
{card("Mensagens por minuto", "cada barra e uma janela de %d segundos" % bucket, p2, H2)}
{card("Taxa de participacao", "fracao dos espectadores que escreveu na janela",
      p3, H3)}
<p class="sub" style="font-size:13px">As tres medidas tem escalas diferentes e por
isso ficam em paineis separados com o mesmo eixo de tempo. Passe o mouse para ler
os tres valores do mesmo instante.</p>
{bloco_momentos}
{bloco_enq}
<h2>Custo de coleta</h2>
<table><tr><th>Metodo da API</th><th class="num">Chamadas</th>
<th class="num">Unidades</th></tr>{linhas_cota}
<tr><td><b>total</b></td><td class="num"></td><td class="num"><b>{fmt(unid)}</b></td></tr>
</table>
<details><summary>Ver a tabela de dados completa</summary>
<table><tr><th>Momento</th><th class="num">Espectadores</th>
<th class="num">Msgs/min</th><th class="num">Autores</th>
<th class="num">Participacao</th></tr>{tabela_dados}</table></details>
<p class="rodape">Gerado pela camada 0 do monitor de lives, direto do banco da
coleta. Nenhuma chamada de modelo de linguagem foi usada neste painel.
Autores aparecem apenas como pseudonimo; nenhum dado pessoal sai do banco.</p>
</div><div id="tt"></div>
<script>const DADOS={dados_js};{JS}</script>
</body></html>"""

    config.DIR_RELATORIOS.mkdir(parents=True, exist_ok=True)
    caminho = config.DIR_RELATORIOS / f"dashboard_{video_id}.html"
    caminho.write_text(html, encoding="utf-8")
    return caminho


def main():
    p = argparse.ArgumentParser(description="Dashboard HTML de uma live")
    p.add_argument("--video", required=True)
    p.add_argument("--bucket", type=int, default=60)
    args = p.parse_args()
    con = db.conectar()
    caminho = gerar(con, args.video, args.bucket)
    if not caminho:
        print("live nao encontrada. Rode o report.py antes.")
    else:
        print(f"dashboard: {caminho}")
        print("abra esse arquivo no navegador. E autocontido: pode ser enviado "
              "por email ou anexado numa proposta.")
    con.close()


if __name__ == "__main__":
    main()
