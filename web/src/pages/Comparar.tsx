// Comparação lado a lado de 2 a 4 lives coletadas, por seção: audiência,
// conversa, pessoas, enquetes e depois da live. A ficha (todas as métricas)
// fica recolhida no fim; a sub-aba "Comparar" de cada live já a resume.
import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../api/client";
import type { Comparacao, DetalheComparacao, Ficha, ListaFichas, MetricaDef } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { NotaPainel, Painel, Secao } from "../components/blocos";
import { gbox, nice, py } from "../lib/chart";
import { CORES_COMPARAR, foraDoRanking, valorMetrica } from "../lib/ficha";
import { compacto, dataHora, hhmm, n as fmtN, nomeLive } from "../lib/format";
import { useSessao } from "../state/sessao";
import s from "./canais.module.css";

const MAX = 4;
const CHAVES_RESUMO = ["pico", "media", "mpm", "participacao", "momentos", "views_24h"];

// ---------------------------------------------------------------- gráfico de linhas

type Linha = { cor: string; xs: number[]; ys: (number | null)[]; tracejada?: boolean; pontos?: boolean };

/** Várias linhas num eixo só. Um null quebra a linha: nunca interpolar. */
function Linhas({ linhas, xMax, xTicks, yFmt, yMax, H = 280, fs = 15 }: {
  linhas: Linha[]; xMax: number; xTicks: { x: number; label: string }[]; yFmt: (v: number) => string; yMax?: number; H?: number;
  fs?: number;  // painel estreito: fonte maior no viewBox, para o rotulo nao encolher
}) {
  const g = gbox(H, fs, fs);
  const max = yMax ?? nice(Math.max(1e-9, ...linhas.flatMap(l => l.ys.filter((v): v is number => v != null))));
  const x = (v: number) => g.L + (g.W * v) / (xMax || 1);
  const txt = { fontSize: fs, fontFamily: "IBM Plex Mono, monospace", style: { fill: "var(--ink4)" } } as const;
  return (
    <svg viewBox={`0 0 1000 ${H}`} style={{ display: "block", width: "100%", height: "auto" }} role="img">
      {[0, 1, 2, 3, 4].map(k => {
        const v = (max * k) / 4, y = py(v, max, g);
        return (
          <g key={k}>
            <line x1={g.L} x2={g.L + g.W} y1={y} y2={y} strokeWidth={1} style={{ stroke: "var(--grid)" }} />
            <text x={g.L - 8} y={y + 4} textAnchor="end" {...txt}>{yFmt(v)}</text>
          </g>
        );
      })}
      {xTicks.map(t => <text key={t.x} x={x(t.x)} y={g.H - 6} textAnchor="middle" {...txt}>{t.label}</text>)}
      {linhas.map((l, i) => {
        let d = "", aberto = false;
        l.ys.forEach((v, j) => {
          if (v == null) { aberto = false; return; }
          d += `${aberto ? "L" : "M"}${x(l.xs[j]).toFixed(1)},${py(Math.min(v, max), max, g).toFixed(1)}`;
          aberto = true;
        });
        return (
          <g key={i}>
            <path d={d} fill="none" strokeWidth={2.2} strokeDasharray={l.tracejada ? "7 5" : undefined} style={{ stroke: l.cor }} />
            {l.pontos && l.ys.map((v, j) => v == null ? null : <circle key={j} cx={x(l.xs[j])} cy={py(v, max, g)} r={4.5} style={{ fill: l.cor }} />)}
          </g>
        );
      })}
    </svg>
  );
}

/** Ticks de tempo (segundos desde o início) num passo que caiba ~8 rótulos. */
function ticksTempo(tMax: number) {
  const passo = [600, 1800, 3600, 7200].find(p => tMax / p <= 8) ?? 7200;
  return Array.from({ length: Math.floor(tMax / passo) + 1 }, (_, i) => ({ x: i * passo, label: hhmm(i * passo) }));
}

