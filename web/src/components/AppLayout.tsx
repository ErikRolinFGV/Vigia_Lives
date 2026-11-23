import { createContext, useContext, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useSessao } from "../state/sessao";
import { useSaude } from "../state/saude";
import { ContaBotao, ThemeToggle } from "./basicos";
import { ContaDrawer } from "./ContaDrawer";
import { AjudaDrawer } from "./AjudaDrawer";
import { VigiaModal } from "./ModaisCanal";
import s from "./layout.module.css";

export type Crumb = {
  label: string;
  to?: string;           // ausente = item atual, não clicável
  num?: string;          // "#3"
  tag?: { t: string; bg: string; bd: string; ink: string; dot?: string };
};

type Shell = { setCrumbs: (c: Crumb[]) => void; abrirAjuda: () => void };
const ShellCtx = createContext<Shell | null>(null);

/** A página declara o próprio caminho (depois de "Canais"). */
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

// quando o admin abriu o Registro pela última vez: o selo conta o que veio depois
export const CHAVE_VISTO = "vigia.registro.visto";

/** Só para o admin: aparece quando houve erro depois da última vez que ele abriu o Sistema. */
function SeloRegistro() {
  const [r, setR] = useState<{ erros_24h: number; ultimo_erro_em: string | null } | null>(null);
  const [visto, setVisto] = useState(lerVisto);
  useEffect(() => {
    const ler = () => api<typeof r>("/operacao/eventos/resumo").then(setR, () => setR(null));
    ler();
    const t = window.setInterval(ler, 60_000);
    const abriu = () => setVisto(lerVisto());
    window.addEventListener(CHAVE_VISTO, abriu);
    return () => { window.clearInterval(t); window.removeEventListener(CHAVE_VISTO, abriu); };
  }, []);
  if (!r?.ultimo_erro_em || (visto && r.ultimo_erro_em <= visto)) return null;
  return (
    <Link to="/yt/registro" className={s.selo} title={`${r.erros_24h} erro(s) nas últimas 24 h`}>
      <span className={s.ponto} style={{ background: "#E5484D" }} />erro novo
    </Link>
  );
}

function lerVisto() {
  try { return localStorage.getItem(CHAVE_VISTO) || ""; } catch { return ""; }
}

/** Exige sessão; sem login, volta para /login. */
export function Protegido({ children }: { children: JSX.Element }) {
  const { logado, verificando } = useSessao();
  if (verificando) return null;
  return logado ? children : <Navigate to="/login" replace />;
}

const ICONE: Record<string, ReactNode> = {
  inicio: <path d="M3 8l6-5 6 5v7H11v-4H7v4H3z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  canais: <><rect x="2" y="4" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M7.5 7v4l3.5-2z" fill="currentColor" /></>,
  acervo: <><rect x="2" y="3" width="14" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 7v7.5h12V7M7 10h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  comparar: <path d="M4 15V8M9 15V3M14 15v-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  aovivo: <><circle cx="9" cy="9" r="1.8" fill="currentColor" /><path d="M6 6a4.2 4.2 0 0 0 0 6M12 6a4.2 4.2 0 0 1 0 6M3.6 3.6a7.6 7.6 0 0 0 0 10.8M14.4 3.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
  sistema: <><circle cx="9" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M9 2v2M9 14v2M2 9h2M14 9h2M4 4l1.4 1.4M12.6 12.6L14 14M4 14l1.4-1.4M12.6 5.4L14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></>,
};

function Item({ to, icone, rotulo, ativo, conta }: { to: string; icone: string; rotulo: string; ativo: boolean; conta?: number }) {
  return (
    <Link to={to} className={`${s.item} ${ativo ? s.on : ""}`} aria-current={ativo ? "page" : undefined}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>{ICONE[icone]}</svg>{rotulo}
      {!!conta && <span className={s.conta} aria-label={`${conta} ao vivo`}>{conta}</span>}
    </Link>
  );
}

