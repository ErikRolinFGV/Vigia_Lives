import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useApi } from "../../api/client";
import type { LiveDetalhe, Serie, SubAba } from "../../api/types";
import { useCrumbs } from "../../components/AppLayout";
import { TAG } from "../../lib/estados";
import { apelido, dataLonga, duracao, nomeLive, pct } from "../../lib/format";
import { useSessao } from "../../state/sessao";
import { derivar } from "./derivados";
import { SecaoAudiencia, SecaoChat, SecaoQualidade, SecaoResumo } from "./secoesSerie";
import { Agendada, Perdida } from "./Estados";
import { SecaoApoio, SecaoComparacao, SecaoComunidade, SecaoConversa, SecaoDepois, SecaoModeracao, SecaoMomentos, SecaoPessoas, SecaoVideo } from "./secoesNovas";
import { AoVivo } from "./AoVivo";
import st from "./live.module.css";

const NOMES_SUB: Record<SubAba, string> = {
  resumo: "Resumo", audiencia: "Audiência", chat: "Chat",
  pessoas: "Pessoas e apoio", contexto: "Vídeo e contexto", qualidade: "Qualidade da coleta",
};

export function useLive(id: string) {
  const live = useApi<LiveDetalhe>(`/lives/${id}`);
  const serie = useApi<Serie>(live.dados?.tem_serie ? `/lives/${id}/serie` : null);
  return { live, serie };
}

export function useCrumbsLive(l: LiveDetalhe | null, replay = false) {
  useCrumbs(l ? [
    { label: l.canal.nome, to: `/yt/canais/${l.canal.id}` },
    {
      label: apelido(l.titulo), num: l.numero ? `#${l.numero}` : undefined,
      tag: replay ? { t: "replay", bg: "var(--s3)", bd: "var(--line2)", ink: "var(--ink2)" } : l.estado ? TAG[l.estado] : undefined,
    },
  ] : []);
}

export function LivePagina() {
  const { id = "" } = useParams();
  const { live, serie } = useLive(id);
  const l = live.dados;
  useCrumbsLive(l);

  if (live.erro) return <div className={st.pagina}><div className={st.conteudo}><div className={st.erro}>{live.erro.message}</div></div></div>;
  if (!l) return <div className={st.pagina}><div className={`${st.conteudo} ${st.carregando}`}>carregando a transmissão…</div></div>;

  if (l.estado === "agendada") return <Agendada live={l} />;
  if (l.estado === "perdida") return <Perdida live={l} />;
  if (l.estado === "no_ar") return <AoVivo live={l} serie={serie.dados} reler={() => { live.recarregar(); serie.recarregar(); }} />;
  return <LiveColetada live={l} s={serie.dados} carregandoSerie={serie.carregando} />;
}

function LiveColetada({ live, s, carregandoSerie }: { live: LiveDetalhe; s: Serie | null; carregandoSerie: boolean }) {
  const { conta } = useSessao();
  const [q, setQ] = useSearchParams();
  const aba = q.get("aba") === "relatorio" ? "relatorio" : "dados";
  const pedido = q.get("sub") as SubAba | null;
  const sub: SubAba = pedido && live.subabas.includes(pedido) ? pedido : "resumo";
  const d = useMemo(() => (s ? derivar(s) : null), [s]);

  const ir = (p: Record<string, string>) => setQ(prev => {
    const n = new URLSearchParams(prev);
    for (const [k, v] of Object.entries(p)) n.set(k, v);
    return n;
  }, { replace: true });

  const acompanhada = live.acompanhada;
  const parcialJanela = acompanhada != null && acompanhada < 90;

  return (
    <div className={`${st.pagina} view-in`}>
      <div className={st.conteudo}>
        <div style={{ padding: "32px 0 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>
              {live.canal.nome} · {dataLonga(live.inicio || live.agendada_para, conta.tz)} · {duracao(live.janela_coletada_s)} coletada{live.duracao_s ? ` de ${duracao(live.duracao_s)} no ar` : ""}
            </span>
            {acompanhada != null && (
              <div className={st.chip} style={{ background: parcialJanela ? "var(--ambT)" : "var(--okT)", borderColor: parcialJanela ? "var(--ambLine)" : "var(--okLine)" }}
                title="Quanto da transmissão inteira a janela de coleta acompanhou">
                <span className={st.chipDot} style={{ background: parcialJanela ? "var(--amb)" : "var(--ok)" }} />
                <span className="tnum" style={{ color: parcialJanela ? "var(--ambInk)" : "var(--okInk)" }}>{pct(acompanhada)} da transmissão acompanhada</span>
              </div>
            )}
            <div className={st.chip} style={{ background: "var(--okT)", borderColor: "var(--okLine)" }}
              title="Fração da janela de coleta em que o chat foi lido sem buraco">
              <span className={st.chipDot} style={{ background: "var(--ok)" }} />
              <span className="tnum" style={{ color: "var(--okInk)" }}>cobertura {pct(live.cobertura)} na janela coletada</span>
            </div>
            {s && <Link to={`/yt/lives/${live.id}/replay`} className={st.replay}>Ver como foi ao vivo ↺</Link>}
          </div>
          <h1 className={st.titulo}>
            {live.numero && <span className={st.num}>#{live.numero}</span>}
            {nomeLive(live.titulo, 3)}
          </h1>
        </div>

        <div className={st.abas} role="tablist">
          <button type="button" role="tab" aria-selected={aba === "dados"} className={st.aba} data-ativa={aba === "dados"} onClick={() => ir({ aba: "dados" })}>Dados da coleta</button>
          <button type="button" role="tab" aria-selected={aba === "relatorio"} className={st.aba} data-ativa={aba === "relatorio"} onClick={() => ir({ aba: "relatorio" })}>Relatório final · não gerado</button>
        </div>

        {aba === "dados" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {live.subabas.length > 1 && (
              <div className={st.seg} role="tablist">
                {live.subabas.map(k => (
                  <button key={k} type="button" role="tab" aria-selected={k === sub} className={st.segOpt} data-ativa={k === sub} onClick={() => ir({ sub: k })}>{NOMES_SUB[k]}</button>
                ))}
              </div>
            )}
            <div key={sub} style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeIn .25s ease-out both" }}>
              {carregandoSerie && live.tem_serie && !s ? <div className={st.carregando}>carregando a série…</div> : (
                <>
                  {sub === "resumo" && <><SecaoResumo live={live} s={s} /><SecaoMomentos live={live} /></>}
                  {sub === "audiencia" && s && <><SecaoAudiencia live={live} s={s} /><SecaoDepois live={live} /></>}
                  {sub === "chat" && s && d && <><SecaoChat s={s} d={d} /><SecaoConversa live={live} /><SecaoModeracao live={live} /></>}
                  {sub === "pessoas" && <><SecaoPessoas live={live} /><SecaoApoio live={live} /><SecaoComunidade live={live} /></>}
                  {sub === "contexto" && <><SecaoVideo live={live} s={s} /><SecaoComparacao live={live} /></>}
                  {sub === "qualidade" && <SecaoQualidade live={live} s={s} d={d} />}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={st.carregando}>O relatório final entra na etapa 5.</div>
        )}
      </div>
    </div>
  );
}