function mediaMovel(v: (number | null)[], k: number) {
  return v.map((_, i) => {
    const jan = v.slice(Math.max(0, i - k + 1), i + 1).filter((x): x is number => x != null);
    return v[i] == null || !jan.length ? null : jan.reduce((a, b) => a + b, 0) / jan.length;
  });
}

function Escala({ forma, setForma }: { forma: boolean; setForma: (v: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="Escala" style={{ display: "flex", gap: 6 }}>
      {[false, true].map(v => (
        <button key={String(v)} type="button" role="radio" aria-checked={forma === v} onClick={() => setForma(v)}
          style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "5px 11px", cursor: "pointer",
            border: `1px solid ${forma === v ? "var(--lineH)" : "var(--line2)"}`, background: forma === v ? "var(--surface)" : "transparent",
            color: forma === v ? "var(--ink)" : "var(--ink3)" }}>{v ? "Forma (÷ máximo)" : "Valores"}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- escolha

function Escolher({ fichas, ids, mudar }: { fichas: Ficha[]; ids: string[]; mudar: (ids: string[]) => void }) {
  const { conta } = useSessao();
  const canais = [...new Set(fichas.map(f => f.canal))];
  const [canal, setCanal] = useState<string | null>(null);
  const lista = fichas.filter(f => !canal || f.canal === canal).slice().reverse();
  const cheio = ids.length >= MAX;
  return (
    <Painel titulo="Lives coletadas" sub={`marque de 2 a ${MAX} · só entram coletas encerradas`}
      direita={
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[null, ...canais].map(c => (
            <button key={c ?? "todas"} type="button" onClick={() => setCanal(c)}
              style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "5px 11px", cursor: "pointer",
                border: `1px solid ${canal === c ? "var(--lineH)" : "var(--line2)"}`, background: canal === c ? "var(--surface)" : "transparent",
                color: canal === c ? "var(--ink)" : "var(--ink3)" }}>{c ?? "Todos os canais"}</button>
          ))}
        </div>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 290, overflowY: "auto" }}>
        {lista.map(f => {
          const i = ids.indexOf(f.id);
          const marcada = i >= 0;
          const bloqueada = !marcada && cheio;
          return (
            <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10,
              border: `1px solid ${marcada ? "var(--lineH)" : "var(--div)"}`, cursor: bloqueada ? "not-allowed" : "pointer", opacity: bloqueada ? 0.5 : 1 }}>
              <input type="checkbox" checked={marcada} disabled={bloqueada}
                onChange={() => mudar(marcada ? ids.filter(x => x !== f.id) : [...ids, f.id])} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", flex: "0 0 10px", background: marcada ? CORES_COMPARAR[i] : "transparent", border: marcada ? "none" : "1px solid var(--line2)" }} />
              <span className="mono tnum" style={{ fontSize: 12, color: "var(--ink3)", width: 92, flex: "0 0 92px" }}>{dataHora(f.inicio, conta.tz)}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: 600 }}>{nomeLive(f.titulo)}</span>
              <span className={s.mono12} style={{ whiteSpace: "nowrap" }}>
                {f.canal}{f.trecho ? " · trecho" : ""}{f.curta ? " · curta" : f.parcial ? " · parcial" : ""}
              </span>
            </label>
          );
        })}
      </div>
    </Painel>
  );
}

