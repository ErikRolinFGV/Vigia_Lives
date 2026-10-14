// Aba "Relatório final": o dossiê da transmissão, exportar e publicar.
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "../../api/client";
import type { Dossie, EstadoDossie, LiveDetalhe, SecComunidade, Serie } from "../../api/types";
import { gbox, passoTicks, pts, dLine, px, py } from "../../lib/chart";
import { dataHora, hhmm, pct } from "../../lib/format";
import { useSessao } from "../../state/sessao";
import { ExportarModal, PublicarModal } from "./Entregas";

const PASSOS = [
  "agrega a série minuto a minuto e os totais",
  "detecta momentos por desvio sobre a média móvel",
  "calcula cobertura e custo da coleta",
  "redige o dossiê sobre esses números (texto fixo nesta versão)",
];
const COR = { aud: "var(--aud)", msg: "var(--msg)", part: "var(--part)", ink3: "var(--ink3)" } as const;
const card = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 } as const;
const rot = { fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase" as const, color: "var(--ink3)" };

function Passo({ texto, estado }: { texto: string; estado: "feito" | "agora" | "fila" }) {
  const c = estado === "feito" ? ["var(--okT)", "var(--okLine)", "var(--okInk)", "✓"]
    : estado === "agora" ? ["var(--redT)", "var(--redLine)", "var(--redInk)", "·"] : ["var(--s2)", "var(--line)", "var(--ink4)", ""];
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "center", background: c[0], border: `1px solid ${c[1]}`, borderRadius: 10, padding: "11px 13px", transition: "background .3s ease, border-color .3s ease" }}>
      <span style={{ width: 20, height: 20, flex: "0 0 20px", borderRadius: 6, background: "var(--surface)", border: `1px solid ${c[1]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: c[2] }}>{c[3]}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: estado === "fila" ? "var(--ink4)" : "var(--ink)" }}>{texto}</span>
    </div>
  );
}

/** Audiência e participação normalizadas no próprio máximo: um eixo de 0 a 1, não dois eixos. */
function Duplo({ s }: { s: Serie }) {
  const g = gbox(250, 13);
  const norm = (a: (number | null)[]) => { const m = Math.max(...a.filter((v): v is number => v != null)); return a.map(v => (v == null ? null : v / m)); };
  const aud = dLine(pts(norm(s.esp), 1.08, g)), part = dLine(pts(norm(s.part), 1.08, g));
  const every = passoTicks(s.t.length);
  return (
    <svg viewBox="0 0 1000 250" style={{ display: "block", width: "100%", height: "auto" }}>
      {[0, 1, 2, 3].map(k => { const y = py((1.08 * k) / 3, 1.08, g); return <line key={k} x1={g.L} x2={g.L + g.W} y1={y} y2={y} strokeWidth={1} style={{ stroke: "var(--grid)" }} />; })}
      <path d={aud} fill="none" strokeWidth={2.4} pathLength={1} strokeDasharray={1} style={{ stroke: "var(--aud)", animation: "drawIn 1.7s cubic-bezier(.3,.7,.3,1) both" }} />
      <path d={part} fill="none" strokeWidth={2.4} pathLength={1} strokeDasharray={1} style={{ stroke: "var(--part)", animation: "drawIn 1.7s cubic-bezier(.3,.7,.3,1) .35s both" }} />
      {s.t.map((t, i) => i % every === 0 && <text key={i} x={px(i, s.t.length, g)} y={244} textAnchor="middle" fontSize={13} fontFamily="IBM Plex Mono, monospace" style={{ fill: "var(--ink4)" }}>{hhmm(t)}</text>)}
    </svg>
  );
}

export function useDossie(id: string) {
  return useApi<EstadoDossie>(`/lives/${id}/dossie`);
}

export function Relatorio({ live, s, estado, recarregar }: { live: LiveDetalhe; s: Serie | null; estado: EstadoDossie | null; recarregar: () => void }) {
  const { conta } = useSessao();
  const [passo, setPasso] = useState(-1);
  const [erro, setErro] = useState("");
  const [exp, setExp] = useState(false);
  const [pub, setPub] = useState(false);
  const iv = useRef<ReturnType<typeof setInterval>>();
  const com = useApi<SecComunidade>(`/lives/${live.id}/secoes/comunidade`);
  useEffect(() => () => clearInterval(iv.current), []);

  const gerar = async () => {
    setErro("");
    setPasso(0);
    // os passos avançam no ritmo do protótipo; o pedido real corre junto
    const animacao = new Promise<void>(fim => {
      let i = 0;
      iv.current = setInterval(() => { i++; setPasso(i); if (i >= PASSOS.length) { clearInterval(iv.current); fim(); } }, 620);
    });
    try {
      await Promise.all([api(`/lives/${live.id}/dossie`, { method: "POST" }), animacao]);
      recarregar();
    } catch (e) {
      clearInterval(iv.current);
      setErro((e as Error).message);
    }
    setPasso(-1);
  };

  if (!estado) return <div style={{ color: "var(--ink3)", fontSize: 14, padding: "24px 0" }}>carregando o relatório…</div>;
  const gerando = passo >= 0;

  if (!estado.gerado || gerando) {
    return (
      <div style={{ ...card, padding: "32px 30px", display: "flex", flexDirection: "column", gap: 20 }}>
        {gerando ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--red)", animation: "pulseDot 1.4s infinite", flex: "0 0 9px" }} />
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Gerando o dossiê</div>
          </div>
        ) : (
          <div style={{ maxWidth: "60ch" }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 21, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 9 }}>O dossiê desta transmissão ainda não foi gerado</div>
            <div style={{ fontSize: 15, color: "var(--ink2)", textWrap: "pretty" }}>
              Os dados da coleta já estão completos na aba ao lado. O dossiê é uma segunda camada: consolida os números e redige a leitura sobre eles. Os números nunca vêm do texto: o texto vem dos números.
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PASSOS.map((p, i) => <Passo key={p} texto={p} estado={!gerando ? "fila" : passo > i ? "feito" : passo === i ? "agora" : "fila"} />)}
        </div>
        {!gerando && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button type="button" className="botao-escuro" onClick={gerar}>Gerar relatório final</button>
              <span style={{ fontSize: 13, color: "var(--ink3)", flex: 1, minWidth: 220, textWrap: "pretty" }}>Não consome cota da API do YouTube. Pode ser gerado de novo quantas vezes quiser.</span>
            </div>
            {erro && <div style={{ fontSize: 13, color: "var(--redInk)" }}>{erro}</div>}
            <div style={{ background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 11, padding: "13px 15px", fontSize: 13, color: "var(--ink2)", textWrap: "pretty" }}>
              Nesta versão nenhum modelo de linguagem é chamado: o texto é fixo, escolhido pelo que os números mostram, e cada número sai da coleta. Quando o modelo entrar, ele recebe exatamente os mesmos agregados.
            </div>
          </>
        )}
      </div>
    );
  }

  const d = estado.dossie as Dossie;
  const enquete = com.dados?.enquetes.find(e => e.detalhe) ?? null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--okT)", border: "1px solid var(--okLine)", borderRadius: 99, padding: "4px 11px", flex: "0 0 auto" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--okInk)" }}>dossiê gerado</span>
        </span>
        <span className="mono" style={{ fontSize: 12, color: "var(--ink3)", flex: 1, minWidth: 200 }}>gerado em {dataHora(d.gerado_em, conta.tz)} · números da coleta, texto fixo ({d.modelo})</span>
        <button type="button" className="botao-claro" onClick={gerar}>Gerar de novo</button>
      </div>

      <div style={{ background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 14, padding: "26px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={rot}>Como essa live performou</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ambInk)", background: "var(--ambT)", border: "1px solid var(--ambLine)", borderRadius: 99, padding: "3px 9px" }}>texto fixo · {d.modelo}</span>
        </div>
        <div style={{ fontSize: "clamp(19px,2.2vw,25px)", lineHeight: 1.38, fontWeight: 600, letterSpacing: "-.015em", maxWidth: "44ch", textWrap: "pretty" }}>{d.veredito}</div>
        <div style={{ fontSize: 15.5, color: "var(--ink2)", marginTop: 14, maxWidth: "62ch", textWrap: "pretty" }}>{d.veredito_sub}</div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>Insights do dossiê</span>
          <span style={{ fontSize: 13, color: "var(--ink3)" }}>{d.insights.length} leituras, cada uma ancorada num número da coleta</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {d.insights.map(i => (
            <div key={i.titulo} style={{ ...card, borderLeft: "3px solid var(--msg)", borderRadius: 12, padding: "16px 19px" }}>
              <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 5 }}>{i.titulo}</div>
              <div style={{ fontSize: 14.5, color: "var(--ink2)", textWrap: "pretty" }}>{i.texto}</div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 9, borderTop: "1px solid var(--div)", paddingTop: 9 }}>base: {i.base}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--msgT)", border: "1px solid var(--msgLine)", borderRadius: 14, padding: "20px 22px" }}>
        <div style={{ ...rot, marginBottom: 10 }}>Recomendação</div>
        <div style={{ fontSize: 15.5, maxWidth: "70ch", textWrap: "pretty" }}>{d.recomendacao}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
        {d.achados.map(a => (
          <div key={a.rotulo} style={{ ...card, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
            <div style={rot}>{a.rotulo}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
              <span className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 34, lineHeight: 1, fontWeight: 700, letterSpacing: "-.03em", color: COR[a.cor] }}>{a.valor}</span>
              <span style={{ fontSize: 13, color: "var(--ink3)" }}>{a.unidade}</span>
            </div>
            <div style={{ height: 8, background: "var(--track)", borderRadius: 4, overflow: "hidden", display: "flex" }}>
              <div style={{ width: Math.max(2, Math.min(100, a.bar)) + "%", height: "100%", background: COR[a.cor], transition: "width .7s cubic-bezier(.2,.8,.2,1)" }} />
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>{a.texto}</div>
          </div>
        ))}
      </div>

      {s && (
        <div style={{ ...card, padding: "22px 24px" }}>
          <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 2 }}>Audiência e conversa, no mesmo tempo</div>
          <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 14 }}>as duas séries normalizadas no próprio máximo, para caberem num eixo só de 0 a 1</div>
          <Duplo s={s} />
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: "1px solid var(--div)", paddingTop: 13, marginTop: 6 }}>
            {[["var(--aud)", "pessoas assistindo"], ["var(--part)", "fração que escreve"]].map(([c, l]) => (
              <span key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}><span style={{ width: 14, height: 3, background: c, borderRadius: 2 }} />{l}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
        {enquete && (
          <div style={{ ...card, padding: "20px 22px" }}>
            <div style={{ ...rot, marginBottom: 12 }}>Enquete do canal</div>
            <div style={{ fontSize: 16.5, fontWeight: 600, marginBottom: 4, textWrap: "pretty" }}>{enquete.pergunta}</div>
            <div className="mono" style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 14 }}>{enquete.total != null ? `${enquete.total} votos` : "votos não registrados"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {enquete.opcoes.map(o => <div key={o.texto} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 9, padding: "11px 13px", fontSize: 14 }}>{o.texto}{o.votos != null && enquete.total ? ` · ${pct((o.votos / enquete.total) * 100, 0)}` : ""}</div>)}
            </div>
          </div>
        )}
        <div style={{ ...card, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={rot}>O que não está neste relatório</div>
          <div style={{ fontSize: 14, color: "var(--ink2)", textWrap: "pretty" }}>Retenção, tempo médio assistido e origem de tráfego explicariam quem são as pessoas que assistiram sem escrever. Dependem de autorização do canal, não de código.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {["retenção de audiência", "tempo médio assistido", "origem de tráfego e demografia"].map(x => (
              <div key={x} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "var(--ink3)" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ink4)" }} />{x}</div>
            ))}
          </div>
          <div className="mono" style={{ marginTop: "auto", borderTop: "1px solid var(--div)", paddingTop: 12, fontSize: 12, color: "var(--ink3)" }}>
            nada aqui é estimado · cobertura {pct(live.cobertura)} na janela{live.acompanhada != null ? ` · ${pct(live.acompanhada)} da transmissão` : ""}
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: "20px 22px" }}>
        <div style={{ ...rot, marginBottom: 14 }}>O que o texto recebeu, e o que não recebeu</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {d.entrada.map(e => <div key={e} style={{ display: "flex", gap: 9, fontSize: 13.5 }}><span style={{ color: "var(--ok)" }}>✓</span><span style={{ color: "var(--ink2)" }}>{e}</span></div>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {d.nao_entrada.map(e => <div key={e} style={{ display: "flex", gap: 9, fontSize: 13.5 }}><span style={{ color: "var(--redInk)" }}>×</span><span style={{ color: "var(--ink3)" }}>{e}</span></div>)}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 14, borderTop: "1px solid var(--div)", paddingTop: 12, textWrap: "pretty" }}>
          O texto lê números agregados, não conversa. Nenhuma mensagem de chat sai do banco — é o que mantém a promessa de privacidade quando a camada com modelo entrar.
        </div>
      </div>

      <div style={{ ...card, padding: "20px 24px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240, fontSize: 14.5, color: "var(--ink2)", textWrap: "pretty" }}>Publicar gera um link sem login, para mandar a um anunciante ou parceiro. A versão pública não mostra custo de coleta nem detalhe de operação.</div>
        <div style={{ display: "flex", gap: 9, flex: "0 0 auto" }}>
          <button type="button" className="botao-claro" onClick={() => setExp(true)}>Exportar</button>
          <button type="button" className="botao-escuro" style={{ fontSize: 14, padding: "10px 18px", borderRadius: 9 }} onClick={() => setPub(true)}>Publicar link</button>
        </div>
      </div>

      {exp && <ExportarModal live={live} fechar={() => setExp(false)} />}
      {pub && <PublicarModal live={live} dossie={d} fechar={() => setPub(false)} />}
    </div>
  );
}
