// Contrato dos endpoints. Espelha o que api/ devolve.
// Datas chegam em ISO 8601 UTC; a formatação para o fuso da conta é do front.

export type Plano = {
  nome: string;
  limite_slots: number;
  em_uso: number;
};

// perdida: devia ser coletada e não foi (falha). nao_escolhida: ninguém escolheu coletar (decisão).
export type EstadoLive = "no_ar" | "coletada" | "parcial" | "agendada" | "perdida" | "nao_escolhida" | "privada" | "fora_do_link";

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
  coletado: Coletado;               // e quando
  acompanhada: number | null;       // % da transmissão inteira que a janela cobriu
  pico: number | null;
  mensagens: number;
  detectada_em: string | null;
  ao_vivo: boolean;   // no ar segundo o YouTube; com estado "perdida", sem coletor
  coletar: boolean;                 // entra na coleta (escolha da live ou modo do canal)
  coletar_escolha: boolean | null;  // escolha feita nesta live; null = segue o canal
  // trecho de um vídeo que carregou mais de uma transmissão (id "V~n");
  // ini/fim em segundos desde o início do vídeo, fim null = até o fim
  trecho: { n: number; total: number; video_id: string; ini: number; fim: number | null } | null;
  nucleo: string;   // título sem "AO VIVO"/campeonato: identifica o mesmo jogo
  avulsa: boolean;  // colada pelo link, de canal que não é vigiado
  // o link (vídeo do YouTube) de onde vem e como ele começou: diz "quem é quem"
  // quando o canal reaproveita um link para outra transmissão
  link: LinkOrigem;
  // descartada pelo analista (reversível): fora da lista, comparações e totais.
  // do_video: o descarte foi do link inteiro, e vale para este trecho
  descartada: { motivo: string; em: string; do_video: boolean } | null;
  // o mesmo conteúdo em outro link do canal: "sem_coleta" = esta foi coletada e a outra não
  // (o chat de lá ficou de fora); "coletado" = esta não, mas a outra sim. Só na lista do canal.
  outro_link?: "sem_coleta" | "coletado" | null;
};

/** O que "Ler" trouxe de um link de live, antes de confirmar a coleta. */
export type LinkLido = {
  id: string;
  titulo: string | null;
  canal: string | null;
  canal_vigiado: boolean;
  agendada_para: string | null;
  no_ar: boolean;
  ja_marcada: boolean;
};

export type Ligada = { id: string; titulo: string | null; estado: EstadoLive; inicio?: string | null; fim?: string | null; trecho: LiveResumo["trecho"]; link?: LinkOrigem };

/** Um vídeo do YouTube (uma URL), pelo que ele era quando abriu. */
export type LinkOrigem = { video_id: string; comecou_como: string | null; inicio: string | null; fim: string | null };

/** Um link no mapa da página de transmissão, com os trechos que ele carregou. */
/** Quando a coleta esteve de pé: [início, fim] de cada intervalo sem buraco. null = sem medida. */
export type Coletado = [string, string][] | null;

export type LinkMapa = LinkOrigem & {
  trechos: { id: string; n: number | null; titulo: string | null; nucleo: string; estado: EstadoLive; inicio: string | null; fim: string | null; coletado: Coletado }[];
};

export type ModoColeta = "todas" | "escolhidas";

export type Canal = {
  id: string;
  nome: string;
  handle: string | null;
  foto: string | null;
  url: string;
  vigiado: boolean;
  vigiado_desde: string | null;
  agenda_lida_em: string | null;
  modo_coleta: ModoColeta;
  estado: "no_ar" | "fora_do_ar" | "aguardando";
  no_ar: LiveResumo | null;
  proxima: LiveResumo | null;
  ultima: LiveResumo | null;
  n_coletadas: number;
  n_perdidas: number;
  n_nao_escolhidas: number;
  cobertura_media: number | null;
  pico: number | null;
};

export type CanalDetalhe = Canal & { lives: LiveResumo[] };

export type ListaCanais = { limite_slots: number; em_uso: number; canais: Canal[] };

export type ItemAgenda = LiveResumo & { canal_id: string; canal: string };
export type CotaDia = {
  dia: string;              // data do dia de cota (meia-noite do Pacífico)
  lives: { id: string; titulo: string | null; canal: string; agendada_para: string; custo: number; fim_estimado: string }[];
  estimado: number; gasto: number; agenda: number; total: number; limite: number;
  pico_simultaneas: number; pico_em: string | null;
};
export type Agenda = { proximas: ItemAgenda[]; recentes: ItemAgenda[]; cota: CotaDia[] };

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
  mesmo_jogo: Ligada[];   // o mesmo conteúdo em outra transmissão do canal
  trechos: Ligada[];      // os trechos do mesmo vídeo, inclusive este
  links: LinkMapa[];      // este link e os outros do canal em volta (mesmo conteúdo ou coleta no mesmo horário)
  // marcada que o YouTube parou de devolver, e o que a página do vídeo disse dela
  sumida: { motivo: "privada" | "indisponivel" | "fora_do_ar" | "no_ar" | "sem_resposta"; desde: string; visto_em: string } | null;
};

