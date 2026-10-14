// Contrato dos endpoints. Espelha o que api/ devolve.
// Datas chegam em ISO 8601 UTC; a formatação para o fuso da conta é do front.

export type Plano = {
  nome: string;
  limite_slots: number;
  em_uso: number;
};

export type EstadoLive = "no_ar" | "coletada" | "parcial" | "agendada" | "perdida";

export type LiveResumo = {
  id: string;
  numero: number;
  estado: EstadoLive;
  titulo: string | null;
  agendada_para: string | null;
  inicio: string | null;
  fim: string | null;
  coleta_inicio: string | null;
  coleta_fim: string | null;
  duracao_s: number | null;
  cobertura: number | null;
  pico: number | null;
  mensagens: number;
  detectada_em: string | null;
  ao_vivo: boolean;   // no ar segundo o YouTube; com estado "perdida", sem coletor
};

export type Canal = {
  id: string;
  nome: string;
  handle: string | null;
  foto: string | null;
  url: string;
  vigiado: boolean;
  vigiado_desde: string | null;
  agenda_lida_em: string | null;
  estado: "no_ar" | "fora_do_ar" | "aguardando";
  no_ar: LiveResumo | null;
  proxima: LiveResumo | null;
  ultima: LiveResumo | null;
  n_coletadas: number;
  n_perdidas: number;
  cobertura_media: number | null;
  pico: number | null;
};

export type CanalDetalhe = Canal & { lives: LiveResumo[] };

export type ListaCanais = { limite_slots: number; em_uso: number; canais: Canal[] };

export type ItemAgenda = LiveResumo & { canal_id: string; canal: string };
export type Agenda = { proximas: ItemAgenda[]; recentes: ItemAgenda[] };
