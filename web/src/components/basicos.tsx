import type { CSSProperties } from "react";
import { useSessao } from "../state/sessao";
import s from "./ui.module.css";

/** Balão de chat com três pontos: a marca do Vigia. */
export function Logo({ size = 28, cor = "#DC2A25" }: { size?: number; cor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ display: "block", flex: `0 0 ${size}px` }} aria-hidden>
      <path d="M10 4h12a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8h-9l-6 5v-5.6A8 8 0 0 1 2 16v-4a8 8 0 0 1 8-8z" fill={cor} />
      <circle cx="10.5" cy="14" r="2.1" fill="#0B0C0E" />
      <circle cx="16" cy="14" r="2.1" fill="#0B0C0E" />
      <circle cx="21.5" cy="14" r="2.1" fill="#0B0C0E" />
    </svg>
  );
}

export function Wordmark({ size = 19 }: { size?: number }) {
  return (
    <span style={{ fontFamily: "Figtree, sans-serif", fontWeight: 700, fontSize: size, letterSpacing: size >= 30 ? "-.035em" : "-.03em", color: "var(--ink)" }}>
      vigia
    </span>
  );
}

export function ThemeToggle() {
  const { tema, alternarTema } = useSessao();
  const claro = tema === "claro";
  return (
    <button type="button" className={s.iconBtn} onClick={alternarTema} title={claro ? "Mudar para tema escuro" : "Mudar para tema claro"}>
      {claro ? (
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: "block" }}>
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: "block" }}>
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function Avatar({ size, fs }: { size: number; fs: number }) {
  const { conta, iniciais } = useSessao();
  const base: CSSProperties = { width: size, height: size, borderRadius: "50%", display: "block" };
  if (conta.foto) return <img src={conta.foto} alt="" style={{ ...base, objectFit: "cover" }} />;
  return (
    <span style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", background: "#F57F5B", color: "#17140F", fontFamily: "Figtree, sans-serif", fontWeight: 700, fontSize: fs }}>
      {iniciais}
    </span>
  );
}

export function ContaBotao({ onClick }: { onClick: () => void }) {
  const { nomeConta } = useSessao();
  return (
    <button type="button" className={s.contaBtn} onClick={onClick} title="Sua conta: perfil, plano, avisos e preferências">
      <span className={s.contaAvatar}><Avatar size={30} fs={12} /></span>
      <span className={s.contaTxt}>
        <span className={s.contaNome}>{nomeConta}</span>
        <span className={s.contaSub}>Minha conta</span>
      </span>
      <svg width="12" height="12" viewBox="0 0 12 12" style={{ display: "block", flex: "0 0 12px", marginLeft: 2 }}>
        <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--ink2)" }} />
      </svg>
    </button>
  );
}

export function Erro({ texto }: { texto: string }) {
  return (
    <div className={s.erro} role="alert">
      <span className={s.erroDot} />
      <span className={s.erroTxt}>{texto}</span>
    </div>
  );
}

export const emailValido = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