export function AppLayout() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [ajuda, setAjuda] = useState(false);
  const [conta, setConta] = useState(false);
  const [busca, setBusca] = useState("");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { admin } = useSessao();
  const [vigia, setVigia] = useState(false);
  const saude = useSaude();
  const v = saude?.vigia;
  const dePe = !!v?.de_pe;
  const nColetas = saude?.coletas?.length ?? 0;
  const rotulo = v?.parando ? "Pausando…" : v?.ligando ? "Ligando…"
    : dePe ? (nColetas ? `Ouvindo ${nColetas} ${nColetas === 1 ? "live" : "lives"}` : "Pronta para ouvir") : "Serviço em pausa";
  const transicao = !!(v?.parando || v?.ligando);

  const em = (p: string) => pathname.startsWith(p);
  const naLive = em("/yt/lives") || em("/yt/canais/");
  const pesquisar = (e: FormEvent) => {
    e.preventDefault();
    nav(`/yt/acervo${busca.trim() ? `?q=${encodeURIComponent(busca.trim())}` : ""}`);
  };

  return (
    <ShellCtx.Provider value={{ setCrumbs, abrirAjuda: () => setAjuda(true) }}>
      <div className={s.app}>
        <header className={s.topo}>
          <Link to="/yt/inicio" className={s.marca} aria-label="Lively, início">
            <img src="/logo-azul.svg" alt="" width={51} height={28} />
            <span className={s.wordmark}>live<span style={{ color: "#F0B54A" }}>ly</span></span>
          </Link>
          <form className={s.busca} onSubmit={pesquisar} role="search">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" fill="none" stroke="#616161" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="#616161" strokeWidth="1.5" strokeLinecap="round" /></svg>
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar lives" aria-label="Pesquisar lives" />
          </form>
          <div className={s.direita}>
            {admin && <SeloRegistro />}
            <ThemeToggle />
            <button type="button" className={s.ajuda} onClick={() => setAjuda(true)} aria-label="Ajuda">?</button>
            <ContaBotao onClick={() => setConta(true)} />
          </div>
        </header>

        <div className={s.corpo}>
          <nav className={s.menu} aria-label="Principal">
            <Item to="/yt/inicio" icone="inicio" rotulo="Início" ativo={em("/yt/inicio")} />
            <Item to="/yt/aovivo" icone="aovivo" rotulo="Ao vivo" ativo={em("/yt/aovivo")} conta={nColetas} />
            <Item to="/yt/canais" icone="canais" rotulo="Canais" ativo={em("/yt/canais") || em("/yt/lives")} />
            <Item to="/yt/acervo" icone="acervo" rotulo="Acervo" ativo={em("/yt/acervo")} />
            <Item to="/yt/comparar" icone="comparar" rotulo="Comparar" ativo={em("/yt/comparar")} />
            {admin && <><div className={s.sep} /><Item to="/yt/registro" icone="sistema" rotulo="Sistema" ativo={em("/yt/registro")} /></>}
            {/* o estado do serviço: o admin liga e pausa; os outros só veem */}
            <button type="button" className={s.servico} disabled={!saude || transicao || !admin} onClick={() => setVigia(true)}>
              <span className={s.ponto} style={dePe && !v?.parando
                ? { background: "#3347C9", animation: nColetas ? "pulseDot 2.4s ease-in-out infinite" : undefined }
                : { background: "var(--latao)", animation: transicao ? "pulseDot 1.2s ease-in-out infinite" : undefined }} />
              {saude ? rotulo : "…"}
            </button>
          </nav>

          <main className={s.main}>
            {naLive && crumbs.length > 0 && (
              <nav className={s.trilha} aria-label="Caminho">
                <Link to="/yt/canais">Canais</Link>
                {crumbs.map((c, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span aria-hidden>›</span>
                    {c.num && <span>{c.num}</span>}
                    {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page" style={{ color: "var(--ink)" }}>{c.label}</span>}
                    {c.tag && (
                      <span className={s.tag} style={{ background: c.tag.bg, borderColor: c.tag.bd }}>
                        {c.tag.dot && <span className={s.tagDot} style={{ background: c.tag.dot }} />}
                        <span className={s.tagTxt} style={{ color: c.tag.ink }}>{c.tag.t}</span>
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            <Outlet />
          </main>
        </div>

        {conta && <ContaDrawer fechar={() => setConta(false)} mostrarTrocar={false} />}
        {ajuda && <AjudaDrawer fechar={() => setAjuda(false)} />}
        {vigia && <VigiaModal saude={saude} fechar={() => setVigia(false)} />}
      </div>
    </ShellCtx.Provider>
  );
}
