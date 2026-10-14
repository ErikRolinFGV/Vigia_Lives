import { useApi } from "../api/client";

export type Saude = {
  api: string;
  vigia: { de_pe: boolean; desde: string | null; ultimo_ciclo: string | null };
  coletas_ativas: number;
  ultima_chamada_youtube: string | null;
};

/** Estado do vigia. Sem resposta da API, não afirma que está de pé. */
export function useSaude() {
  const { dados } = useApi<Saude>("/operacao/saude");
  return dados;
}
