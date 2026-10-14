// Sessão do MVP. Não existe usuário no backend: o login é de demonstração e
// conta, preferências e tema vivem no navegador (localStorage).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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

type Sessao = {
  logado: boolean;
  conta: Conta;
  tema: Tema;
  entrar: (email: string) => void;
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
  const [estado, setEstado] = useState(() => ler(CHAVE, { logado: false, conta: contaPadrao }));
  const [tema, setTemaState] = useState<Tema>(lerTema);

  useEffect(() => { aplicarTema(tema); gravar(CHAVE_TEMA, tema); }, [tema]);
  useEffect(() => { gravar(CHAVE, estado); }, [estado]);

  const entrar = useCallback((email: string) =>
    setEstado(s => ({ logado: true, conta: { ...s.conta, email } })), []);
  const sair = useCallback(() => setEstado(s => ({ ...s, logado: false })), []);
  const atualizar = useCallback((p: Partial<Conta>) =>
    setEstado(s => ({ ...s, conta: { ...s.conta, ...p } })), []);
  const alternarTema = useCallback(() => setTemaState(t => (t === "claro" ? "escuro" : "claro")), []);

  const valor = useMemo<Sessao>(() => {
    const email = estado.conta.email || "pesquisa@vigia.app";
    const padrao = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const nomeConta = estado.conta.nome || padrao;
    const iniciais = nomeConta.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "V";
    return {
      logado: estado.logado,
      conta: { ...estado.conta, email },
      tema, entrar, sair, atualizar,
      setTema: setTemaState, alternarTema,
      nomeConta, iniciais,
    };
  }, [estado, tema, entrar, sair, atualizar, alternarTema]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): Sessao {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSessao fora do SessaoProvider");
  return s;
}
