// Formatação pt-BR e os helpers de nome do protótipo (apelido, slug, hhmm).

/** Número pt-BR; null vira "—" (campo sem dado nunca vira estimativa). */
export function n(v: number | null | undefined, casas = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function pct(v: number | null | undefined, casas = 1): string {
  return v == null ? "—" : n(v, casas) + "%";
}

/** Segundos → "1:02" (horas:minutos), como no eixo dos gráficos. */
export function hhmm(s: number): string {
  return Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0");
}

/** Duração legível: "1h51", "33 min". */
export function duracao(s: number | null | undefined): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Siglas que o título traz em caixa alta e devem continuar assim.
const SIGLAS = new Set(["FIFA", "CNN", "PSG", "LDU", "VAR", "RB", "UEFA", "CBF", "NBA", "NFL", "UFC", "EUA", "CPI", "STF", "PT", "PL"]);

/**
 * O título do YouTube é longo e cheio de qualificador; o que identifica a
 * transmissão para uma pessoa é o confronto ou a fase. Porte de apelido().
 */
export function apelido(t: string | null | undefined, max = 26): string {
  if (!t) return "—";
  let s = String(t).split("|")[0].replace(/^\s*(AO VIVO|JOGO COMPLETO)\s*(\([^)]*\))?\s*:\s*/i, "").trim();
  s = s.replace(/\s+X\s+/i, " × ");
  const low = ["de", "da", "do", "das", "dos", "e"];
  s = s.toLowerCase().split(/\s+/).map((w, i) => {
    if (w === "×") return w;
    if (SIGLAS.has(w.toUpperCase())) return w.toUpperCase();
    if (i > 0 && low.includes(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
  return s.length > max ? s.slice(0, max - 1).trim() + "…" : s;
}

export function slug(s: string): string {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/×/g, "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ---- datas no fuso da conta

function partes(iso: string, tz: string) {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => f.find(p => p.type === t)?.value ?? "";
  return { d: g("day"), m: g("month"), a: g("year"), h: g("hour"), min: g("minute") };
}

/** "08/09 09:00" */
export function dataHora(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  const p = partes(iso, tz);
  return `${p.d}/${p.m} ${p.h}:${p.min}`;
}

/** "08/09/2026" */
export function dataCurta(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  const p = partes(iso, tz);
  return `${p.d}/${p.m}/${p.a}`;
}

/** "08 set 2026" */
export function dataLonga(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const p = partes(iso, tz);
  return `${p.d} ${meses[Number(p.m) - 1]} ${p.a}`;
}

/** "em 21 h", "em 1 d 07 h", "em 40 min" — contagem regressiva da agenda. */
export function falta(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "—";
  const s = (new Date(iso).getTime() - agora) / 1000;
  if (s <= 0) return "atrasada";
  if (s < 3600) return `em ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `em ${Math.round(s / 3600)} h`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return `em ${d} d ${String(h).padStart(2, "0")} h`;
}

/** "há 6 d 04 h", "há 12 min" */
export function ha(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return "—";
  const s = (agora - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return `há ${d} d ${String(h).padStart(2, "0")} h`;
}

/**
 * Título limpo para listas: sem "AO VIVO:", com os trechos separados por
 * "·" e sem caixa alta. "AO VIVO: OITAVAS | COPA SUB-20" → "Oitavas · Copa Sub-20".
 */
export function nomeLive(t: string | null | undefined, trechos = 2): string {
  if (!t) return "—";
  return String(t).split("|").map(p => p.trim()).filter(Boolean).slice(0, trechos)
    .map(p => apelido(p, 200)).join(" · ");
}
