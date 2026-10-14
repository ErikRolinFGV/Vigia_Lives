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
  cobertura: number | null;         // % da janela do coletor sem buraco
  janela_coletada_s: number | null; // quanto tempo o coletor esteve ligado
  acompanhada: number | null;       // % da transmissão inteira que a janela cobriu
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

export type Momento = { t: number; tipo: "pico_chat" | "pico_audiencia" | "pico_doacao" | "queda_audiencia" | "virada_sentimento"; magnitude: number; url: string };

export type LiveDetalhe = Omit<LiveResumo, "numero" | "estado"> & {
  numero: number | null;
  estado: EstadoLive | null;
  canal: { id: string; nome: string; handle: string | null };
  pessoas: number;
  mensagens_live: number;
  cota_unidades: number;
  momentos: Momento[];
  tem_serie: boolean;
  tem_chat: boolean;
  subabas: SubAba[];
  url: string;
};

export type SubAba = "resumo" | "audiencia" | "chat" | "pessoas" | "contexto" | "qualidade";

export type Serie = { t: number[]; esp: (number | null)[]; mpm: number[]; part: (number | null)[]; cota: number[] };

export type Previsao = {
  unidades_hora: number; unidades_hora_medida: boolean;
  duracao_estimada_s: number; duracao_do_canal: boolean;
  custo: number; cota_dia: number; dia_cota: string | null;
  outras: { id: string; titulo: string; canal: string; agendada_para: string; custo: number }[];
  reservado: number;
};
