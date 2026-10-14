// Relatório público: /r/:canal/:slug, sem login. Só lê a projeção pública
// da API (agregados); cota, custo, autores e texto de chat não chegam aqui.
import { useParams } from "react-router-dom";
import { useApi } from "../api/client";
import type { RelatorioPublico } from "../api/types";
import { CanalAvatar } from "../components/CanalFoto";
import { SerieChart } from "../components/charts";
import { Logo, ThemeToggle } from "../components/basicos";
import { passoTicks } from "../lib/chart";
import { dataCurta, dataLonga, duracao, hhmm, n, nomeLive, pct } from "../lib/format";
import { useSessao } from "../state/sessao";

const card = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "20px 22px" } as const;
const rot = { fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase" as const, color: "var(--ink3)" };
const COR = { aud: "var(--aud)", msg: "var(--msg)", part: "var(--part)", ink3: "var(--ink3)" } as const;

export function Publico() {
  const { canal = "", slug = "" } = useParams();
  const { conta } = useSessao();
  const { dados: r, erro } = useApi<RelatorioPublico>(`/r/${canal}/${slug}`);

  const casca = (filho: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", justifyContent: "center", padding: "0 24px 72px" }}>
      <div style={{ width: "100%", maxWidth: 980 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "18px 0 0" }}><ThemeToggle /></div>
        {filho}
      </div>
    </div>
  );
  if (erro) return casca(<div style={{ ...card, marginTop: 40, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Relatório indisponível</div><div style={{ color: "var(--ink3)" }}>{erro.message}</div></div>);
  if (!r) return casca(<div style={{ padding: 48, color: "var(--ink3)" }}>carregando o relatório…</div>);

  const tz = conta.tz;
  const d = r.dossie;
  const enquete = r.comunidade.enquetes.find(e => e.detalhe);
  const kpis = [
    { k: "Pico de audiência", v: n(r.pico), s: "assistindo ao mesmo tempo", c: "var(--aud)" },
    { k: "Pessoas no chat", v: n(r.pessoas), s: r.pico ? `${pct((r.pessoas / r.pico) * 100)} do pico` : "", c: "var(--msg)" },
    { k: "Mensagens", v: n(r.mensagens), s: "durante a transmissão", c: "var(--ink)" },
    { k: "Momentos", v: n(r.momentos.length), s: r.momentos.length ? "de reação detectados" : "nenhum acima do limiar", c: "var(--ink)" },
  ];

  return casca(
    <div className="view-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 0 6px" }}>
        <CanalAvatar id={r.canal.handle || r.canal.nome} nome={r.canal.nome} foto={r.canal.foto} size={56} />
        <div>
          <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>{r.canal.nome}</div>
          <div className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>{r.canal.handle} · relatório de transmissão</div>
        </div>
      </div>
      <div>
        <h1 style={{ fontFamily: "Figtree, sans-serif", fontSize: "clamp(24px,3vw,32px)", lineHeight: 1.18, fontWeight: 800, letterSpacing: "-.025em", margin: "0 0 10px", textWrap: "pretty" }}>{nomeLive(r.titulo, 3)}</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>{dataLonga(r.inicio, tz)} · {duracao(r.janela_coletada_s)} acompanhada{r.duracao_s ? ` de ${duracao(r.duracao_s)} no ar` : ""}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--okInk)", background: "var(--okT)", border: "1px solid var(--okLine)", borderRadius: 99, padding: "4px 11px" }}>cobertura {pct(r.cobertura)} na janela coletada</span>
          <a href={r.url_video} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>Ver no YouTube ↗</a>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 16 }}>
        {kpis.map(k => (
          <div key={k.k} style={{ ...card, padding: "18px 20px" }}>
            <div style={{ ...rot, marginBottom: 7 }}>{k.k}</div>
            <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 31, lineHeight: 1, fontWeight: 700, letterSpacing: "-.025em", color: k.c }}>{k.v}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6 }}>{k.s}</div>
          </div>
        ))}
      </div>

      {d && (
        <div style={{ background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 14, padding: "26px 28px" }}>
          <div style={{ ...rot, marginBottom: 14 }}>Como essa live performou</div>
          <div style={{ fontSize: "clamp(19px,2.2vw,25px)", lineHeight: 1.38, fontWeight: 600, letterSpacing: "-.015em", maxWidth: "44ch", textWrap: "pretty" }}>{d.veredito}</div>
          <div style={{ fontSize: 15.5, color: "var(--ink2)", marginTop: 14, maxWidth: "62ch", textWrap: "pretty" }}>{d.veredito_sub}</div>
        </div>
      )}

      {r.serie && (
        <>
          <div style={{ ...card, background: "var(--audT)", borderColor: "var(--audLine)", paddingBottom: 8 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700 }}>Pessoas assistindo ao mesmo tempo</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 6 }}>cada ponto é uma janela de 60 segundos</div>
            <SerieChart vals={r.serie.esp} times={r.serie.t} H={220} tipo="linha" cor="var(--aud)" fs={13} every={passoTicks(r.serie.t.length)} />
          </div>
          <div style={{ ...card, background: "var(--partT)", borderColor: "var(--partLine)", paddingBottom: 8 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700 }}>Fração que escreveu no chat</div>
            <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 6 }}>mesmo eixo de tempo do gráfico acima</div>
            <SerieChart vals={r.serie.part} times={r.serie.t} H={180} tipo="linha" cor="var(--part)" kind="pct" fs={13} every={passoTicks(r.serie.t.length)} />
          </div>
        </>
      )}

      {d && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {d.insights.map(i => (
              <div key={i.titulo} style={{ ...card, borderLeft: "3px solid var(--msg)", borderRadius: 12, padding: "16px 19px" }}>
                <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, marginBottom: 5 }}>{i.titulo}</div>
                <div style={{ fontSize: 14.5, color: "var(--ink2)", textWrap: "pretty" }}>{i.texto}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 16 }}>
            {d.achados.map(a => (
              <div key={a.rotulo} style={card}>
                <div style={rot}>{a.rotulo}</div>
                <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 30, fontWeight: 700, color: COR[a.cor], margin: "8px 0 4px" }}>{a.valor} <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink3)" }}>{a.unidade}</span></div>
                <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>{a.texto}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {r.momentos.length > 0 && (
        <div style={card}>
          <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>Momentos em que o chat reagiu</div>
          {r.momentos.map(m => (
            <div key={m.t} style={{ display: "flex", alignItems: "center", gap: 16, padding: "11px 0", borderTop: "1px solid var(--div)" }}>
              <span className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 18, fontWeight: 700, width: 56 }}>{hhmm(m.t)}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: "var(--ink2)" }}>{m.tipo === "queda_audiencia" ? `queda de audiência · −${n(m.magnitude * 100)}%` : `pico de chat · ${n(m.magnitude, 1)} σ`}</span>
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="ver-trecho">Ver trecho ↗</a>
            </div>
          ))}
        </div>
      )}

      {enquete && (
        <div style={card}>
          <div style={{ ...rot, marginBottom: 10 }}>Enquete do canal</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{enquete.pergunta}</div>
          {enquete.opcoes.map(o => <div key={o.texto} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", fontSize: 14, marginBottom: 7 }}>{o.texto}{o.votos != null && enquete.total ? ` · ${pct((o.votos / enquete.total) * 100, 0)}` : ""}</div>)}
        </div>
      )}

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12.5, color: "var(--ink3)" }}>
        <span style={{ flex: 1, minWidth: 260, textWrap: "pretty" }}>
          {r.publicado.autor_nome ? `Publicado por ${r.publicado.autor_nome}` : "Publicado"}
          {r.publicado.instituicao ? ` · ${r.publicado.instituicao}` : ""}
          {r.publicado.orcid ? <> · ORCID <a href={`https://orcid.org/${r.publicado.orcid}`} target="_blank" rel="noopener noreferrer">{r.publicado.orcid}</a></> : ""}
          {` em ${dataCurta(r.publicado.em, tz)}. Nada neste relatório é estimado; nenhum autor é identificado.`}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Logo size={18} /> gerado com vigia</span>
      </div>
    </div>,
  );
}
