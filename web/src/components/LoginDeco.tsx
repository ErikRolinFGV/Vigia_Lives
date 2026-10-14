// Decoração do login: um chat e três mini-gráficos simulados, com a onda de
// atividade ao fundo. Puramente ilustrativo, e a tela diz isso.
import { useEffect, useReducer, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSessao } from "../state/sessao";

type Msg = { id: number; nome: string; cor: string; corClaro: string; txt: string; badge: "mod" | "membro" | null };
type Marca = { t: number; sigma: string; hora: string };
type Estado = {
  id: number; tick: number; hype: number; msgs: Msg[]; esp: number[]; mpm: number[]; part: number[];
  v: number; acc: number; wave: number[]; marks: Marca[]; t0: number; base: number; ph: number;
};

const NOMES = ["marina_fz", "joaopedro10", "tati.lopes", "rafa_bsb", "dudu_mengao", "carol_sp", "bia.torres", "lucasmvp", "neto_rj", "fefe_ok", "gui_santos", "anaclara", "pedrinho77", "thaisrocha", "kiko.br", "lele_gamer", "vini.cbr", "juuh_m", "otavio_poa", "manu_bh", "rodrigo.f", "paulinha_"];
const CORES = ["#E07A5F", "#81B29A", "#F2CC8F", "#7FA7E8", "#C98BDB", "#5FC6C9", "#E8A33D", "#9BD16B", "#F28CA8", "#B4B8FF"];
const CORES_CLARO = ["#B4502F", "#2F7D5B", "#9A6B12", "#2F5FB3", "#8A3FA6", "#1E7F86", "#A35F0C", "#4C7F1E", "#B23A63", "#4B4FC2"];
const CALMO = ["boa tarde galera", "alguém sabe o placar do outro jogo?", "que passe 👏", "segura o meio", "assistindo do trabalho kkkk", "olha a marcação alta", "bora brasil 🇧🇷", "essa camisa é linda", "o juiz tá deixando correr", "primeira vez vendo o sub-20", "ela é muito rápida", "volta pra marcar!!", "cadê a substituição", "zagueira tá jogando muito", "chuta!!", "quase 😩", "que lindo esse estádio", "falta perigosa aqui", "tá pegando fogo 🔥", "kkkkkkk", "PRESSÃO", "manda o lance de novo"];
const HYPE = ["GOOOOOOL", "GOLAÇO 🔥🔥🔥", "QUE GOL", "⚽⚽⚽", "AAAAAAA", "chorei 😭", "GOL DO BRASIL 🇧🇷🇧🇷", "que golaço meu deus", "replay replay", "PLACAR MOVEU", "👏👏👏👏", "VAMOOOO"];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function passo(L: Estado) {
  const hyp = L.hype > 0;
  L.base = Math.max(22000, Math.min(120000, L.base * (1 + (Math.random() - 0.45) * 0.06) + (hyp ? 2600 : 0)));
  L.ph += 0.45 + Math.random() * 0.35;
  const queda = Math.random() < 0.07 ? 0.78 : 1;
  L.v = Math.round(L.base * (1 + 0.16 * Math.sin(L.ph) + 0.07 * Math.sin(L.ph * 2.7)) * queda * (hyp ? 1.12 : 1));
  const m = Math.round((hyp ? 140 + Math.random() * 140 : 8 + Math.random() * 55) * (Math.random() < 0.1 ? 2.4 : 1));
  L.esp.push(L.v); L.mpm.push(m); L.part.push(Math.min(0.006, (m * 0.62) / L.v * 10));
  for (const k of ["esp", "mpm", "part"] as const) if (L[k].length > 40) L[k].shift();
}

function mensagem(L: Estado) {
  const pool = L.hype > 0 ? (Math.random() < 0.8 ? HYPE : CALMO) : CALMO;
  const i = Math.floor(Math.random() * NOMES.length);
  const r = Math.random();
  L.id++;
  L.msgs.push({ id: L.id, nome: NOMES[i], cor: CORES[i % CORES.length], corClaro: CORES_CLARO[i % CORES_CLARO.length], txt: pick(pool), badge: r < 0.1 ? "mod" : r < 0.3 ? "membro" : null });
  if (L.msgs.length > 26) L.msgs.shift();
  L.acc++;
}

function hora(L: Estado) {
  const s = L.t0 + Math.round(L.tick * 0.38 * 8);
  return Math.floor(s / 3600) + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0");
}

function criar(): Estado {
  const L: Estado = { id: 0, tick: 0, hype: 0, msgs: [], esp: [], mpm: [], part: [], v: 41200, acc: 0, wave: [], marks: [], t0: 3600 + Math.floor(Math.random() * 1800), base: 41200, ph: 0 };
  for (let k = 0; k < 96; k++) L.wave.push(0.06 + Math.random() * Math.random() * 0.5);
  for (let k = 0; k < 40; k++) passo(L);
  for (let k = 0; k < 14; k++) mensagem(L);
  return L;
}

