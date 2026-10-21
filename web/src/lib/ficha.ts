// Formato e regras de comparação da ficha de métricas (espelho de api/ficha.py).
import type { Ficha, FormatoMetrica, MetricaDef } from "../api/types";
import { brl, duracao, n } from "./format";

export function valorMetrica(v: number | null | undefined, f: FormatoMetrica): string {
  if (v == null) return "—";
  switch (f) {
    case "int": return n(v);
    case "dec1": return n(v, 1);
    case "pct": return n(v) + "%";
    case "pct1": return n(v, 1) + "%";
    case "pct2": return n(v, 2) + "%";
    case "x": return n(v, v >= 10 ? 0 : 1) + "×";
    case "brl": return brl(v);
    case "dur": return duracao(v);
  }
}

/** Por que o valor desta live não entra no ranking; null = entra. */
export function foraDoRanking(f: Ficha, m: MetricaDef): string | null {
  if (m.escopo === "contexto") return "contexto, não ranqueia";
  if (f.curta) return "coleta de menos de 15 min";
  if (m.escopo === "total" && f.parcial) return "coleta parcial: o total é da janela coletada";
  if (m.escopo === "video" && f.trecho) return "número do vídeo inteiro, não do trecho";
  if (f.valores[m.chave] == null) return "sem dado";
  return null;
}

/** Cores das lives na comparação lado a lado (até 4). */
export const CORES_COMPARAR = ["var(--aud)", "var(--msg)", "var(--part)", "var(--amb)"];
