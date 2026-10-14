// Leituras derivadas da série, sem chamada nova de API. Porte do bloco
// "leituras derivadas" de renderVals() do protótipo.
import type { Serie } from "../../api/types";

export type Derivados = {
  total: number;
  acum: number[];
  metadeIdx: number;
  metadeFrac: number;
  corr: number | null;
  mediana: number;
  maxMpm: number;
  maxIdx: number;
  jitter: number;
  hist: { faixa: string; n: number; forte: boolean }[];
  lead: number;          // janelas antes do primeiro número de espectadores
  semResposta: number;   // janelas depois disso sem número
  comNumero: number;
};

const BORDAS = [0, 10, 20, 40, 80, Infinity];
const FAIXAS = ["0–9", "10–19", "20–39", "40–79", "80+"];

export function derivar(s: Serie): Derivados {
  const { esp, mpm } = s;
  const acum: number[] = [];
  let soma = 0;
  for (const v of mpm) { soma += v || 0; acum.push(soma); }
  let metadeIdx = 0;
  for (let i = 0; i < acum.length; i++) if (acum[i] >= soma / 2) { metadeIdx = i; break; }

  const ord = [...mpm].sort((a, b) => a - b);
  const mediana = ord[Math.floor(ord.length / 2)] ?? 0;
  const maxMpm = Math.max(0, ...mpm);

  const cont = FAIXAS.map(() => 0);
  for (const v of mpm) for (let b = 0; b < 5; b++) if (v >= BORDAS[b] && v < BORDAS[b + 1]) { cont[b]++; break; }

  let jitter = 0;
  for (let i = 1; i < esp.length; i++) {
    const a = esp[i - 1], b = esp[i];
    if (a != null && b != null) jitter = Math.max(jitter, Math.abs(b - a));
  }

  // correlação de Pearson entre espectadores e mensagens, só nas janelas com número
  const pares: [number, number][] = [];
  esp.forEach((v, i) => { if (v != null) pares.push([v, mpm[i]]); });
  let corr: number | null = null;
  if (pares.length > 2) {
    const mx = pares.reduce((a, p) => a + p[0], 0) / pares.length;
    const my = pares.reduce((a, p) => a + p[1], 0) / pares.length;
    let sxy = 0, sx = 0, sy = 0;
    for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2; }
    corr = sx && sy ? sxy / Math.sqrt(sx * sy) : null;
  }

  let lead = 0;
  while (lead < esp.length && esp[lead] == null) lead++;
  const comNumero = esp.filter(v => v != null).length;

  return {
    total: soma, acum, metadeIdx, metadeFrac: mpm.length ? metadeIdx / mpm.length : 0,
    corr, mediana, maxMpm, maxIdx: mpm.indexOf(maxMpm), jitter,
    hist: cont.map((n, i) => ({ faixa: FAIXAS[i], n, forte: i >= 3 })),
    lead, semResposta: esp.length - comNumero - lead, comNumero,
  };
}