export type SubAba = "resumo" | "audiencia" | "chat" | "pessoas" | "contexto" | "qualidade" | "comparar";

export type Serie = { t: number[]; esp: (number | null)[]; mpm: number[]; part: (number | null)[]; cota: number[] };

export type Previsao = {
  unidades_hora: number; unidades_hora_medida: boolean;
  duracao_estimada_s: number; duracao_do_canal: boolean;
  custo: number; cota_dia: number; dia_cota: string | null;
  outras: { id: string; titulo: string; canal: string; agendada_para: string; custo: number }[];
  reservado: number;
  escolhida: boolean;  // não escolhida: custo é quanto custaria, fora do reservado
  fora: boolean;       // o YouTube tirou do ar, ou o conteúdo foi para outro link: não reserva cota
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
  video_inteiro: boolean;  // trecho: inscritos são do vídeo inteiro
  inscritos: { antes: number | null; depois: number | null; hoje: number | null; hoje_em: string | null };
  ficha: { k: string; v: string | null }[] | null;
};

export type SecDepois = {
  pontos: { rotulo: string; views: number | null; coletado_em: string | null; depois_s?: number | null }[];
  fim_coleta: { views: number; coletado_em: string } | null;
  hoje: { views: number; likes: number; comentarios: number; coletado_em: string } | null;
  comentarios: number | null;
  acompanhado: boolean;
  video_inteiro: boolean;  // trecho: os números são do vídeo inteiro
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
export type EstadoDossie = { gerado: boolean; dossie: Dossie | null; modelo_atual?: string };

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
  outro_link_sem_coleta: boolean;  // o mesmo conteúdo passou em outro link, sem coleta
};

// ---- ficha de métricas e comparação entre lives (api/ficha.py)

export type FormatoMetrica = "int" | "dec1" | "pct" | "pct1" | "pct2" | "x" | "brl" | "dur";
/** total: fora do ranking em coleta parcial · video: fora em trecho · contexto: não ranqueia */
export type EscopoMetrica = "total" | "taxa" | "video" | "contexto";
export type MetricaDef = { chave: string; grupo: string; rotulo: string; formato: FormatoMetrica; escopo: EscopoMetrica; descricao: string };

export type Ficha = {
  versao: string;
  id: string;
  titulo: string | null;
  nucleo: string;
  canal_id: string;
  canal: string;
  inicio: string | null;
  estado: EstadoLive;
  categoria_id: string | null;
  categoria: string | null;
  parcial: boolean;   // acompanhou menos de 90% da transmissão
  curta: boolean;     // coleta com menos de 15 min: fora de todo ranking
  trecho: boolean;    // trecho de um vídeo que carregou mais de uma transmissão
  trecho_n: number | null;
  link: { comecou_como: string | null; inicio: string | null } | null;  // só em trecho
  valores: Record<string, number | null>;
};

export type Recorte = "canal" | "categoria" | "todas";
export type Posicao = { posicao: number | null; empatadas: number; n: number; min: number; mediana: number; max: number; valores: { id: string; nome: string | null; v: number }[] };
type FichaBase = { metricas: MetricaDef[]; grupos: Record<string, string>; versao: string };
export type FichaLive = FichaBase & { ficha: Ficha; posicoes: Record<Recorte, { n: number; metricas: Record<string, Posicao> }> };
export type ListaFichas = FichaBase & { fichas: Ficha[] };
export type DetalheComparacao = {
  serie: { t: number[]; esp: (number | null)[]; mpm: number[]; part: (number | null)[] } | null;
  momentos: { t: number; tipo: string; magnitude: number }[];
  pessoas: { faixas: { faixa: string; n: number }[]; top10pct: { pessoas: number; pct_msgs: number }; uma_vez: { n: number; pct: number }; pessoas: number } | null;
  depois: { pontos: { rotulo: string; views: number | null }[]; video_inteiro: boolean };
  enquetes: { t: number | null; total: number | null }[];
};
export type Comparacao = FichaBase & { fichas: Ficha[]; detalhes: Record<string, DetalheComparacao> };
