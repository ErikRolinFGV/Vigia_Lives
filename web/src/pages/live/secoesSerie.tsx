// Seções que saem da série minuto a minuto: Resumo, Audiência, Chat e
// Qualidade da coleta. Os painéis com eixo de tempo dividem a mesma geometria
// (geo 26) e o mesmo índice de hover.
import type { LiveDetalhe, Momento, Serie } from "../../api/types";
import { BarrasHtml, SerieChart, type Marca } from "../../components/charts";
import { Grade, Kpis, NotaPainel, Painel, SemDado, useHoverSync } from "../../components/blocos";
import { passoTicks, px } from "../../lib/chart";
import { duracao, hhmm, n, pct } from "../../lib/format";
import type { Derivados } from "./derivados";

const GEO = 26;

function marcasMomentos(momentos: Momento[], s: Serie) {
  return (g: Parameters<typeof px>[2]): Marca[] => momentos.map(m => {
    const i = s.t.findIndex(t => t >= m.t);
    const forte = m.tipo === "pico_chat" && m.magnitude >= 8;
    return {
      x: px(i < 0 ? s.t.length - 1 : i, s.t.length, g),
      stroke: m.tipo === "queda_audiencia" ? "var(--redSoft)" : forte ? "var(--msg)" : "var(--msgMid)",
      w: forte ? 2.4 : 1.4,
    };
  });
}

function readout(s: Serie, i: number) {
  if (i < 0) return "passe o mouse para ler o mesmo instante em todos os gráficos";
  const p = s.part[i];
  return `${hhmm(s.t[i])} · ${n(s.esp[i])} assistindo · ${n(s.mpm[i])} msgs/min · ${p == null ? "n/d" : n(p * 100, 3) + "%"} escreveram`;
}

function PainelAudiencia({ s, live, hover }: { s: Serie; live: LiveDetalhe; hover: ReturnType<typeof useHoverSync> }) {
  return (
    <Painel tom="aud" estilo={{ paddingBottom: 8 }}
      titulo="Pessoas assistindo ao mesmo tempo"
      sub="as marcas verticais são os momentos em que o chat reagiu"
      direita={<span className="mono tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{readout(s, hover.idx)}</span>}>
      <div {...hover.area}>
        <SerieChart vals={s.esp} times={s.t} H={240} tipo="linha" cor="var(--aud)" fs={13} geo={GEO}
          every={passoTicks(s.t.length)} hoverIdx={hover.idx} marcas={marcasMomentos(live.momentos, s)} />
      </div>
    </Painel>
  );
}

export function SecaoResumo({ live, s }: { live: LiveDetalhe; s: Serie | null }) {
  const hover = useHoverSync(s?.t.length ?? 0, GEO);
  const minutos = s ? s.t.length : null;
  const nMom = live.momentos.length;
  const kpis = [
    { k: "Pico de audiência", v: n(live.pico), n: "assistindo ao mesmo tempo", c: "var(--aud)" },
    { k: "Pessoas no chat", v: n(live.pessoas), n: live.pico ? `${pct((live.pessoas / live.pico) * 100)} do pico` : "pico não registrado", c: "var(--msg)" },
    { k: "Mensagens", v: n(live.mensagens_live), n: minutos ? `${n(live.mensagens_live / minutos)} por minuto em média` : "durante a transmissão" },
    { k: "Momentos", v: n(nMom), n: nMom ? "detectados na coleta" : "nenhum acima do limiar", c: nMom ? "var(--ink)" : "var(--ink3)" },
  ];
  return (
    <>
      <Kpis itens={kpis} />
      {s ? <PainelAudiencia s={s} live={live} hover={hover} /> : (
        <SemDado titulo="Esta coleta não tem série minuto a minuto"
          texto="Nenhuma leitura de espectadores foi gravada para esta transmissão. Os totais acima vêm do chat coletado; a curva fica marcada em vez de preenchida com número estimado." />
      )}
    </>
  );
}

export function SecaoAudiencia({ live, s }: { live: LiveDetalhe; s: Serie }) {
  const hover = useHoverSync(s.t.length, GEO);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PainelAudiencia s={s} live={live} hover={hover} />
      <Painel tom="part" estilo={{ paddingBottom: 8 }} titulo="Taxa de participação" sub="fração dos espectadores que escreveu na janela">
        <div {...hover.area}>
          <SerieChart vals={s.part} times={s.t} H={200} tipo="linha" cor="var(--part)" kind="pct" fs={13} geo={GEO} every={passoTicks(s.t.length)} hoverIdx={hover.idx} />
        </div>
      </Painel>
    </div>
  );
}

