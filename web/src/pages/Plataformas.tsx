import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { siKick, siTiktok, siTwitch, siYoutube } from "simple-icons";
import { ContaBotao, Logo, ThemeToggle } from "../components/basicos";
import { ContaDrawer } from "../components/ContaDrawer";
import { usePlano } from "../state/plano";
import s from "./auth.module.css";

// Ícones de marca empacotados localmente (simple-icons, CC0): nada vem de CDN.
function Icone({ path, cor }: { path: string; cor: string }) {
  return (
    <svg viewBox="0 0 24 24" width={36} height={36} style={{ display: "block", flex: "0 0 36px", marginBottom: 3 }} aria-hidden>
      <path d={path} fill={cor} />
    </svg>
  );
}

export function Plataformas() {
  const nav = useNavigate();
  const plano = usePlano();
  const [conta, setConta] = useState(false);

  const cinza = { chipBg: "var(--s3)", chipInk: "var(--ink3)", ink: "var(--ink2)", bg: "var(--s2)", border: "var(--line)", line: "var(--line)", op: 0.55, subInk: "var(--ink4)" };
  const lista = [
    { nome: "YouTube", path: siYoutube.path, cor: "#FF0033", chip: "DISPONÍVEL", chipBg: "var(--redT)", chipInk: "var(--redInk)", accent: "#DC2A25", bg: "var(--surface)", ink: "var(--ink)", border: "var(--redLine)", line: "var(--line2)", op: 1, subInk: "var(--ink2)", sub: `${plano.emUso} canais vigiados`, ativa: true },
    { nome: "Twitch", path: siTwitch.path, cor: "#9AA0A9", chip: "EM BREVE", accent: "var(--lineH)", sub: "sem coleta", ativa: false, ...cinza },
    { nome: "TikTok Live", path: siTiktok.path, cor: "#9AA0A9", chip: "EM BREVE", accent: "var(--lineH)", sub: "sem coleta", ativa: false, ...cinza },
    { nome: "Kick", path: siKick.path, cor: "#9AA0A9", chip: "EM BREVE", accent: "var(--lineH)", sub: "sem coleta", ativa: false, ...cinza },
  ];

  return (
    <div className={s.plat}>
      <div className={s.platBarra}>
        <div className={s.platBarraIn}>
          <Logo size={28} cor="#F57F5B" />
          <span style={{ fontFamily: "Figtree, sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: "-.03em", color: "var(--ink)", flex: 1 }}>vigia</span>
          <ThemeToggle />
          <ContaBotao onClick={() => setConta(true)} />
        </div>
      </div>

      <div className={s.platCorpo}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <h1 className={s.platTitulo}>Escolha a plataforma</h1>
          <p style={{ margin: "0 0 30px", fontSize: 14.5, color: "var(--ink3)", maxWidth: 560, textWrap: "pretty" }}>
            Cada plataforma tem coletor próprio, cota própria e limites próprios.
          </p>
          <div className={s.platGrid}>
            {lista.map(p => (
              <button key={p.nome} type="button" disabled={!p.ativa} onClick={() => p.ativa && nav("/yt/canais")}
                className={`${s.platCard} ${p.ativa ? s.platAtiva : ""}`}
                style={{ background: p.bg, borderColor: p.border, opacity: p.op, cursor: p.ativa ? "pointer" : "default", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, width: "100%" }}>
                  <Logo size={52} cor={p.accent} />
                  <div className={s.platChip} style={{ background: p.chipBg, color: p.chipInk }}>{p.chip}</div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 12 }}>
                  <Icone path={p.path} cor={p.cor} />
                  <span className={s.platNome} style={{ color: p.ink }}>{p.nome}</span>
                </div>
                <div className={s.platRodape} style={{ borderColor: p.line, width: "100%" }}>
                  <span className="mono" style={{ fontSize: 13, color: p.subInk }}>{p.sub}</span>
                  <span style={{ fontSize: 18, color: p.ativa ? "var(--ink)" : "transparent" }}>{p.ativa ? "→" : ""}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {conta && <ContaDrawer fechar={() => setConta(false)} mostrarTrocar={false} />}
    </div>
  );
}
