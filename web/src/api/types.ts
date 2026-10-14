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

// ---- seções da aba Dados (api/secoes.py). Campo null = sem dado.

export type SecMomentos = {
  recordes: {
    audiencia: { valor: number; t: number } | null;
    chat: { valor: number; t: number } | null;
    apoio: { valor_brl: number; t: number; t_fim: number } | null;
  };
  mediana_mpm: number | null;
  lista: { t: number; tipo: Momento["tipo"]; magnitude: number; msgs: number | null; vezes_mediana: number | null; espectadores: number | null; superchats: number; palavras: string[] }[];
};

export type SecConversa = {
  disponivel: boolean;
  metodo?: string;
  mensagens?: number;
  tom?: { positivo: number; neutro: number; negativo: number };
  serie_tom?: { t: number; n: number; pos: number | null; neu: number | null; neg: number | null }[];
  perguntas?: { n: number; pct: number };
  idiomas?: { idioma: "pt" | "es" | "en"; pct: number }[];
  idioma_indeterminado?: number;
  marcas?: { marca: string; n: number; primeira_t: number }[];
  palavras?: { p: string; n: number }[];
  emojis?: { e: string; n: number }[];
  perguntas_top?: { q: string; n: number }[];
};

export type SecModeracao = {
  eventos: number; apagadas: number; pct_apagadas: number | null; suspensoes: number; suspensao_media_s: number | null;
  banimentos: number; moderadores: number; serie5: { t: number; n: number }[];
  pico?: { t: number; t_fim: number; n: number };
  quem?: { autor: string; apagou: number; suspendeu: number; baniu: number }[];
};

export type SecPessoas = {
  disponivel: boolean;
  pessoas: number; mensagens: number; msgs_por_pessoa: number; mediana_msgs: number;
  uma_vez: { n: number; pct: number };
  voltaram: { n: number; pct: number; video_id: string; inicio: string } | null;
  composicao: { tipo: "membros" | "moderadores" | "dono" | "verificados" | "demais"; pessoas: number; msgs: number }[];
  faixas: { faixa: string; n: number }[];
  top10pct: { pessoas: number; pct_msgs: number };
  top?: { autor: string; msgs: number; selo: "membro" | "moderador" | "dono" | null }[];
};

export type SecApoio = {
  total_brl: number; superchats: number; superstickers: number; pessoas_pagantes: number; sem_cambio: number;
  novos_membros: number; niveis: { nivel: string | null; n: number }[];
  presentes: { assinaturas: number; pessoas: number };
  marcos: { n: number; max_meses: number | null };
  serie5: { t: number; brl: number }[];
  faixas: { faixa: string; n: number }[];
  moedas: { moeda: string; n: number; brl: number }[];
  apoiadores?: { autor: string; brl: number; qtd: number; msg: string | null }[];
  presenteadores?: { autor: string; n: number }[];
};

export type SecComunidade = {
  enquetes: { t: number | null; pergunta: string | null; status?: string; opcoes: { texto: string; votos: number | null }[]; total: number | null; detalhe: boolean }[];
};

export type SecVideo = {
  horarios: { publicado: string | null; agendada: string | null; inicio: string | null; fim: string | null; duracao_s: number | null; atraso_s: number | null; antecedencia_s: number | null };
  likes: (number | null)[] | null; t: number[] | null; likes_hoje: number | null;
  mudancas: { t: number | null; quando: string | null; tipo: string; de: string; para: string; depois_da_live: boolean }[];
  mudancas_monitoradas: boolean;
  inscritos: { antes: number | null; depois: number | null; hoje: number | null; hoje_em: string | null };
  ficha: { k: string; v: string | null }[] | null;
};

export type SecDepois = {
  pontos: { rotulo: string; views: number | null; coletado_em: string | null }[];
  fim_coleta: { views: number; coletado_em: string } | null;
  hoje: { views: number; likes: number; comentarios: number; coletado_em: string } | null;
  comentarios: number | null;
  acompanhado: boolean;
  top_comentarios?: { autor: string; texto: string; likes: number; respostas: number }[];
};

export type SecComparacao = {
  lives: { id: string; inicio: string; titulo: string; views: number | null; likes: number | null; comentarios: number | null; duracao_s: number | null; atraso_s: number | null; coleta: "coletada" | "perdida" | "não vigiada"; esta: boolean }[];
  contadores_em: string | null;
  concorrencia: { quando: string; total: number; lista: { canal: string; titulo: string; espectadores: number; esta: boolean }[] } | null;
};

// ---- relatório final, publicação

export type Dossie = {
  gerado_em: string; modelo: string;
  veredito: string; veredito_sub: string;
  insights: { titulo: string; texto: string; base: string }[];
  recomendacao: string;
  achados: { rotulo: string; valor: string; unidade: string; cor: "aud" | "msg" | "part" | "ink3"; bar: number; texto: string }[];
  entrada: string[]; nao_entrada: string[];
};
export type EstadoDossie = { gerado: boolean; dossie: Dossie | null };

export type Publicacao = { canal_slug: string; slug: string; emitido_em: string; caminho: string };
export type EstadoPublicacao = { publicada: Publicacao | null; proposta: { canal_slug: string; slug: string; caminho: string } };

export type RelatorioPublico = {
  canal: { nome: string; handle: string | null; foto: string | null };
  titulo: string; inicio: string | null; duracao_s: number | null; janela_coletada_s: number | null;
  cobertura: number | null; acompanhada: number | null;
  pico: number | null; pessoas: number; mensagens: number;
  momentos: Momento[];
  serie: { t: number[]; esp: (number | null)[]; part: (number | null)[] } | null;
  comunidade: SecComunidade;
  dossie: Omit<Dossie, "entrada" | "nao_entrada"> | null;
  publicado: { em: string; autor_nome: string | null; instituicao: string | null; orcid: string | null };
  url_video: string;
};
