// Geometria dos gráficos, portada do protótipo (gbox, gutter, rmargin, nice,
// pts, dLine, dArea). Tudo em unidades de viewBox de 1000 de largura.
//
// Painéis que dividem o eixo de tempo passam a mesma `geo`: assim dividem as
// margens e uma única linha de hover fica alinhada em todos eles.

export type Geo = { L: number; R: number; top: number; bot: number; W: number; H: number };
type Pt = [number, number];

/** A calha do eixo Y cabe o rótulo mais largo ("NNN.NNN" ou "N,NN%"). */
export const gutter = (fs: number) => Math.round(4.06 * fs + 14);
/** Rótulo de tempo é centralizado no tick: a margem cabe meio "N:NN". */
export const rmargin = (fs: number) => Math.max(12, Math.round(1.5 * fs));

export function gbox(H: number, fs: number, geo?: number): Geo {
  const f = geo || fs || 11;
  const L = gutter(f), R = rmargin(f);
  return { L, R, top: 14, bot: H - 30, W: 1000 - L - R, H };
}

export const px = (i: number, n: number, g: Geo) => g.L + g.W * (n <= 1 ? 0 : i / (n - 1));
export const py = (v: number, max: number, g: Geo) => g.bot - (v / max) * (g.bot - g.top);

export function nice(m: number) {
  if (!(m > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(m)));
  return Math.ceil((m * 1.1) / e) * e;
}

/** Segmentos contínuos: um null quebra a linha (nunca interpolar). */
export function pts(vals: (number | null)[], max: number, g: Geo): Pt[][] {
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  vals.forEach((v, i) => {
    if (v == null) { if (cur.length > 1) segs.push(cur); cur = []; return; }
    cur.push([px(i, vals.length, g), py(v, max, g)]);
  });
  if (cur.length > 1) segs.push(cur);
  return segs;
}

export const dLine = (segs: Pt[][]) =>
  segs.map(p => "M" + p.map(q => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L")).join(" ");

export const dArea = (segs: Pt[][], g: Geo) =>
  segs.map(p => "M" + p[0][0].toFixed(1) + " " + g.bot + " L" +
    p.map(q => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L") +
    " L" + p[p.length - 1][0].toFixed(1) + " " + g.bot + " Z").join(" ");

export function dBars(vals: (number | null)[], max: number, g: Geo) {
  const n = vals.length, bw = Math.max(2.5, (g.W / n) * 0.6);
  return vals.map((v, i) => {
    if (v == null) return "";
    const x = px(i, n, g) - bw / 2, y = py(v, max, g);
    return `M${x.toFixed(1)} ${g.bot.toFixed(1)} L${x.toFixed(1)} ${y.toFixed(1)} L${(x + bw).toFixed(1)} ${y.toFixed(1)} L${(x + bw).toFixed(1)} ${g.bot.toFixed(1)} Z`;
  }).join(" ");
}

/** Índice da janela sob o mouse, para o hover sincronizado. -1 = fora. */
export function indiceHover(fracX: number, n: number, geo: number) {
  const L = gutter(geo) / 1000, W = (1000 - gutter(geo) - rmargin(geo)) / 1000;
  if (fracX < L || fracX > L + W) return -1;
  return Math.max(0, Math.min(n - 1, Math.round(((fracX - L) / W) * (n - 1))));
}

/** Passo de rótulos de tempo para ~8 rótulos no eixo. */
export const passoTicks = (n: number, alvo = 8) => Math.max(1, Math.round(n / alvo));
