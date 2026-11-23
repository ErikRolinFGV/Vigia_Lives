// Sessão. Quem entra e o papel vêm da API (cookie da sessão, api/acessos.py);
// perfil, preferências e tema vivem no navegador (localStorage).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, SEM_SESSAO } from "../api/client";
import { aplicarTema, type Tema } from "../theme/tokens";

export type Notif = { noar: boolean; rel: boolean; perdida: boolean };

export type Conta = {
  email: string;
  nome: string | null;       // null = derivado do e-mail
  foto: string | null;       // data URL
  inst: string;
  orcid: string;
  tz: string;
  notif: Notif;
};

export type Acesso = { usuario: string; papel: "admin" | "usuario" | "visitante"; plano?: "gratuito" | "pesquisador" | "empresarial" | null; expira_em: string | null };

type Sessao = {
  logado: boolean;
  verificando: boolean;   // primeira pergunta à API ainda sem resposta
  acesso: Acesso | null;
  admin: boolean;         // vigia, Registro e contas; o resto vale por canal (pode_gerenciar)
  conta: Conta;
  tema: Tema;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => void;
  atualizar: (p: Partial<Conta>) => void;
  setTema: (t: Tema) => void;
  alternarTema: () => void;
  nomeConta: string;
  iniciais: string;
};

const CHAVE = "vigia.sessao.v1";
const CHAVE_TEMA = "vigia.tema";

const contaPadrao: Conta = {
  email: "",
  nome: null,
  foto: null,
  inst: "",
  orcid: "",
  tz: "America/Sao_Paulo",
  notif: { noar: false, rel: true, perdida: true },
};

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave);
    return v ? { ...padrao, ...JSON.parse(v) } : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, typeof valor === "string" ? valor : JSON.stringify(valor));
  } catch {
    /* modo privado ou storage cheio: a sessão segue só em memória */
  }
}

function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === "escuro" ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

const Ctx = createContext<Sessao | null>(null);

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState(() => ({ conta: ler(CHAVE, { conta: contaPadrao }).conta }));
  const [acesso, setAcesso] = useState<Acesso | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [tema, setTemaState] = useState<Tema>(lerTema);

  useEffect(() => { aplicarTema(tema); gravar(CHAVE_TEMA, tema); }, [tema]);
  useEffect(() => { gravar(CHAVE, estado); }, [estado]);

  // a sessão é o cookie: pergunta à API quem está entrando
  useEffect(() => {
    api<Acesso>("/auth/eu").then(setAcesso).catch(() => setAcesso(null)).finally(() => setVerificando(false));
    const caiu = () => setAcesso(null);
    window.addEventListener(SEM_SESSAO, caiu);
    return () => window.removeEventListener(SEM_SESSAO, caiu);
  }, []);

  const entrar = useCallback(async (usuario: string, senha: string) => {
    const a = await api<Acesso>("/auth/entrar", { method: "POST", body: JSON.stringify({ usuario, senha }) });
    setAcesso(a);
    setEstado(s => ({ conta: { ...s.conta, email: a.usuario } }));
  }, []);
  const sair = useCallback(() => {
    api("/auth/sair", { method: "POST" }).catch(() => { /* sem rede: o cookie expira sozinho */ });
    setAcesso(null);
  }, []);
  const atualizar = useCallback((p: Partial<Conta>) =>
    setEstado(s => ({ ...s, conta: { ...s.conta, ...p } })), []);
  const alternarTema = useCallback(() => setTemaState(t => (t === "claro" ? "escuro" : "claro")), []);

  const valor = useMemo<Sessao>(() => {
    const email = acesso?.usuario || estado.conta.email || "pesquisa@vigia.app";
    const padrao = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const nomeConta = estado.conta.nome || padrao;
    const iniciais = nomeConta.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "V";
    return {
      logado: !!acesso, verificando, acesso, admin: acesso?.papel === "admin",
      conta: { ...estado.conta, email },
      tema, entrar, sair, atualizar,
      setTema: setTemaState, alternarTema,
      nomeConta, iniciais,
    };
  }, [estado, acesso, verificando, tema, entrar, sair, atualizar, alternarTema]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSessao fora do SessaoProvider");
  return s;
}
