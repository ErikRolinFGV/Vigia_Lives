// Blocos que as seções da live repetem: KPI, título de seção, painel.
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useState } from "react";
import { indiceHover } from "../lib/chart";

export type KpiDado = { k: string; v: string; n: string; c?: string; url?: string };

export function Kpi({ k, v, n, c = "var(--ink)", url }: KpiDado) {
  const corpo = (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 20px", height: "100%", animation: "riseIn .42s cubic-bezier(.2,.8,.2,1) both", transition: "border-color .18s ease, transform .18s ease" }}
      className={url ? "kpi-link" : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 7 }}>
        <span>{k}</span>{url && <span style={{ textTransform: "none", letterSpacing: 0 }}>↗</span>}
      </div>
      <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 31, lineHeight: 1, fontWeight: 700, letterSpacing: "-.025em", color: c }}>{v}</div>
      <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6 }}>{n}</div>
    </div>
  );
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{corpo}</a> : corpo;
}

export function Kpis({ itens, min = 180 }: { itens: KpiDado[]; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 16 }}>
      {itens.map(k => <Kpi key={k.k} {...k} />)}
    </div>
  );
}

/** Título de seção: 19/800 e uma linha até a borda. */
export function Secao({ titulo, primeira = false }: { titulo: string; primeira?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: primeira ? 0 : 20 }}>
      <span style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>{titulo}</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}

type Tom = "aud" | "msg" | "part" | "red" | "neutro";
const TONS: Record<Tom, [string, string]> = {
  aud: ["var(--audT)", "var(--audLine)"],
  msg: ["var(--msgT)", "var(--msgLine)"],
  part: ["var(--partT)", "var(--partLine)"],
  red: ["var(--redT)", "var(--redLine)"],
  neutro: ["var(--surface)", "var(--line)"],
};

export function Painel({ tom = "neutro", children, estilo, titulo, sub, direita }: {
  tom?: Tom; children?: ReactNode; estilo?: CSSProperties; titulo?: ReactNode; sub?: ReactNode; direita?: ReactNode;
}) {
  const [bg, bd] = TONS[tom];
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "18px 20px", minWidth: 0, ...estilo }}>
      {(titulo || direita) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: sub ? 0 : 10 }}>
          <div>
            {titulo && <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>{titulo}</div>}
            {sub && <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 2, marginBottom: 12 }}>{sub}</div>}
          </div>
          {direita}
        </div>
      )}
      {children}
    </div>
  );
}

/** Nota de rodapé de um painel, com a borda de cima na cor do painel. */
export function NotaPainel({ children, tom = "var(--div)" }: { children: ReactNode; tom?: string }) {
  return <div style={{ fontSize: 12.5, color: "var(--ink2)", borderTop: `1px solid ${tom}`, paddingTop: 11, marginTop: 12, textWrap: "pretty" }}>{children}</div>;
}

export function Grade({ min = 320, gap = 12, children }: { min?: number; gap?: number; children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap }}>{children}</div>;
}

/** Barra horizontal com rótulo e valor (palavras, idiomas, faixas). */
export function BarraH({ rotulo, w, valor, cor, colRotulo = 100, colValor = 40 }: {
  rotulo: ReactNode; w: string; valor: ReactNode; cor: string; colRotulo?: number; colValor?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${colRotulo}px minmax(0,1fr) ${colValor}px`, gap: 12, alignItems: "center", fontSize: 13.5 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
      <div style={{ height: 8, background: "var(--track)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: w, height: "100%", background: cor, borderRadius: 4, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <b className="tnum" style={{ textAlign: "right" }}>{valor}</b>
    </div>
  );
}

/** Aviso de campo sem dado: diz por que faltou, nunca estima. */
export function SemDado({ titulo, texto }: { titulo: string; texto: ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px dashed var(--lineDash)", borderRadius: 14, padding: "26px 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 13.5, color: "var(--ink3)", maxWidth: "58ch", margin: "0 auto", textWrap: "pretty" }}>{texto}</div>
    </div>
  );
}

/**
 * Hover sincronizado: o mesmo índice de janela vale para todos os painéis que
 * dividem o eixo de tempo. Cada área de gráfico reporta a posição relativa
 * ao próprio SVG.
 */
export function useHoverSync(n: number, geo = 26) {
  const [idx, setIdx] = useState(-1);
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = indiceHover((e.clientX - r.left) / r.width, n, geo);
    if (i !== idx) setIdx(i);
  };
  const onLeave = () => setIdx(-1);
  return { idx, area: { onMouseMove: onMove, onMouseLeave: onLeave } };
}
