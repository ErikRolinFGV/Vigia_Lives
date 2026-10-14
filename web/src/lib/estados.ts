import type { EstadoLive } from "../api/types";

export type Chip = { label: string; bg: string; border: string; ink: string; accent: string };

// Cores de estado do handoff (chip bg / borda / texto / acento da linha).
export const CHIP: Record<EstadoLive, Chip> = {
  no_ar: { label: "NO AR", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", accent: "var(--red)" },
  coletada: { label: "COLETADA", bg: "var(--okT)", border: "var(--okLine)", ink: "var(--okInk)", accent: "var(--ok)" },
  parcial: { label: "PARCIAL", bg: "var(--ambT)", border: "var(--ambLine)", ink: "var(--ambInk)", accent: "var(--amb)" },
  perdida: { label: "PERDIDA", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", accent: "var(--red)" },
  agendada: { label: "AGENDADA", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)", accent: "var(--line2)" },
};

/** Selo pequeno do breadcrumb. */
export const TAG: Record<EstadoLive, { t: string; bg: string; bd: string; ink: string; dot?: string }> = {
  no_ar: { t: "ao vivo", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)", dot: "var(--red)" },
  coletada: { t: "coletada", bg: "var(--okT)", bd: "var(--okLine)", ink: "var(--okInk)" },
  parcial: { t: "parcial", bg: "var(--ambT)", bd: "var(--ambLine)", ink: "var(--ambInk)" },
  perdida: { t: "perdida", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)" },
  agendada: { t: "agendada", bg: "var(--s3)", bd: "var(--line2)", ink: "var(--ink2)" },
};
