// Tela ao vivo. Dois modos:
//  - coleta em andamento: a série vem da API e é relida periodicamente;
//  - replay: a série de uma coleta encerrada avança janela a janela, como
//    avançou no dia. A tela diz que é replay em todo momento.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LiveDetalhe, Serie } from "../../api/types";
import { SerieChart } from "../../components/charts";
import { hhmm, n, nomeLive, dataCurta } from "../../lib/format";
import { useSessao } from "../../state/sessao";
import { useCrumbsLive, useLive } from "./LivePagina";
import st from "./live.module.css";

const COTA_DIA = 10000;
const PASSO_REPLAY_MS = 2400;
const RELER_MS = 20000;

function ultimoNaoNulo<T>(a: (T | null)[], ate: number): T | null {
  for (let i = ate; i >= 0; i--) if (a[i] != null) return a[i];
  return null;
}

export function AoVivo({ live, serie, replay = false }: { live: LiveDetalhe; serie: Serie | null; replay?: boolean }) {
  const { conta } = useSessao();
  const nav = useNavigate();
  const total = serie?.t.length ?? 0;
  // o replay começa a 40% da transmissão, como no protótipo: dá contexto
  // sem obrigar a esperar o começo morno da live
  const [li, setLi] = useState(() => (replay ? Math.max(0, Math.floor(total * 0.4)) : total - 1));

  useEffect(() => { if (!replay) setLi(total - 1); }, [replay, total]);
  useEffect(() => {
    if (!replay) {
      const iv = setInterval(() => nav(0), RELER_MS);   // coleta real: relê a página
      return () => clearInterval(iv);
    }
    const iv = setInterval(() => setLi(i => Math.min(total - 1, i + 1)), PASSO_REPLAY_MS);
    return () => clearInterval(iv);
  }, [replay, total, nav]);

  if (!serie || total === 0) {
    return (
      <div className={`${st.pagina} view-in`}><div className={st.conteudo}>
        <div className={st.carregando}>A coleta começou e ainda não fechou a primeira janela de 60 s.</div>
      </div></div>
    );
  }

  const fim = Math.max(0, li);
  const esp = serie.esp.slice(0, fim + 1), mpm = serie.mpm.slice(0, fim + 1), tt = serie.t.slice(0, fim + 1);
  const espNow = ultimoNaoNulo(serie.esp, fim);
  const partNow = ultimoNaoNulo(serie.part, fim);
  const validos = esp.filter((v): v is number => v != null);
  const pico = validos.length ? Math.max(...validos) : null;
  const msgs = mpm.reduce((a, v) => a + v, 0);
  const cota = serie.cota.slice(0, fim + 1).reduce((a, v) => a + v, 0);
  let lead = 0;
  while (lead < esp.length && esp[lead] == null) lead++;
  const consultadas = Math.max(0, fim + 1 - lead);
  const ok = validos.length;
  const moms = live.momentos.filter(m => m.t <= serie.t[fim]).sort((a, b) => b.t - a.t);
  const decorrido = (serie.t[fim] - serie.t[0]) + 60;
  const every = Math.max(6, Math.round(fim / 6));
  const cotaPct = (cota / COTA_DIA) * 100;
  const kpi = (bg: string, bd: string) => ({ background: bg, border: `1px solid ${bd}`, borderRadius: 14, padding: "18px 20px" });
  const rot = { fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase" as const, color: "var(--ink3)", marginBottom: 7 };
  const valor = (c: string) => ({ fontFamily: "Figtree, sans-serif", fontSize: 34, lineHeight: 1, fontWeight: 700, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums", color: c });

  return (
    <div className={`${st.pagina} view-in`}>
      <div className={st.conteudo}>
        {replay && (
          <div style={{ marginTop: 24, background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13.5 }}>
            <b>Replay da coleta de {dataCurta(live.inicio, conta.tz)}.</b>
            <span style={{ color: "var(--ink2)" }}>Nada aqui está acontecendo agora: a série gravada avança uma janela a cada {PASSO_REPLAY_MS / 1000} s, com os números de cada minuto.</span>
            <Link to={`/yt/lives/${live.id}`} className={st.botao} style={{ marginLeft: "auto", fontSize: 13, padding: "7px 13px" }}>Voltar aos dados</Link>
          </div>
        )}

        <div style={{ padding: "28px 0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 11, flexWrap: "wrap" }}>
            <div className={st.selo} style={{ background: "var(--redT)", borderColor: "var(--redLine)", marginBottom: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)", animation: "pulseDot 1.4s infinite" }} />
              <span className={st.seloTxt} style={{ color: "var(--redInk)" }}>{replay ? "REPLAY" : "NO AR"}</span>
            </div>
            <span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>
              {live.canal.nome} · {replay ? `minuto ${hhmm(serie.t[fim])} da transmissão` : `coletando há ${hhmm(decorrido).replace(":", " h ")} min`}
            </span>
            {!replay && <button type="button" className={st.botao} style={{ marginLeft: "auto" }} disabled title="Encerrar coleta entra junto com o vigia (etapa 4)">Encerrar coleta</button>}
          </div>
          <div style={{ height: 2, background: "var(--track)", borderRadius: 2, overflow: "hidden", marginBottom: 13 }}>
            <div style={{ width: "24%", height: "100%", background: "var(--red)", borderRadius: 2, animation: "sweep 2.4s cubic-bezier(.4,0,.6,1) infinite" }} />
          </div>
          <h1 className={st.titulo}>{nomeLive(live.titulo, 3)}</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 16 }}>
          <div style={kpi("var(--audT)", "var(--audLine)")}>
            <div style={rot}>Assistindo agora</div>
            <div style={valor("var(--aud)")}>{n(espNow)}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6 }}>pico até agora {n(pico)}</div>
          </div>
          <div style={kpi("var(--msgT)", "var(--msgLine)")}>
            <div style={rot}>Mensagens</div>
            <div style={valor("var(--msg)")}>{n(msgs)}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6 }}>{n(mpm[fim])} por minuto agora</div>
          </div>
          <div style={kpi("var(--partT)", "var(--partLine)")}>
            <div style={rot}>Participação</div>
            <div style={valor("var(--part)")}>{partNow == null ? "n/d" : n(partNow * 100, 2) + "%"}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6 }}>escreveram na última janela</div>
          </div>
          <div style={kpi("var(--rose)", "var(--roseLine)")}>
            <div style={rot}>Cota desta coleta</div>
            <div style={valor("var(--ink)")}>{n(cota)}</div>
            <div style={{ height: 6, background: "var(--track)", borderRadius: 3, overflow: "hidden", marginTop: 9 }}>
              <div style={{ width: Math.min(100, cotaPct) + "%", height: "100%", background: "var(--accent)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 7 }}>{n(cotaPct, 1)}% da cota do dia</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 12, marginBottom: 12 }}>
          <div style={{ ...kpi("var(--audT)", "var(--audLine)"), paddingBottom: 8 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 2 }}>Pessoas assistindo ao mesmo tempo</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 6 }}>a curva cresce enquanto a transmissão está no ar</div>
            <SerieChart vals={esp} times={tt} H={220} tipo="linha" cor="var(--aud)" every={every} animar={false} cabeca />
          </div>
          <div style={{ ...kpi("var(--msgT)", "var(--msgLine)"), paddingBottom: 8 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 2 }}>Mensagens por minuto</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 6 }}>cada barra é uma janela de 60 segundos já fechada</div>
            <SerieChart vals={mpm} times={tt} H={220} tipo="barras" cor="var(--msg)" every={every} animar={false} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 12 }}>
          <div className={st.cartao} style={{ marginBottom: 0, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 13, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>Momentos detectados até agora</div>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{n(moms.length)} nesta coleta</span>
            </div>
            {moms.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {moms.map(m => (
                  <div key={m.t} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px", display: "flex", alignItems: "center", gap: 12, animation: "riseIn .3s ease-out both" }}>
                    <span className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 16, fontWeight: 700, width: 48, flex: "0 0 48px" }}>{hhmm(m.t)}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--ink2)" }}>{m.tipo === "queda_audiencia" ? "queda de audiência" : "pico de chat"}</span>
                    <span className="mono tnum" style={{ fontSize: 12.5, flex: "0 0 auto", color: m.tipo === "pico_chat" && m.magnitude >= 8 ? "var(--msg)" : "var(--ink3)" }}>
                      {m.tipo === "queda_audiencia" ? `−${n(m.magnitude * 100)}%` : `${n(m.magnitude, 1)} σ`}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 13.5, color: "var(--ink3)", padding: "6px 0", textWrap: "pretty" }}>Nenhuma janela passou do limiar ainda. A detecção compara cada minuto com a média móvel e não custa cota.</div>}
          </div>

          <div className={st.cartao} style={{ marginBottom: 0, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>Coleta em andamento</div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <span style={{ fontSize: 13.5, color: "var(--ink2)" }}>Consulta de espectadores</span>
                <b className="mono tnum" style={{ fontSize: 13, color: "var(--ink2)" }}>{consultadas ? n((ok / consultadas) * 100, 1) + "%" : "—"}</b>
              </div>
              <div className={st.trilho}><div style={{ width: consultadas ? (ok / consultadas) * 100 + "%" : 0, height: "100%", background: "var(--aud)" }} /></div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 7 }}>{n(ok)} de {n(consultadas)} consultas com número reportado</div>
              {lead > 0 && <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 4 }}>as {n(lead)} primeiras janelas saem da conta: o YouTube ainda não reportava simultâneos</div>}
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6, textWrap: "pretty" }}>A cobertura do chat, que é a declarada no relatório, tem janela e denominador próprios e só fecha no fim da coleta.</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--div)", paddingTop: 13 }}>
              <div className={st.kv} style={{ fontSize: 13.5 }}><span>Pessoas distintas no chat</span><span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>só no fechamento</span></div>
              <div className={st.kv} style={{ fontSize: 13.5, borderTop: 0, paddingTop: 0 }}><span>Enquetes capturadas</span><span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>não consta ao vivo</span></div>
            </div>
            <div style={{ marginTop: "auto", background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 11, padding: "13px 15px", fontSize: 13, color: "var(--ink2)", textWrap: "pretty" }}>
              {replay
                ? "No dia, o relatório ficou pronto quando a coleta encerrou. Os dados completos estão na aba da transmissão."
                : "O relatório final fica pronto quando a transmissão encerrar. Pode fechar a aba: quem garante a coleta é o processo."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Rota /yt/lives/:id/replay */
export function Replay() {
  const { id = "" } = useParams();
  const { live, serie } = useLive(id);
  useCrumbsLive(live.dados, true);
  if (!live.dados || !serie.dados) {
    return <div className={st.pagina}><div className={`${st.conteudo} ${st.carregando}`}>{live.erro?.message || serie.erro?.message || "carregando o replay…"}</div></div>;
  }
  return <AoVivo live={live.dados} serie={serie.dados} replay />;
}
