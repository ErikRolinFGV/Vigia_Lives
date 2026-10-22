import type { EstadoLive } from "../api/types";

export type Chip = { label: string; bg: string; border: string; ink: string; accent: string };

// Cores de estado do handoff (chip bg / borda / texto / acento da linha).
export const CHIP: Record<EstadoLive, Chip> = {
  no_ar: { label: "NO AR", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", accent: "var(--red)" },
  coletada: { label: "COLETADA", bg: "var(--okT)", border: "var(--okLine)", ink: "var(--okInk)", accent: "var(--ok)" },
  parcial: { label: "PARCIAL", bg: "var(--ambT)", border: "var(--ambLine)", ink: "var(--ambInk)", accent: "var(--amb)" },
  perdida: { label: "PERDIDA", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", accent: "var(--red)" },
  agendada: { label: "AGENDADA", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)", accent: "var(--line2)" },
  // decisão, não falha: tom neutro, nunca o vermelho de "perdida"
  nao_escolhida: { label: "NÃO ESCOLHIDA", bg: "transparent", border: "var(--line2)", ink: "var(--ink3)", accent: "var(--line)" },
  // foi ao ar privada: sem chat público, não havia o que coletar
  privada: { label: "PRIVADA", bg: "transparent", border: "var(--line2)", ink: "var(--ink3)", accent: "var(--line)" },
};

/** Selo pequeno do breadcrumb. */
export const TAG: Record<EstadoLive, { t: string; bg: string; bd: string; ink: string; dot?: string }> = {
  no_ar: { t: "ao vivo", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)", dot: "var(--red)" },
  coletada: { t: "coletada", bg: "var(--okT)", bd: "var(--okLine)", ink: "var(--okInk)" },
  parcial: { t: "parcial", bg: "var(--ambT)", bd: "var(--ambLine)", ink: "var(--ambInk)" },
  perdida: { t: "perdida", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)" },
  agendada: { t: "agendada", bg: "var(--s3)", bd: "var(--line2)", ink: "var(--ink2)" },
  nao_escolhida: { t: "não escolhida", bg: "transparent", bd: "var(--line2)", ink: "var(--ink3)" },
  privada: { t: "privada", bg: "transparent", bd: "var(--line2)", ink: "var(--ink3)" },
};
