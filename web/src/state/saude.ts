import { useEffect, useState } from "react";
import { api } from "../api/client";

export type Saude = {
  api: string;
  vigia: { de_pe: boolean; desde: string | null; ultimo_ciclo: string | null; parando: boolean; ligando: boolean };
  coletas_ativas: number;
  coletas: { id: string; titulo: string | null; desde: string; canal: string; unidades: number; ultima_hora: number }[];
  ultima_chamada_youtube: string | null;
};

// Um estado só para o app inteiro: o cabeçalho, a home e a tela da live
// mostram o mesmo vigia. Relê sozinho enquanto alguém estiver olhando.
const RELER_MS = 15_000;
let atual: Saude | null = null;
const ouvintes = new Set<(s: Saude | null) => void>();
let timer: number | undefined;

function publicar(s: Saude | null) {
  atual = s;
  ouvintes.forEach(f => f(s));
}

/** Relê agora. Sem resposta da API, não afirma que o vigia está de pé. */
export function recarregarSaude() {
  return api<Saude>("/operacao/saude").then(publicar, () => publicar(null));
}

/** Troca o estado com a resposta de ligar/desligar, sem esperar o próximo ciclo. */
export function definirSaude(s: Saude) {
  publicar(s);
}

export function useSaude() {
  const [s, setS] = useState(atual);
  useEffect(() => {
    ouvintes.add(setS);
    if (ouvintes.size === 1) {
      recarregarSaude();
      timer = window.setInterval(recarregarSaude, RELER_MS);
    }
    return () => {
      ouvintes.delete(setS);
      if (!ouvintes.size) window.clearInterval(timer);
    };
  }, []);
  return s;
}
