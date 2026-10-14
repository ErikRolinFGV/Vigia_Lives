// Gráficos de série temporal. SVG puro, sem biblioteca: viewBox de 1000 de
// largura, como no protótipo.
import type { ReactNode } from "react";
import { dArea, dBars, dLine, gbox, nice, pts, px, py, type Geo } from "../lib/chart";
import { hhmm, n as fmtN } from "../lib/format";

type Serie = (number | null)[];

export type Hover = { idx: number };

function Eixos({ g, max, kind, times, every, fs, showY = true }: {
  g: Geo; max: number; kind: "int" | "pct"; times: number[]; every: number; fs: number; showY?: boolean;
}) {
  const grid = [0, 1, 2, 3, 4].map(k => {
    const v = (max * k) / 4, y = py(v, max, g);
    return { y, label: kind === "pct" ? fmtN(v * 100, 2) + "%" : fmtN(v) };
  });
  const xt: { x: number; label: string }[] = [];
  for (let i = 0; i < times.length; i += every) xt.push({ x: px(i, times.length, g), label: hhmm(times[i]) });
  const txt = { fontSize: fs, fontFamily: "IBM Plex Mono, monospace", style: { fill: "var(--ink4)" } } as const;
  return (
    <g>
      {grid.map((gr, i) => <line key={"g" + i} x1={g.L} x2={g.L + g.W} y1={gr.y} y2={gr.y} strokeWidth={1} style={{ stroke: "var(--grid)" }} />)}
      {showY && grid.map((gr, i) => <text key={"y" + i} x={g.L - 8} y={gr.y + 4} textAnchor="end" {...txt}>{gr.label}</text>)}
      {xt.map((x, i) => <text key={"x" + i} x={x.x} y={g.H - 6} textAnchor="middle" {...txt}>{x.label}</text>)}
    </g>
  );
}

export type Marca = { x: number; stroke: string; w: number };

/**
 * Painel de série: linha+área ou barras. `geo` é a fonte que dimensiona a
 * geometria; painéis com o mesmo `geo` alinham a linha de hover.
 */
export function SerieChart({ vals, times, H, tipo, cor, kind = "int", every, fs = 26, geo = 26, hoverIdx = -1, marcas, cabeca, extra, animar = true }: {
  vals: Serie; times: number[]; H: number; tipo: "linha" | "barras"; cor: string; kind?: "int" | "pct";
  every: number; fs?: number; geo?: number; hoverIdx?: number;
  marcas?: (g: Geo) => Marca[];
  cabeca?: boolean;      // ponto pulsando na ponta da curva (tela ao vivo)
  extra?: (g: Geo, max: number) => ReactNode;
  animar?: boolean;
}) {
  const g = gbox(H, fs, geo);
  const validos = vals.filter((v): v is number => v != null);
  const max = nice(validos.length ? Math.max(...validos) : 1);
  const segs = pts(vals, max, g);
  const hx = hoverIdx >= 0 ? px(hoverIdx, vals.length, g) : 0;
  const hv = hoverIdx >= 0 ? vals[hoverIdx] : null;
  const ultimo = segs.length ? segs[segs.length - 1][segs[segs.length - 1].length - 1] : null;
  const anim = (a: string) => (animar ? a : "none");

  return (
    <svg viewBox={`0 0 1000 ${H}`} style={{ display: "block", width: "100%", height: "auto" }} role="img">
      {marcas?.(g).map((m, i) => <line key={i} x1={m.x} x2={m.x} y1={14} y2={g.bot} strokeWidth={m.w} style={{ stroke: m.stroke }} />)}
      {tipo === "linha" ? (
        <>
          <path d={dArea(segs, g)} fillOpacity={0.1} style={{ fill: cor, animation: anim("fadeIn 1.1s ease-out .3s both") }} />
          <path d={dLine(segs)} fill="none" strokeWidth={2.4} pathLength={1} strokeDasharray={animar ? 1 : undefined}
            style={{ stroke: cor, animation: anim("drawIn 1.6s cubic-bezier(.3,.7,.3,1) both") }} />
        </>
      ) : (
        <path d={dBars(vals, max, g)} style={{ fill: cor, animation: anim("growY .8s cubic-bezier(.2,.8,.2,1) both"), transformBox: "fill-box", transformOrigin: "50% 100%" }} />
      )}
      {cabeca && ultimo && (
        <>
          <circle cx={ultimo[0]} cy={ultimo[1]} r={5} opacity={0.5} style={{ fill: cor, animation: "ring 2s ease-out infinite", transformBox: "fill-box", transformOrigin: "50% 50%" }} />
          <circle cx={ultimo[0]} cy={ultimo[1]} r={5} style={{ fill: cor }} />
        </>
      )}
      {extra?.(g, max)}
      <line x1={hx} x2={hx} y1={14} y2={g.bot} strokeWidth={1} opacity={hoverIdx >= 0 ? 1 : 0} style={{ stroke: "var(--ink)" }} />
      {tipo === "linha" && hv != null && <circle cx={hx} cy={py(hv, max, g)} r={4.5} style={{ fill: cor }} />}
      <Eixos g={g} max={max} kind={kind} times={times} every={every} fs={fs} />
    </svg>
  );
}

/** Barras verticais em HTML (histogramas e séries de 5 min), como no protótipo. */
export function BarrasHtml({ itens, altura = 150 }: {
  itens: { rotulo?: string; valor?: string; h: string; fill: string; stroke?: string; ink?: string; tip?: string }[];
  altura?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minHeight: altura }}>
      {itens.map((b, i) => (
        <div key={i} title={b.tip} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
          {b.valor != null && <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 13, fontWeight: 700, color: b.ink }}>{b.valor}</div>}
          <div style={{ width: "100%", height: b.h, background: b.fill, border: b.stroke ? `1px solid ${b.stroke}` : undefined, borderRadius: "5px 5px 0 0", animation: "growY .7s cubic-bezier(.2,.8,.2,1) both", transformOrigin: "50% 100%" }} />
          {b.rotulo != null && <div className="mono" style={{ fontSize: 11, color: "var(--ink3)", textAlign: "center" }}>{b.rotulo}</div>}
        </div>
      ))}
    </div>
  );
}