/** Legenda fixa no topo dos gráficos: cor → live. */
function Legenda({ fichas }: { fichas: Ficha[] }) {
  const { conta } = useSessao();
  return (
    <div style={{ position: "sticky", top: 64, zIndex: 2, display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12,
      background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "0 4px 14px rgba(0,0,0,.12)" }}>
      {fichas.map((f, i) => (
        <Link key={f.id} to={`/yt/lives/${f.id}?aba=dados&sub=comparar`} style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", color: "var(--ink)",
          border: "1px solid var(--line2)", borderRadius: 99, padding: "4px 11px", minWidth: 0, maxWidth: "100%" }}>
          <span style={{ width: 12, height: 4, borderRadius: 2, background: CORES_COMPARAR[i], flex: "0 0 12px" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeLive(f.titulo, 1)}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink3)", whiteSpace: "nowrap" }}>{dataHora(f.inicio, conta.tz)}{f.trecho ? " · trecho" : ""}</span>
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- ficha em colunas

function Tabela({ c, chaves }: { c: Comparacao; chaves?: string[] }) {
  const { fichas, grupos } = c;
  const metricas = chaves ? c.metricas.filter(m => chaves.includes(m.chave)) : c.metricas;
  const lider = (m: MetricaDef) => {
    const vals = fichas.filter(f => !foraDoRanking(f, m)).map(f => f.valores[m.chave] as number);
    // empate geral (todas em 0, por exemplo) não tem destaque
    return vals.length > 1 && Math.max(...vals) > Math.min(...vals) ? Math.max(...vals) : null;
  };
  const cols = `minmax(170px,1.4fr) repeat(${fichas.length}, minmax(100px,1fr))`;
  const linha = (m: MetricaDef) => {
    const top = lider(m);
    return (
      <div key={m.chave} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, padding: "8px 0", borderTop: "1px solid var(--div)", alignItems: "baseline" }}>
        <span style={{ fontSize: 13.5, color: "var(--ink2)" }} title={m.descricao}>{m.rotulo}</span>
        {fichas.map((f, i) => {
          const fora = foraDoRanking(f, m);
          const v = f.valores[m.chave];
          const e = !fora && top != null && v === top;
          return (
            <span key={f.id} className="tnum" title={fora ?? undefined}
              style={{ fontSize: 14, fontWeight: e ? 800 : 500, color: fora && m.escopo !== "contexto" ? "var(--ink4)" : "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: CORES_COMPARAR[i], flex: "0 0 8px", opacity: e ? 1 : 0 }} />
              {valorMetrica(v, m.formato)}
            </span>
          );
        })}
      </div>
    );
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 170 + 100 * fichas.length }}>
        {chaves
          ? metricas.map(linha)
          : Object.keys(grupos).map(g => {
              const ms = metricas.filter(m => m.grupo === g);
              return ms.length ? (
                <div key={g} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 2 }}>{grupos[g]}</div>
                  {ms.map(linha)}
                </div>
              ) : null;
            })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- seções

type Dados = { f: Ficha; d: DetalheComparacao; cor: string };

function SemSerie({ texto }: { texto: ReactNode }) {
  return <div style={{ fontSize: 13, color: "var(--ink3)", padding: "8px 0" }}>{texto}</div>;
}

function Audiencia({ ds }: { ds: Dados[] }) {
  const [forma, setForma] = useState(false);
  const tMax = Math.max(60, ...ds.map(x => x.d.serie!.t[x.d.serie!.t.length - 1]));
  const linhas: Linha[] = ds.map(({ d, cor }) => {
    const ys = d.serie!.esp;
    const m = Math.max(0, ...ys.filter((v): v is number => v != null));
    return { cor, xs: d.serie!.t, ys: forma ? ys.map(v => (v == null || !m ? v : v / m)) : ys };
  });
  return (
    <Painel titulo="Espectadores ao longo da live" sub={forma ? "cada curva dividida pelo próprio pico: compara a forma, não o tamanho" : "espectadores simultâneos, média de cada minuto · as curvas começam juntas no início de cada live"}
      direita={<Escala forma={forma} setForma={setForma} />}>
      <Linhas linhas={linhas} xMax={tMax} xTicks={ticksTempo(tMax)} yFmt={v => (forma ? fmtN(v * 100) + "%" : fmtN(v))} yMax={forma ? 1 : undefined} />
    </Painel>
  );
}

function Conversa({ ds }: { ds: Dados[] }) {
  const [forma, setForma] = useState(false);
  const tMax = Math.max(60, ...ds.map(x => x.d.serie!.t[x.d.serie!.t.length - 1]));

  const mpm: Linha[] = ds.map(({ d, cor }) => {
    const ys = mediaMovel(d.serie!.mpm, 3);
    const m = Math.max(0, ...ys.filter((v): v is number => v != null));
    return { cor, xs: d.serie!.t, ys: forma ? ys.map(v => (v == null || !m ? v : v / m)) : ys };
  });
  const part: Linha[] = ds.map(({ d, cor }) => ({ cor, xs: d.serie!.t, ys: mediaMovel(d.serie!.part, 5).map(v => (v == null ? null : v * 100)) }));
  // nos primeiros minutos ha pouca gente assistindo e a participacao dispara;
  // o eixo para no percentil 95 para o resto da live caber (o pico fica no teto)
  const vp = part.flatMap(l => l.ys.filter((v): v is number => v != null)).sort((a, b) => a - b);
  const tetoPart = vp.length ? nice(vp[Math.floor(0.95 * (vp.length - 1))]) : undefined;
  const cortado = tetoPart != null && vp[vp.length - 1] > tetoPart;
  // quanto do chat já tinha sido escrito em cada fração da coleta
  const acum: Linha[] = ds.map(({ d, cor }) => {
    const t = d.serie!.t, tot = d.serie!.mpm.reduce((a, b) => a + b, 0) || 1;
    const t0 = t[0], span = t[t.length - 1] - t0 || 1;
    let soma = 0;
    return { cor, xs: t.map(v => (100 * (v - t0)) / span), ys: d.serie!.mpm.map(v => { soma += v; return (100 * soma) / tot; }) };
  });
  const diag: Linha = { cor: "var(--ink4)", xs: [0, 100], ys: [0, 100], tracejada: true };

  return (
    <>
      <Painel titulo="Mensagens por minuto" sub={forma ? "cada curva dividida pelo próprio máximo" : "média móvel de 3 minutos"} direita={<Escala forma={forma} setForma={setForma} />}>
        <Linhas linhas={mpm} xMax={tMax} xTicks={ticksTempo(tMax)} yFmt={v => (forma ? fmtN(v * 100) + "%" : fmtN(v))} yMax={forma ? 1 : undefined} H={240} />
      </Painel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
        <Painel titulo="Participação ao longo da live" sub="quem escreveu no minuto ÷ quem assistia · média móvel de 5 min">
          <Linhas linhas={part} xMax={tMax} xTicks={ticksTempo(tMax)} yFmt={v => fmtN(v, 2) + "%"} yMax={tetoPart} H={420} fs={24} />
          {cortado && <NotaPainel>O eixo para em {fmtN(tetoPart!, 2)}%: nos primeiros minutos, com pouca gente assistindo, a participação passa disso e a linha encosta no teto.</NotaPainel>}
        </Painel>
        <Painel titulo="Quando a conversa acontece" sub="parcela do chat já escrita × parcela da coleta já passada · tracejado = ritmo constante">
          <Linhas linhas={[diag, ...acum]} xMax={100} xTicks={[0, 25, 50, 75, 100].map(v => ({ x: v, label: v + "%" }))} yFmt={v => fmtN(v) + "%"} yMax={100} H={420} fs={24} />
          <NotaPainel>Curva abaixo do tracejado: o chat se concentrou no fim. Acima: começou forte e esfriou. Compara lives de durações diferentes.</NotaPainel>
        </Painel>
      </div>
      <Picos ds={ds} tMax={tMax} />
    </>
  );
}

/** Uma faixa por live, com os picos de reação no tempo (tamanho = força). */
function Picos({ ds, tMax }: { ds: Dados[]; tMax: number }) {
  const x = (t: number) => (100 * t) / tMax;
  return (
    <Painel titulo="Picos de reação no tempo" sub="cada ponto é uma janela de 60 s em que o chat passou do limiar de detecção · maior = mais forte">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ds.map(({ f, d, cor }) => {
          const picos = d.momentos.filter(m => m.tipo === "pico_chat");
          const t = d.serie!.t;
          return (
            <div key={f.id} style={{ display: "grid", gridTemplateColumns: "170px minmax(0,1fr) 70px", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeLive(f.titulo, 1)}</span>
              <div style={{ position: "relative", height: 26 }}>
                <div style={{ position: "absolute", left: `${x(t[0])}%`, width: `${x(t[t.length - 1]) - x(t[0])}%`, top: 12, height: 2, background: cor, opacity: 0.35, borderRadius: 1 }} />
                {picos.map((m, i) => {
                  const r = 5 + Math.min(m.magnitude, 14);
                  return <span key={i} title={`${hhmm(m.t)} · ${fmtN(m.magnitude, 1)} σ`} style={{ position: "absolute", left: `calc(${x(m.t)}% - ${r / 2}px)`, top: 13 - r / 2, width: r, height: r, borderRadius: "50%", background: cor, opacity: 0.85 }} />;
                })}
              </div>
              <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink3)", textAlign: "right" }}>{picos.length} {picos.length === 1 ? "pico" : "picos"}</span>
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0,1fr) 70px", gap: 12 }}>
          <span />
          <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink4)" }}>
            {ticksTempo(tMax).map(tk => <span key={tk.x}>{tk.label}</span>)}
          </div>
        </div>
      </div>
    </Painel>
  );
}

function Pessoas({ ds }: { ds: Dados[] }) {
  const com = ds.filter(x => x.d.pessoas);
  if (!com.length) return null;
  const opac = [0.3, 0.55, 0.8, 1];
  return (
    <Painel titulo="Quem escreve quanto" sub="pessoas no chat por quantidade de mensagens · cada barra soma 100% das pessoas da live">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {com.map(({ f, d, cor }) => {
          const p = d.pessoas!;
          return (
            <div key={f.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, marginBottom: 5, flexWrap: "wrap" }}>
                <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeLive(f.titulo, 1)}</b>
                <span style={{ color: "var(--ink3)" }}>10% mais ativos: <b style={{ color: "var(--ink)" }}>{fmtN(p.top10pct.pct_msgs, 1)}%</b> das mensagens</span>
              </div>
              <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", background: "var(--track)" }}>
                {p.faixas.map((fx, i) => {
                  const pct = (100 * fx.n) / (p.pessoas || 1);
                  return pct > 0 ? (
                    <div key={fx.faixa} title={`${fx.faixa}: ${fmtN(fx.n)} pessoas (${fmtN(pct, 1)}%)`}
                      style={{ width: `${pct}%`, background: cor, opacity: opac[i], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", overflow: "hidden" }}>
                      {pct >= 8 ? `${fmtN(pct)}%` : ""}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "var(--ink3)" }}>
          {com[0].d.pessoas!.faixas.map((fx, i) => (
            <span key={fx.faixa} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--ink2)", opacity: opac[i] }} />{fx.faixa}
            </span>
          ))}
        </div>
      </div>
    </Painel>
  );
}

function Enquetes({ ds }: { ds: Dados[] }) {
  const votos = (d: DetalheComparacao) => d.enquetes.reduce((a, e) => a + (e.total ?? 0), 0);
  const max = Math.max(1, ...ds.map(x => votos(x.d)));
  return (
    <Painel titulo="Enquetes" sub="enquetes abertas pelo canal no chat e votos somados">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {ds.map(({ f, d, cor }) => (
          <div key={f.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, marginBottom: 5 }}>
              <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomeLive(f.titulo, 1)}</b>
              <span className="tnum" style={{ color: "var(--ink2)", whiteSpace: "nowrap" }}>
                {d.enquetes.length ? `${d.enquetes.length} ${d.enquetes.length === 1 ? "enquete" : "enquetes"} · ${fmtN(votos(d))} votos` : "nenhuma"}
              </span>
            </div>
            <div style={{ height: 10, background: "var(--track)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ width: `${(100 * votos(d)) / max}%`, height: "100%", background: cor, borderRadius: 5 }} />
            </div>
          </div>
        ))}
      </div>
    </Painel>
  );
}

function Depois({ ds }: { ds: Dados[] }) {
  const rotulos = ds[0]?.d.depois.pontos.map(p => p.rotulo) ?? [];
  const algum = ds.some(x => x.d.depois.pontos.some(p => p.views != null));
  const linhas: Linha[] = ds.map(({ d, cor }) => ({
    cor, xs: d.depois.pontos.map((_, i) => i), ys: d.depois.pontos.map(p => p.views), tracejada: d.depois.video_inteiro, pontos: true,
  }));
  return (
    <Painel titulo="Views depois da live" sub="leituras automáticas do vídeo: ao fim, +1 h, +6 h, +24 h, +2 d, +3 d, +5 d e +7 d · leitura que faltou fica sem ponto">
      {algum
        ? <Linhas linhas={linhas} xMax={Math.max(1, rotulos.length - 1)} xTicks={rotulos.map((r, i) => ({ x: i, label: r }))} yFmt={v => compacto(v)} H={260} />
        : <SemSerie texto="Nenhuma leitura de depois da live ainda para estas lives." />}
      {ds.some(x => x.d.depois.video_inteiro) && (
        <NotaPainel>Tracejado: trecho de um vídeo que carregou mais de uma transmissão. As views são do vídeo inteiro (o YouTube não separa por trecho).</NotaPainel>
      )}
    </Painel>
  );
}

// ---------------------------------------------------------------- página

export function Comparar() {
  useCrumbs([{ label: "Comparar transmissões" }]);
  const [q, setQ] = useSearchParams();
  const ids = (q.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX);
  const mudar = (novos: string[]) => setQ(novos.length ? { ids: novos.join(",") } : {}, { replace: true });
  const lista = useApi<ListaFichas>("/fichas");
  const comp = useApi<Comparacao>(ids.length >= 2 ? `/comparar?ids=${encodeURIComponent(ids.join(","))}` : null);
  const c = ids.length >= 2 ? comp.dados : null;
  const ds: Dados[] = c ? c.fichas.map((f, i) => ({ f, d: c.detalhes[f.id], cor: CORES_COMPARAR[i] })) : [];
  const comSerie = ds.filter(x => x.d?.serie);

  return (
    <div className={`${s.pagina} view-in`}>
      <div className={s.conteudo}>
        <div style={{ padding: "36px 0 18px" }}>
          <h1 className={s.h1}>Comparar transmissões</h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink2)", maxWidth: "70ch", textWrap: "pretty" }}>
            Duas a quatro lives coletadas, seção por seção. As curvas começam juntas: o eixo é o tempo desde o início de cada transmissão.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 40 }}>
          {lista.erro && <div className={s.erroCaixa}>{lista.erro.message}</div>}
          {lista.dados && <Escolher fichas={lista.dados.fichas} ids={ids} mudar={mudar} />}
          {ids.length < 2 && <div className={s.vazioLista}>Marque pelo menos duas lives para comparar.</div>}
          {comp.erro && ids.length >= 2 && <div className={s.erroCaixa}>{comp.erro.message}</div>}
          {c && (
            <>
              <Legenda fichas={c.fichas} />
              <Painel titulo="Números-chave" sub="o ponto colorido marca o maior valor entre as que se comparam · valor em cinza fica fora da comparação (passe o mouse para ver por quê)">
                <Tabela c={c} chaves={CHAVES_RESUMO} />
                <details style={{ marginTop: 14 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--ink2)" }}>Ver a ficha completa ({c.metricas.length} métricas)</summary>
                  <Tabela c={c} />
                  <NotaPainel>Totais de coleta parcial e números do vídeo inteiro (num trecho) aparecem, mas não disputam o destaque: medem outra coisa.</NotaPainel>
                </details>
              </Painel>

              <Secao titulo="Audiência" />
              {comSerie.length ? <Audiencia ds={comSerie} /> : <SemSerie texto="Sem leitura de audiência nestas lives." />}

              <Secao titulo="Conversa" />
              {comSerie.length ? <Conversa ds={comSerie} /> : <SemSerie texto="Sem série de chat nestas lives." />}

              <Secao titulo="Pessoas e enquetes" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 16 }}>
                <Pessoas ds={ds} />
                <Enquetes ds={ds} />
              </div>

              <Secao titulo="Depois da live" />
              <Depois ds={ds} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
