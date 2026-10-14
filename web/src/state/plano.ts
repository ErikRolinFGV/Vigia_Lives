import { useApi } from "../api/client";
import type { Plano } from "../api/types";

/** Slots do plano de pesquisa. Sem API, assume o padrão do handoff (10). */
export function usePlano() {
  const { dados, recarregar } = useApi<Plano>("/plano");
  const limite = dados?.limite_slots ?? 10;
  const emUso = dados?.em_uso ?? 0;
  const fr = emUso / limite;
  return {
    limite, emUso, recarregar,
    texto: `${emUso} de ${limite} slots em uso`,
    pct: Math.round(fr * 100) + "%",
    cor: fr >= 0.8 ? "var(--red)" : fr >= 0.5 ? "var(--amb)" : "var(--ok)",
    podeAdd: emUso < limite,
  };
}
