import type { CSSProperties, ReactNode } from "react";
import { useEsc } from "./ContaDrawer";

/** Modal centralizado: clique fora ou Esc fecha. */
export function Modal({ fechar, largura = 520, children, estilo }: {
  fechar: () => void; largura?: number; children: ReactNode; estilo?: CSSProperties;
}) {
  useEsc(fechar);
  return (
    <div onClick={fechar} role="presentation"
      style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "fadeIn .2s ease-out both" }}>
      <div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        style={{ width: `min(${largura}px, 100%)`, maxHeight: "calc(100vh - 48px)", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "26px 28px 24px", boxShadow: "0 12px 40px rgba(23,20,15,0.16)", animation: "riseIn .2s ease-out both", ...estilo }}>
        {children}
      </div>
    </div>
  );
}

export const btnCancelar: CSSProperties = {
  fontSize: 14, fontWeight: 600, color: "var(--ink2)", border: "1px solid var(--line2)", background: "transparent",
  borderRadius: 9, padding: "10px 16px", cursor: "pointer",
};

export function btnAcao(ativo: boolean, cor = "var(--accent)"): CSSProperties {
  return {
    fontSize: 14, fontWeight: 700, color: cor === "var(--accent)" ? "var(--onAccent)" : "#FFFFFF", border: 0,
    background: ativo ? cor : "var(--lineDash)", borderRadius: 9, padding: "10px 18px", cursor: ativo ? "pointer" : "default",
  };
}