export function SecaoChat({ s, d }: { s: Serie; d: Derivados }) {
  const hover = useHoverSync(s.t.length, GEO);
  const maxHist = Math.max(1, ...d.hist.map(h => h.n));
  return (
    <>
      <Painel tom="msg" estilo={{ paddingBottom: 8 }} titulo="Mensagens por minuto" sub="cada barra é uma janela de 60 segundos">
        <div {...hover.area}>
          <SerieChart vals={s.mpm} times={s.t} H={200} tipo="barras" cor="var(--msg)" fs={13} geo={GEO} every={passoTicks(s.t.length)} hoverIdx={hover.idx} />
        </div>
      </Painel>
      <Grade>
        <Painel tom="msg" estilo={{ paddingBottom: 8 }} titulo="Quando o chat aconteceu" sub="mensagens acumuladas ao longo da transmissão">
          <SerieChart vals={d.acum} times={s.t} H={220} tipo="linha" cor="var(--msg)" every={passoTicks(s.t.length, 5)} />
          <NotaPainel tom="var(--msgLine)">
            Metade das <b>{n(d.total)}</b> mensagens só havia sido escrita em <b>{hhmm(s.t[d.metadeIdx])}</b>, com {pct(d.metadeFrac * 100, 0)} da coleta já passada.
            {d.corr != null && <> Audiência e chat {d.corr >= 0.5 ? "sobem juntos" : d.corr <= -0.3 ? "andam em sentidos opostos" : "quase não andam juntos"} em números absolutos (r = {n(d.corr, 2)}){d.corr >= 0.5 ? ", mesmo com a participação caindo" : ""}.</>}
          </NotaPainel>
        </Painel>
        <Painel tom="msg" titulo="Como o chat se distribuiu" sub="quantas janelas de 60 s em cada faixa de intensidade">
          <div style={{ marginTop: 4 }}>
            <BarrasHtml itens={d.hist.map(h => ({
              rotulo: h.faixa, valor: n(h.n), h: Math.max(6, Math.round((h.n / maxHist) * 118)) + "px",
              fill: h.forte ? "var(--msgSoft)" : "var(--msgT)", stroke: h.forte ? "var(--msg)" : "var(--msgLine)", ink: h.forte ? "var(--msg)" : "var(--ink3)",
            }))} />
          </div>
          <NotaPainel tom="var(--msgLine)">
            A janela mediana teve <b>{n(d.mediana)}</b> mensagens por minuto. O pico de <b>{n(d.maxMpm)}</b> é {d.mediana ? n(d.maxMpm / d.mediana, 1) + "×" : "—"} a mediana — é essa distância que a detecção de momentos mede.
          </NotaPainel>
        </Painel>
      </Grade>
    </>
  );
}

export function SecaoQualidade({ live, s, d }: { live: LiveDetalhe; s: Serie | null; d: Derivados | null }) {
  if (!s || !d) {
    return <SemDado titulo="Sem consultas de audiência" texto="Esta coleta não gravou leituras de espectadores, então não há faixa de consulta a mostrar." />;
  }
  const cor = (v: number | null, i: number) => v != null ? "var(--aud)" : i < d.lead ? "var(--line2)" : "var(--redSoft)";
  const legenda = (c: string, t: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink2)" }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: c }} />{t}
    </span>
  );
  return (
    <Painel>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>Consulta de espectadores, janela por janela</div>
        <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>cada traço é uma consulta de 60 s ao contador de simultâneos</span>
        <span className="mono tnum" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink2)" }}>{n(d.comNumero)} de {n(s.t.length)} com número reportado</span>
      </div>
      <div style={{ display: "flex", gap: 1.5, alignItems: "stretch", height: 34 }}>
        {s.esp.map((v, i) => <div key={i} title={hhmm(s.t[i])} style={{ flex: 1, minWidth: 0, background: cor(v, i), borderRadius: 1.5 }} />)}
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12, borderTop: "1px solid var(--div)", paddingTop: 12 }}>
        {legenda("var(--aud)", "número reportado")}
        {legenda("var(--redSoft)", `consulta sem resposta · ${n(d.semResposta)} janelas, nada interpolado`)}
        {legenda("var(--line2)", `antes do primeiro número · ${n(d.lead)} janelas no começo da coleta`)}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 11, background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 9, padding: "11px 13px", textWrap: "pretty" }}>
        O contador do YouTube oscila: entre janelas vizinhas a variação chega a <b>±{n(d.jitter)}</b> espectadores. Por isso a plataforma não mostra crescimento por minuto — nessa escala o número seria ruído da fonte, não movimento de público.
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 11, fontSize: 12.5, color: "var(--ink3)" }}>
        <span style={{ flex: 1, minWidth: 260, textWrap: "pretty" }}>
          Esta faixa é a consulta de audiência. A cobertura de <b style={{ color: "var(--okInk)" }}>{pct(live.cobertura)}</b> do topo da página se refere à coleta do chat dentro da janela em que o coletor esteve ligado
          ({duracao(live.janela_coletada_s)}{live.duracao_s ? ` de ${duracao(live.duracao_s)} no ar` : ""}) — são duas medidas diferentes.
        </span>
        <span className="mono" style={{ flex: "0 0 auto" }}>custo desta coleta: {n(live.cota_unidades)} un. de cota</span>
      </div>
    </Painel>
  );
}
