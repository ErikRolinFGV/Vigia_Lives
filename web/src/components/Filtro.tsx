// Filtro de transmissões por situação: o que está sendo coletado, o que já
// foi, o que vai ser e o que ficou de fora.
import type { LiveResumo } from "../api/types";

export type Grupo = "todas" | "coletando" | "coletadas" | "vao" | "nao_escolhidas" | "perdidas";

export const NOMES_GRUPO: Record<Grupo, string> = {
  todas: "Todas",
  coletando: "Coletando agora",
  coletadas: "Coletadas",
  vao: "Vão ser coletadas",
  nao_escolhidas: "Não escolhidas",
  perdidas: "Perdidas",
};

export function grupo(l: Pick<LiveResumo, "estado" | "coletar">): Exclude<Grupo, "todas"> {
  if (l.estado === "no_ar") return "coletando";
  if (l.estado === "coletada" || l.estado === "parcial") return "coletadas";
  if (l.estado === "perdida") return "perdidas";
  if (l.estado === "agendada") return l.coletar ? "vao" : "nao_escolhidas";
  return "nao_escolhidas";
}

/** Chips com contagem; grupos vazios somem (menos "Todas" e o ativo). */
export function Filtros({ itens, ativo, mudar, grupos }: {
  itens: Pick<LiveResumo, "estado" | "coletar">[]; ativo: Grupo; mudar: (g: Grupo) => void; grupos: Grupo[];
}) {
  const conta = (g: Grupo) => (g === "todas" ? itens.length : itens.filter(l => grupo(l) === g).length);
  return (
    <div role="radiogroup" aria-label="Filtrar transmissões" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {grupos.filter(g => g === "todas" || g === ativo || conta(g) > 0).map(g => {
        const sel = g === ativo;
        return (
          <button key={g} type="button" role="radio" aria-checked={sel} onClick={() => mudar(g)}
            style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "5px 11px", cursor: "pointer",
              border: `1px solid ${sel ? "var(--lineH)" : "var(--line2)"}`, background: sel ? "var(--surface)" : "transparent",
              color: sel ? "var(--ink)" : "var(--ink3)", boxShadow: sel ? "0 1px 3px rgba(23,20,15,.1)" : "none" }}>
            {NOMES_GRUPO[g]} <span className="tnum" style={{ color: "var(--ink4)", marginLeft: 3 }}>{conta(g)}</span>
          </button>
        );
      })}
    </div>
  );
}
