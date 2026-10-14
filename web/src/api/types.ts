// Contrato dos endpoints. Espelha os modelos Pydantic de api/.

export type Plano = {
  nome: string;
  limite_slots: number;
  em_uso: number;
};