function linha(vals: number[], W: number, H: number, max: number, min = 0) {
  const n = vals.length;
  const pts = vals.map((v, k) => [(k / (n - 1)) * W, H - 4 - ((v - min) / (max - min)) * (H - 10)]);
  const d = "M" + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
  return { d, area: d + " L" + W + " " + H + " L0 " + H + " Z", last: pts[pts.length - 1] };
}

const fmt = (v: number) => v.toLocaleString("pt-BR");
const lab: CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--ink4)" };
const panel: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 };

export function useLarguraJanela() {
  const [, render] = useReducer(x => x + 1, 0);
  useEffect(() => {
    window.addEventListener("resize", render);
    return () => window.removeEventListener("resize", render);
  }, []);
  return window.innerWidth;
}

export function LoginDeco() {
  const ref = useRef<Estado>();
  if (!ref.current) ref.current = criar();
  const [, render] = useReducer(x => x + 1, 0);
  const { tema } = useSessao();
  const escuro = tema === "escuro";
  const wide = useLarguraJanela() >= 1180;

  useEffect(() => {
    const iv = setInterval(() => {
      const L = ref.current!;
      L.tick++;
      if (Math.random() < (L.hype > 0 ? 0.95 : 0.42)) mensagem(L);
      if (L.hype > 0 && Math.random() < 0.6) mensagem(L);
      if (L.tick % 2 === 0) passo(L);
      L.wave.push(L.hype > 0 ? 0.55 + Math.random() * 0.45 : 0.06 + Math.random() * Math.random() * 0.5);
      if (L.wave.length > 96) L.wave.shift();
      if (L.hype > 0) L.hype--;
      else if (Math.random() < 0.025) {
        L.hype = 18;
        L.marks.push({ t: L.tick, sigma: (4 + Math.random() * 7).toFixed(1).replace(".", ","), hora: hora(L) });
      }
      render();
    }, 380);
    return () => clearInterval(iv);
  }, []);

  const L = ref.current;
  const hypeOn = L.hype > 0;

  // ---- onda de atividade
  const ww = L.wave.length, VW = 1000, VH = 300;
  const sm = L.wave.map((v, k, A) => ((A[k - 1] ?? v) + v * 2 + (A[k + 1] ?? v)) / 4);
  const wp = sm.map((v, k) => [(k / (ww - 1)) * VW, VH - 18 - v * (VH - 70)]);
  let wd = "M" + wp[0][0] + " " + wp[0][1].toFixed(1);
  for (let k = 1; k < ww; k++) {
    const mx = (wp[k - 1][0] + wp[k][0]) / 2;
    wd += ` C${mx.toFixed(1)} ${wp[k - 1][1].toFixed(1)} ${mx.toFixed(1)} ${wp[k][1].toFixed(1)} ${wp[k][0].toFixed(1)} ${wp[k][1].toFixed(1)}`;
  }
  L.marks = L.marks.filter(m => L.tick - m.t < ww - 4);
  const largura = wide ? "66.667%" : "100%";

  const onda = (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: largura, height: "46%" }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {[0.25, 0.5, 0.75].map((f, i) => {
          const y = VH - 18 - f * (VH - 70);
          return <line key={i} x1={0} x2={VW} y1={y} y2={y} strokeWidth={1} style={{ stroke: "var(--div)" }} />;
        })}
        <path d={wd + ` L${VW} ${VH} L0 ${VH} Z`} style={{ fill: "var(--s3)" }} />
        <path d={wd} fill="none" strokeWidth={1.6} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--lineH)" }} />
        {L.marks.map(m => {
          const x = ((ww - 1 - (L.tick - m.t)) / (ww - 1)) * VW;
          return <line key={m.t} x1={x} x2={x} y1={26} y2={VH} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--redSoft)" }} />;
        })}
      </svg>
      {L.marks.map(m => {
        const f = (ww - 1 - (L.tick - m.t)) / (ww - 1);
        return (
          <div key={m.t} style={{ position: "absolute", left: f * 100 + "%", top: 0, transform: "translateX(6px)", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--redInk)", whiteSpace: "nowrap", animation: "fadeIn .4s ease-out both" }}>
            {"momento " + m.hora + " · " + m.sigma + " σ"}
          </div>
        );
      })}
    </div>
  );
  const brilho = (
    <div style={{ position: "absolute", left: 0, bottom: 0, width: largura, height: "60%", background: "radial-gradient(ellipse 60% 70% at 50% 100%, rgba(228,99,94,0.10), transparent 70%)", opacity: hypeOn ? 1 : 0, transition: "opacity .8s ease" }} />
  );
  const raiz: CSSProperties = { position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" };
  if (!wide) return <div style={raiz} aria-hidden>{brilho}{onda}</div>;

  // ---- terço direito: chat e mini-gráficos
  const badge = (b: Msg["badge"]) => b && (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 3, marginRight: 5, verticalAlign: "-2px", background: b === "mod" ? "#2F7D4F" : "#3A3F7A", color: "#FFFFFF", fontSize: 9, fontWeight: 800, fontFamily: "Figtree, sans-serif" }}>
      {b === "mod" ? "M" : "★"}
    </span>
  );

  const eLo = Math.min(...L.esp), eHi = Math.max(...L.esp), ePad = (eHi - eLo) * 0.12 + 1;
  const e = linha(L.esp, 260, 70, eHi + ePad, Math.max(0, eLo - ePad));
  const pMax = Math.max(...L.part) * 1.15;
  const p = linha(L.part, 260, 54, pMax, Math.min(...L.part) * 0.85);
  const mMax = Math.max(...L.mpm) * 1.1;
  const bw = 260 / L.mpm.length;

  const card = (key: string, titulo: string, valor: string, sub: string, svg: ReactNode) => (
    <div key={key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.25fr)", alignItems: "center", gap: 14, padding: "12px 14px", borderTop: key === "e" ? "none" : "1px solid var(--line)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <div style={lab}>{titulo}</div>
        <span style={{ fontFamily: "Figtree, sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "-.02em", color: "var(--ink)", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{valor}</span>
        <span style={{ fontSize: 11, color: "var(--ink4)" }}>{sub}</span>
      </div>
      {svg}
    </div>
  );

  return (
    <div style={raiz} aria-hidden>
      {brilho}{onda}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "33.333%", padding: "28px 24px", background: "var(--s2)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...panel, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E4635E", animation: "pulseDot 1.4s infinite" }} />
            <span style={{ ...lab, color: "var(--ink2)", flex: 1 }}>chat ao vivo</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--ink4)" }}>{fmt(L.acc + 2980)} msgs</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 7, padding: "10px 14px 14px", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 28%)", maskImage: "linear-gradient(to bottom, transparent 0%, #000 28%)" }}>
            {L.msgs.map(m => (
              <div key={m.id} style={{ fontSize: 13, lineHeight: 1.42, color: "var(--ink2)", animation: "msgIn .28s ease-out both", overflowWrap: "anywhere" }}>
                {badge(m.badge)}
                <span style={{ fontWeight: 700, color: escuro ? m.cor : m.corClaro }}>{m.nome}</span>
                <span style={{ color: "var(--ink4)" }}>: </span>
                <span>{m.txt}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...panel, flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
          {card("e", "espectadores agora", fmt(L.v), "simultâneos",
            <svg viewBox="0 0 260 70" style={{ display: "block", width: "100%", height: "auto" }}>
              <path d={e.area} style={{ fill: "var(--ink)" }} fillOpacity={0.05} />
              <path d={e.d} fill="none" strokeWidth={1.8} style={{ stroke: "var(--aud)" }} />
              <circle cx={e.last[0] - 2} cy={e.last[1]} r={3} style={{ fill: "var(--aud)" }} />
            </svg>)}
          {card("m", "mensagens por minuto", fmt(L.mpm[L.mpm.length - 1]), hypeOn ? "pico detectado" : "janela de 60 s",
            <svg viewBox="0 0 260 60" style={{ display: "block", width: "100%", height: "auto" }}>
              {L.mpm.map((v, k) => (
                <rect key={k} x={k * bw + 0.8} width={bw - 1.6} y={60 - (v / mMax) * 58} height={(v / mMax) * 58} rx={1}
                  style={{ fill: k === L.mpm.length - 1 ? (hypeOn ? "var(--red)" : "var(--msg)") : v > 120 ? "var(--msgMid)" : "var(--line2)", transition: "y .4s ease, height .4s ease" }} />
              ))}
            </svg>)}
          {card("p", "participação", (L.part[L.part.length - 1] * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%", "escreveu na janela",
            <svg viewBox="0 0 260 54" style={{ display: "block", width: "100%", height: "auto" }}>
              <path d={p.d} fill="none" strokeWidth={1.8} strokeDasharray="3 3" style={{ stroke: "var(--part)" }} />
              <circle cx={p.last[0] - 2} cy={p.last[1]} r={3} style={{ fill: "var(--part)" }} />
            </svg>)}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--ink4)", padding: "0 4px" }}>dados ilustrativos</div>
      </div>
    </div>
  );
}
