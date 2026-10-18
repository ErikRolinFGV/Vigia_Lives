import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useSessao } from "../state/sessao";
import { useSaude } from "../state/saude";
import { ContaBotao, Logo, ThemeToggle } from "./basicos";
import { ContaDrawer } from "./ContaDrawer";
import { AjudaDrawer } from "./AjudaDrawer";
import { VigiaModal } from "./ModaisCanal";
import u from "./ui.module.css";
import s from "./layout.module.css";

export type Crumb = {
  label: string;
  to?: string;           // ausente = item atual, não clicável
  num?: string;          // "#3"
  tag?: { t: string; bg: string; bd: string; ink: string; dot?: string };
};

type Shell = { setCrumbs: (c: Crumb[]) => void; abrirAjuda: () => void };
const ShellCtx = createContext<Shell | null>(null);

/** A página declara o próprio breadcrumb (depois de "Canais"). */
export function useCrumbs(crumbs: Crumb[]) {
  const ctx = useContext(ShellCtx);
  const chave = JSON.stringify(crumbs);
  useEffect(() => {
    ctx?.setCrumbs(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
}

export function useShell() {
  const ctx = useContext(ShellCtx);
  if (!ctx) throw new Error("useShell fora do AppLayout");
  return ctx;
}

/** Exige sessão; sem login, volta para /login. */
export function Protegido({ children }: { children: JSX.Element }) {
  const { logado } = useSessao();
  return logado ? children : <Navigate to="/login" replace />;
}

export function AppLayout() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [ajuda, setAjuda] = useState(false);
  const [conta, setConta] = useState(false);
  const nav = useNavigate();
  const [vigia, setVigia] = useState(false);
  const saude = useSaude();
  const v = saude?.vigia;
  const dePe = !!v?.de_pe;
  const nColetas = saude?.coletas?.length ?? 0;
  const rotulo = v?.parando ? "desligando…" : v?.ligando ? "ligando…"
    : dePe ? (nColetas ? `coletando ${nColetas} ${nColetas === 1 ? "live" : "lives"}` : "coleta de pé") : "vigia parado";
  const transicao = !!(v?.parando || v?.ligando);

  const todos: Crumb[] = [{ label: "Canais", to: crumbs.length ? "/yt/canais" : undefined }, ...crumbs];

  return (
    <ShellCtx.Provider value={{ setCrumbs, abrirAjuda: () => setAjuda(true) }}>
      <div className={s.app}>
        <header className={s.header}>
          <div className={s.headerIn}>
            <Link to="/plataformas" className={s.marca} aria-label="Vigia — trocar de plataforma">
              <Logo size={28} />
              <span className={s.wordmark}>vigia</span>
            </Link>

            <button type="button" className={u.pillBtn} onClick={() => nav("/plataformas")} title="Trocar de plataforma">
              <span className={u.dot} style={{ background: "#DC2A25" }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>YouTube</span>
              <span style={{ fontSize: 11, color: "var(--ink3)" }}>trocar</span>
            </button>

            <nav className={s.crumbs} aria-label="Navegação">
              {todos.map((c, i) => {
                const ult = i === todos.length - 1;
                return (
                  <div key={i} className={s.crumb} style={{ minWidth: ult ? 0 : "auto", flexShrink: ult ? 1 : 0 }}>
                    <span style={{ color: "var(--ink4)", flex: "0 0 auto" }}>/</span>
                    {c.num && <span className={s.crumbNum}>{c.num}</span>}
                    {c.to
                      ? <Link to={c.to} className={s.crumbLabel} style={{ color: "var(--ink)" }}>{c.label}</Link>
                      : <span className={s.crumbLabel} style={{ color: "var(--ink3)" }} aria-current="page">{c.label}</span>}
                    {c.tag && (
                      <span className={s.tag} style={{ background: c.tag.bg, borderColor: c.tag.bd }}>
                        {c.tag.dot && <span className={s.tagDot} style={{ background: c.tag.dot }} />}
                        <span className={s.tagTxt} style={{ color: c.tag.ink }}>{c.tag.t}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className={s.direita}>
              <button type="button" className={u.pillBtn} disabled={!saude || transicao} onClick={() => setVigia(true)}
                style={!saude || transicao ? { cursor: "default" } : undefined}
                title={dePe ? "O vigia está lendo a agenda dos canais. Clique para desligar." : "O vigia não está rodando: nenhuma live será coletada até ele subir. Clique para ligar."}>
                <span className={u.dot} style={dePe && !v?.parando
                  ? { background: "#1F9D55", animation: "pulseDot 2.4s ease-in-out infinite" }
                  : { background: "var(--amb)", animation: transicao ? "pulseDot 1.2s ease-in-out infinite" : undefined }} />
                <span className="mono" style={{ fontSize: 12.5, color: "var(--ink2)", whiteSpace: "nowrap" }}>{rotulo}</span>
                {saude && !transicao && <span style={{ fontSize: 11, color: "var(--ink3)" }}>{dePe ? "desligar" : "ligar"}</span>}
              </button>
              <ThemeToggle />
              <button type="button" className={u.helpBtn} onClick={() => setAjuda(true)} title="O que é e como usar">?</button>
              <ContaBotao onClick={() => setConta(true)} />
            </div>
          </div>
        </header>

        <main className={s.main}>
          <Outlet />
        </main>

        {conta && <ContaDrawer fechar={() => setConta(false)} mostrarTrocar />}
        {ajuda && <AjudaDrawer fechar={() => setAjuda(false)} />}
        {vigia && <VigiaModal saude={saude} fechar={() => setVigia(false)} />}
      </div>
    </ShellCtx.Provider>
  );
}
