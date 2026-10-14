// Seções novas da v2. Cada uma lê /api/lives/{id}/secoes/{nome}; nenhum
// número fica fixo no código. Campo sem dado aparece como "—" com o motivo.
import type { ReactNode } from "react";
import { useApi } from "../../api/client";
import type {
  LiveDetalhe, Serie, SecApoio, SecComparacao, SecComunidade, SecConversa, SecDepois, SecModeracao, SecMomentos, SecPessoas, SecVideo,
} from "../../api/types";
import { BarrasHtml, SerieChart } from "../../components/charts";
import { BarraH, Grade, Kpis, NotaPainel, Painel, Secao, SemDado } from "../../components/blocos";
import { passoTicks } from "../../lib/chart";
import { brl, compacto, dataCurta, dataHora, duracao, hhmm, hora, minutos, n, nomeLive, pct } from "../../lib/format";
import { useSessao } from "../../state/sessao";

function useSecao<T>(live: LiveDetalhe, nome: string) {
  return useApi<T>(`/lives/${live.id}/secoes/${nome}`);
}

const yt = (live: LiveDetalhe, t: number) => `https://youtube.com/watch?v=${live.id}&t=${t}s`;

function Carregando({ titulo }: { titulo: string }) {
  return <div style={{ fontSize: 13.5, color: "var(--ink3)", padding: "10px 2px" }}>carregando {titulo.toLowerCase()}…</div>;
}

function Bloco<T>({ titulo, primeira, req, children }: {
  titulo: string; primeira?: boolean; req: { dados: T | null; erro: Error | null }; children: (d: T) => ReactNode;
}) {
  return (
    <>
      <Secao titulo={titulo} primeira={primeira} />
      {req.erro ? <SemDado titulo="Não consegui calcular esta seção" texto={req.erro.message} />
        : req.dados ? children(req.dados) : <Carregando titulo={titulo} />}
    </>
  );
}

/** Ticks igualmente espaçados para as séries de 5 min. */
function ticks5(ts: number[]) {
  if (!ts.length) return [];
  const a = ts[0], b = ts[ts.length - 1] + 300;
  return [0, 0.25, 0.5, 0.75, 1].map(f => hhmm(Math.round(a + (b - a) * f)));
}

function Ticks({ itens }: { itens: string[] }) {
  return (
    <div className="mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 11, color: "var(--ink3)" }}>
      {itens.map((t, i) => <span key={i}>{t}</span>)}
    </div>
  );
}

function BarrasTempo({ valores, cor, corMax, altura = 150, tip, borda }: {
  valores: number[]; cor: string; corMax: string; altura?: number; tip: (i: number) => string; borda: string;
}) {
  const max = Math.max(0, ...valores);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: altura, borderBottom: `1px solid ${borda}` }}>
      {valores.map((v, i) => (
        <div key={i} title={tip(i)} style={{
          flex: 1, minWidth: 0, height: max ? Math.max(2, (v / max) * 100) + "%" : "2%",
          background: max && v === max ? corMax : cor, borderRadius: "4px 4px 0 0",
          animation: "growY .7s cubic-bezier(.2,.8,.2,1) both", transformOrigin: "50% 100%",
        }} />
      ))}
    </div>
  );
}

function Tabela({ colunas, linhas, larguras, esquerda = 1 }: { colunas: string[]; linhas: ReactNode[][]; larguras: string; esquerda?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: larguras, gap: 12, fontSize: 11.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink3)", paddingBottom: 8, borderBottom: "1px solid var(--div)" }}>
        {colunas.map((c, i) => <span key={c} style={{ textAlign: i < esquerda ? "left" : "right" }}>{c}</span>)}
      </div>
      {linhas.map((l, j) => (
        <div key={j} className="tnum" style={{ display: "grid", gridTemplateColumns: larguras, gap: 12, alignItems: "center", fontSize: 13.5, padding: "9px 0", borderBottom: "1px solid var(--div)" }}>
          {l.map((c, i) => <span key={i} style={{ textAlign: i < esquerda ? "left" : "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>)}
        </div>
      ))}
    </div>
  );
}

const Selo = ({ t }: { t: "membro" | "moderador" | "dono" }) => {
  const c = t === "membro" ? ["var(--partT)", "var(--part)", "var(--partLine)"] : t === "moderador" ? ["var(--audT)", "var(--aud)", "var(--audLine)"] : ["var(--redT)", "var(--redInk)", "var(--redLine)"];
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: c[0], color: c[1], border: `1px solid ${c[2]}` }}>{t}</span>;
};

// ================================================================ Resumo

export function SecaoMomentos({ live }: { live: LiveDetalhe }) {
  const req = useSecao<SecMomentos>(live, "momentos");
  return (
    <Bloco titulo="Momentos" req={req}>{d => {
      const r = d.recordes;
      const kpis = [
        r.audiencia
          ? { k: "Pico de audiência", v: n(r.audiencia.valor), n: `pessoas assistindo às ${hhmm(r.audiencia.t)}`, c: "var(--aud)", url: yt(live, r.audiencia.t) }
          : { k: "Pico de audiência", v: "—", n: "sem leitura de espectadores", c: "var(--aud)" },
        r.chat
          ? { k: "Pico de chat", v: n(r.chat.valor), n: `mensagens no minuto das ${hhmm(r.chat.t)}`, c: "var(--msg)", url: yt(live, r.chat.t) }
          : { k: "Pico de chat", v: "—", n: "sem série de chat", c: "var(--msg)" },
        r.apoio
          ? { k: "Pico de apoio", v: brl(r.apoio.valor_brl), n: `em Super Chats entre ${hhmm(r.apoio.t)} e ${hhmm(r.apoio.t_fim)}`, c: "var(--part)", url: yt(live, r.apoio.t) }
          : { k: "Pico de apoio", v: brl(0), n: "nenhum Super Chat durante a transmissão", c: "var(--part)" },
      ];
      return (
        <>
          <Kpis itens={kpis} min={220} />
          <Painel titulo="Os momentos, um a um" direita={<span style={{ fontSize: 12.5, color: "var(--ink3)" }}>em ordem de acontecimento{d.mediana_mpm != null ? ` · mediana do chat: ${n(d.mediana_mpm)} mensagens por minuto` : ""}</span>}>
            {d.lista.length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)", padding: "8px 0", textWrap: "pretty" }}>Nenhuma janela de 60 s passou do limiar de detecção. A conversa foi contínua, sem reação concentrada — é resultado, não falha de coleta.</div>}
            {d.lista.map(m => {
              const queda = m.tipo === "queda_audiencia";
              return (
                <div key={m.t} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: 18, alignItems: "center", padding: "15px 0", borderTop: "1px solid var(--div)" }}>
                  <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 21, fontWeight: 700 }}>{hhmm(m.t)}</div>
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="tnum" style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--ink2)" }}>
                      <span style={{ fontWeight: 600, color: queda ? "var(--redInk)" : "var(--msg)" }}>
                        {queda ? `queda de audiência · −${n(m.magnitude * 100)}%` : `pico de chat · ${n(m.magnitude, 1)} σ`}
                      </span>
                      <span><b>{n(m.msgs)}</b> mensagens{m.vezes_mediana != null ? ` · ${n(m.vezes_mediana, 1)}× a mediana` : ""}</span>
                      <span><b>{n(m.espectadores)}</b> assistindo</span>
                      <span>{m.superchats ? `${n(m.superchats)} Super Chat${m.superchats > 1 ? "s" : ""}` : "sem Super Chats"}</span>
                    </div>
                    {m.palavras.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {m.palavras.map(p => <span key={p} style={{ fontSize: 12.5, background: "var(--msgT)", border: "1px solid var(--msgLine)", borderRadius: 99, padding: "3px 10px" }}>{p}</span>)}
                      </div>
                    )}
                  </div>
                  <a href={yt(live, m.t)} target="_blank" rel="noopener noreferrer" className="ver-trecho">Ver trecho ↗</a>
                </div>
              );
            })}
          </Painel>
        </>
      );
    }}</Bloco>
  );
}

// ================================================================ Audiência

export function SecaoDepois({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const req = useSecao<SecDepois>(live, "depois");
  return (
    <Bloco titulo="Depois da live" req={req}>{d => {
      const p = Object.fromEntries(d.pontos.map(x => [x.rotulo, x.views]));
      const fim = p["ao fim"];
      const kpis = [
        { k: "Views ao fim da live", v: compacto(fim), n: fim != null ? "inclui quem assistiu ao vivo" : "não consta: a coleta encerrou antes do fim" },
        { k: "Em 24 horas", v: compacto(p["+24 h"]), n: p["+24 h"] != null && fim ? `+${n((p["+24 h"]! / fim - 1) * 100)}% sobre o fim da live` : "não consta", c: "var(--aud)" },
        { k: "Em 7 dias", v: compacto(p["+7 d"]), n: p["+7 d"] != null && fim ? `${n((1 - fim / p["+7 d"]!) * 100)}% das views vieram depois` : "não consta", c: "var(--aud)" },
        { k: "Comentários", v: n(d.comentarios), n: d.hoje ? `contados em ${dataCurta(d.hoje.coletado_em, conta.tz)}` : "no vídeo gravado" },
      ];
      const barras = d.pontos.map(x => ({ rotulo: x.rotulo, v: x.views, hoje: false }));
      if (d.hoje) barras.push({ rotulo: `hoje · ${dataCurta(d.hoje.coletado_em, conta.tz).slice(0, 5)}`, v: d.hoje.views, hoje: true });
      const max = Math.max(1, ...barras.map(b => b.v ?? 0));
      return (
        <>
          <Kpis itens={kpis} />
          <Painel tom="aud" titulo="Visualizações do vídeo gravado" sub="total acumulado desde o fim da transmissão">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 180 }}>
              {barras.map(b => (
                <div key={b.rotulo} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  <span className="tnum" style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", color: b.v == null ? "var(--ink4)" : "var(--ink)" }}>{compacto(b.v)}</span>
                  <div style={b.v == null
                    ? { width: "100%", maxWidth: 56, height: 6, border: "1px dashed var(--audLine)", borderRadius: "5px 5px 0 0" }
                    : { width: "100%", maxWidth: 56, height: Math.max(3, (b.v / max) * 100) + "%", background: b.hoje ? "var(--audLine)" : "var(--aud)", border: b.hoje ? "1px solid var(--aud)" : undefined, opacity: b.hoje ? 1 : .85, borderRadius: "5px 5px 0 0", animation: "growY .7s cubic-bezier(.2,.8,.2,1) both", transformOrigin: "50% 100%" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 7, borderTop: "1px solid var(--audLine)", paddingTop: 7 }}>
              {barras.map(b => <span key={b.rotulo} className="mono" style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: "var(--ink3)" }}>{b.rotulo}</span>)}
            </div>
            {!d.acompanhado && (
              <NotaPainel tom="var(--audLine)">
                Esta coleta é anterior às leituras de depois da live: os pontos de +1 h a +7 d não foram lidos e não existem mais.
                {d.hoje && <> A única leitura posterior é a de hoje, <b>{n(d.hoje.views)}</b> views.</>}
                {d.fim_coleta && <> No fim da coleta, ainda com a live no ar, o vídeo tinha {n(d.fim_coleta.views)} views.</>}
              </NotaPainel>
            )}
          </Painel>
          {d.top_comentarios && (
            <Painel titulo="Comentários mais curtidos">
              {d.top_comentarios.length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Nenhum comentário lido no vídeo gravado.</div>}
              {d.top_comentarios.map((c, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "12px 0", borderTop: "1px solid var(--div)" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.autor}</span>
                  <span style={{ fontSize: 14, textWrap: "pretty", overflowWrap: "anywhere" }}>{c.texto}</span>
                  <div className="tnum" style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--ink3)" }}>
                    <span>{n(c.likes)} curtidas</span><span>{n(c.respostas)} respostas</span>
                  </div>
                </div>
              ))}
            </Painel>
          )}
        </>
      );
    }}</Bloco>
  );
}

// ================================================================ Chat

const NOME_IDIOMA = { pt: "Português", es: "Espanhol", en: "Inglês" } as const;

export function SecaoConversa({ live }: { live: LiveDetalhe }) {
  const req = useSecao<SecConversa>(live, "conversa");
  return (
    <Bloco titulo="Conversa" req={req}>{d => {
      if (!d.disponivel || !d.tom) return <SemDado titulo="Sem texto de chat" texto="Esta coleta não tem mensagens com texto para analisar." />;
      const pt = d.idiomas?.find(i => i.idioma === "pt");
      const outros = (d.idiomas?.length ?? 0) - (pt ? 1 : 0);
      const totalMarcas = d.marcas?.reduce((a, m) => a + m.n, 0) ?? 0;
      const kpis = [
        { k: "Tom positivo", v: pct(d.tom.positivo, 0), n: `${pct(d.tom.neutro, 0)} neutro · ${pct(d.tom.negativo, 0)} negativo`, c: "var(--part)" },
        { k: "Perguntas", v: n(d.perguntas?.n), n: `${pct(d.perguntas?.pct)} das mensagens` },
        { k: "Em português", v: pct(pt?.pct, 0), n: outros ? `mais ${outros} idioma${outros > 1 ? "s" : ""} detectado${outros > 1 ? "s" : ""}` : "nenhum outro idioma detectado" },
        { k: "Citações a marcas", v: n(totalMarcas), n: totalMarcas ? `${d.marcas!.length} marca${d.marcas!.length > 1 ? "s" : ""} diferente${d.marcas!.length > 1 ? "s" : ""}` : "nenhuma marca da lista citada" },
      ];
      const st = d.serie_tom ?? [];
      const comN = st.filter(x => x.n >= 10);
      const piorNeg = comN.length ? comN.reduce((a, b) => ((b.neg ?? 0) > (a.neg ?? 0) ? b : a)) : null;
      const melhorPos = comN.length ? comN.reduce((a, b) => ((b.pos ?? 0) > (a.pos ?? 0) ? b : a)) : null;
      const maxPal = d.palavras?.[0]?.n ?? 1;
      return (
        <>
          <Kpis itens={kpis} />
          <Painel tom="msg" titulo="Tom do chat ao longo da live" sub="parte das mensagens em cada tom, por janela de 5 minutos"
            direita={<div style={{ display: "flex", gap: 14, fontSize: 12.5, color: "var(--ink2)" }}>
              {[["var(--part)", "positivo"], ["var(--line2)", "neutro"], ["var(--red)", "negativo"]].map(([c, l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}</span>
              ))}
            </div>}>
            <div style={{ display: "flex", gap: 4, height: 150 }}>
              {st.map(b => (
                <div key={b.t} title={b.n ? `${hhmm(b.t)} · ${n(b.pos, 0)}% positivo, ${n(b.neg, 0)}% negativo · ${n(b.n)} mensagens` : `${hhmm(b.t)} · sem mensagens`}
                  style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, borderRadius: 4, overflow: "hidden", background: b.n ? undefined : "var(--track)", opacity: b.n && b.n < 10 ? 0.45 : 1 }}>
                  {b.n > 0 && <>
                    <div style={{ height: b.neg + "%", background: "var(--red)" }} />
                    <div style={{ height: b.neu + "%", background: "var(--line2)" }} />
                    <div style={{ height: b.pos + "%", background: "var(--part)" }} />
                  </>}
                </div>
              ))}
            </div>
            <Ticks itens={ticks5(st.map(x => x.t))} />
            <NotaPainel tom="var(--msgLine)">
              {piorNeg && melhorPos
                ? <>O tom mais negativo foi entre {hhmm(piorNeg.t)} e {hhmm(piorNeg.t + 300)}: {n(piorNeg.neg, 0)}% das mensagens negativas. O mais positivo, entre {hhmm(melhorPos.t)} e {hhmm(melhorPos.t + 300)}, com {n(melhorPos.pos, 0)}% positivas. </>
                : null}
              Tom, idioma e perguntas saem de léxico e regras ({d.metodo}), sem modelo: o texto do chat não sai do servidor. Janelas com menos de 10 mensagens aparecem apagadas.
            </NotaPainel>
          </Painel>
          {d.palavras && (
            <Grade>
              <Painel titulo="Palavras mais usadas" estilo={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {d.palavras.map(r => <BarraH key={r.p} rotulo={r.p} w={(r.n / maxPal) * 100 + "%"} valor={n(r.n)} cor="var(--msg)" />)}
              </Painel>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Painel titulo="Emojis mais usados">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
                    {(d.emojis ?? []).map(e => (
                      <div key={e.e} title={e.e} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                        {e.e.startsWith(":")
                          ? <span className="mono" style={{ fontSize: 10.5, lineHeight: 1.2, color: "var(--ink2)", textAlign: "center", overflowWrap: "anywhere" }}>{e.e.slice(1, -1)}</span>
                          : <span style={{ fontSize: 22, lineHeight: 1 }}>{e.e}</span>}
                        <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600 }}>{n(e.n)}</span>
                      </div>
                    ))}
                  </div>
                </Painel>
                <Painel titulo="Idioma das mensagens" estilo={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(d.idiomas ?? []).map(r => <BarraH key={r.idioma} rotulo={NOME_IDIOMA[r.idioma]} w={r.pct + "%"} valor={pct(r.pct)} cor="var(--aud)" colRotulo={90} colValor={52} />)}
                  <div style={{ fontSize: 12, color: "var(--ink3)" }}>{n(d.idioma_indeterminado)} mensagens curtas demais para identificar o idioma ficam fora da conta.</div>
                </Painel>
              </div>
            </Grade>
          )}
          <Grade>
            {d.perguntas_top && (
              <Painel titulo="Perguntas mais repetidas">
                {d.perguntas_top.length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Nenhuma pergunta apareceu mais de uma vez.</div>}
                {d.perguntas_top.map(q => (
                  <div key={q.q} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 13.5, padding: "10px 0", borderTop: "1px solid var(--div)" }}>
                    <span style={{ textWrap: "pretty" }}>{q.q}</span><b className="tnum" style={{ flex: "0 0 auto" }}>{n(q.n)}×</b>
                  </div>
                ))}
              </Painel>
            )}
            <Painel titulo="Marcas citadas">
              {(d.marcas ?? []).length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>Nenhuma marca da lista de monitoramento foi citada no chat.</div>}
              {(d.marcas ?? []).map(m => (
                <div key={m.marca} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 14, padding: "10px 0", borderTop: "1px solid var(--div)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.marca}</span>
                    <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>primeira citação às {hhmm(m.primeira_t)}</span>
                  </div>
                  <b className="tnum" style={{ fontSize: 13.5, flex: "0 0 auto" }}>{n(m.n)} {m.n === 1 ? "citação" : "citações"}</b>
                </div>
              ))}
            </Painel>
          </Grade>
        </>
      );
    }}</Bloco>
  );
}

export function SecaoModeracao({ live }: { live: LiveDetalhe }) {
  const req = useSecao<SecModeracao>(live, "moderacao");
  return (
    <Bloco titulo="Moderação" req={req}>{d => {
      const kpis = [
        { k: "Mensagens apagadas", v: n(d.apagadas), n: d.pct_apagadas != null ? `${pct(d.pct_apagadas)} do chat` : "—", c: "var(--red)" },
        { k: "Suspensões", v: n(d.suspensoes), n: d.suspensao_media_s ? `${minutos(d.suspensao_media_s)} em média` : "temporárias" },
        { k: "Banimentos", v: n(d.banimentos), n: "permanentes" },
        { k: "Moderadores ativos", v: n(d.moderadores), n: "que agiram nesta live", c: "var(--aud)" },
      ];
      return (
        <>
          <Kpis itens={kpis} />
          {d.eventos === 0 ? (
            <SemDado titulo="Nenhum evento de moderação chegou nesta coleta"
              texto="A API pública entrega mensagens apagadas, suspensões e banimentos como eventos do próprio chat. Zero aqui quer dizer que nenhum desses eventos chegou ao coletor — não prova que não houve moderação." />
          ) : (
            <>
              <Painel tom="red" titulo="Ações de moderação ao longo da live" sub="mensagens apagadas, suspensões e banimentos por janela de 5 minutos">
                <BarrasTempo valores={d.serie5.map(x => x.n)} cor="var(--redSoft)" corMax="var(--red)" borda="var(--redLine)" tip={i => `${hhmm(d.serie5[i].t)} · ${n(d.serie5[i].n)} ações`} />
                <Ticks itens={ticks5(d.serie5.map(x => x.t))} />
                {d.pico && <NotaPainel tom="var(--redLine)">{n(d.pico.n)} das {n(d.eventos)} ações aconteceram entre {hhmm(d.pico.t)} e {hhmm(d.pico.t_fim)}.</NotaPainel>}
              </Painel>
              {d.quem && (
                <Painel titulo="Quem moderou">
                  <Tabela colunas={["Moderador", "Apagou", "Suspendeu", "Baniu"]} larguras="minmax(0,1fr) 80px 80px 80px"
                    linhas={d.quem.map(q => [q.autor, n(q.apagou), n(q.suspendeu), n(q.baniu)])} />
                </Painel>
              )}
            </>
          )}
        </>
      );
    }}</Bloco>
  );
}

// ================================================================ Pessoas e apoio

const COMP = {
  membros: ["Membros", "var(--part)"], moderadores: ["Moderadores", "var(--aud)"], dono: ["Dono do canal", "var(--red)"],
  verificados: ["Verificados", "var(--msg)"], demais: ["Demais", "var(--line2)"],
} as const;

export function SecaoPessoas({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const req = useSecao<SecPessoas>(live, "pessoas");
  return (
    <Bloco titulo="Quem fala no chat" primeira req={req}>{d => {
      if (!d.disponivel) return <SemDado titulo="Sem chat coletado" texto="Ninguém escreveu durante a janela coletada." />;
      const kpis = [
        { k: "Pessoas no chat", v: n(d.pessoas), n: live.pico ? `${pct((d.pessoas / live.pico) * 100)} do pico de audiência` : "—", c: "var(--msg)" },
        { k: "Mensagens por pessoa", v: n(d.msgs_por_pessoa, 2), n: `a mediana é ${n(d.mediana_msgs)}` },
        { k: "Escreveram uma vez só", v: pct(d.uma_vez.pct, 0), n: `${n(d.uma_vez.n)} pessoas` },
        d.voltaram
          ? { k: "Voltaram na live seguinte", v: pct(d.voltaram.pct, 0), n: `${n(d.voltaram.n)} pessoas no chat de ${dataCurta(d.voltaram.inicio, conta.tz).slice(0, 5)}`, c: "var(--part)" }
          : { k: "Voltaram na live seguinte", v: "—", n: "nenhuma live seguinte do canal foi coletada", c: "var(--part)" },
      ];
      const maxF = Math.max(1, ...d.faixas.map(f => f.n));
      const maxTop = d.top?.[0]?.msgs ?? 1;
      return (
        <>
          <Kpis itens={kpis} />
          <Painel titulo="Quem compõe o chat" sub="mensagens por tipo de conta, conforme o YouTube marca cada autor">
            <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, marginBottom: 14 }}>
              {d.composicao.map(c => <div key={c.tipo} style={{ width: (c.msgs / d.mensagens) * 100 + "%", minWidth: 3, background: COMP[c.tipo][1] }} />)}
            </div>
            <Tabela colunas={["Tipo", "Pessoas", "Mensagens", "Do chat"]} larguras="minmax(0,1fr) 90px 90px 70px"
              linhas={d.composicao.map(c => [
                <span key="t" style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: COMP[c.tipo][1], flex: "0 0 auto" }} />{COMP[c.tipo][0]}</span>,
                n(c.pessoas), n(c.msgs), <b key="p">{pct((c.msgs / d.mensagens) * 100)}</b>,
              ])} />
          </Painel>
          <Grade>
            <Painel titulo="Quanto cada pessoa escreveu" sub="pessoas por faixa de mensagens enviadas">
              <BarrasHtml altura={150} itens={d.faixas.map(f => ({ rotulo: f.faixa, valor: n(f.n), h: Math.max(4, (f.n / maxF) * 118) + "px", fill: "var(--msgT)", stroke: "var(--msg)", ink: "var(--ink)" }))} />
              <NotaPainel>Os 10% mais ativos ({n(d.top10pct.pessoas)} pessoas) escreveram <b>{pct(d.top10pct.pct_msgs, 0)}</b> das mensagens.</NotaPainel>
            </Painel>
            {d.top && (
              <Painel titulo="Quem mais escreveu">
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {d.top.map((r, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) 44px", gap: 10, alignItems: "center" }}>
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink4)" }}>{i + 1}</span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, minWidth: 0 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.autor}</span>{r.selo && <Selo t={r.selo} />}
                        </div>
                        <div style={{ height: 8, background: "var(--track)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: (r.msgs / maxTop) * 100 + "%", height: "100%", background: "var(--msg)", borderRadius: 4 }} /></div>
                      </div>
                      <b className="tnum" style={{ textAlign: "right", fontSize: 13.5 }}>{n(r.msgs)}</b>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 12 }}>Nomes só nesta versão interna. O link público e o dossiê não levam identificador de autor.</div>
              </Painel>
            )}
          </Grade>
        </>
      );
    }}</Bloco>
  );
}

export function SecaoApoio({ live }: { live: LiveDetalhe }) {
  const req = useSecao<SecApoio>(live, "apoio");
  return (
    <Bloco titulo="Super Chats e membros" req={req}>{d => {
      const pagos = d.superchats + d.superstickers;
      const kpis = [
        { k: "Arrecadado", v: brl(d.total_brl), n: "Super Chat e Super Sticker, em reais", c: "var(--part)" },
        { k: "Super Chats", v: n(d.superchats), n: pagos ? `de ${n(d.pessoas_pagantes)} pessoas · mais ${n(d.superstickers)} Super Stickers` : "nenhum durante a transmissão" },
        { k: "Novos membros", v: n(d.novos_membros), n: "durante a live" },
        { k: "Assinaturas presenteadas", v: n(d.presentes.assinaturas), n: d.presentes.pessoas ? `por ${n(d.presentes.pessoas)} pessoa${d.presentes.pessoas > 1 ? "s" : ""}` : "nenhuma" },
      ];
      const max = Math.max(0, ...d.serie5.map(x => x.brl));
      const iMax = d.serie5.findIndex(x => x.brl === max);
      const maxF = Math.max(1, ...d.faixas.map(f => f.n));
      const maxM = Math.max(1, ...d.moedas.map(m => m.n));
      return (
        <>
          <Kpis itens={kpis} />
          <Painel tom="part" titulo="Apoio ao longo da transmissão" sub="valor em reais por janela de 5 minutos">
            <BarrasTempo valores={d.serie5.map(x => x.brl)} cor="var(--partMid)" corMax="var(--part)" altura={170} borda="var(--partLine)" tip={i => `${hhmm(d.serie5[i].t)}–${hhmm(d.serie5[i].t + 300)} · ${brl(d.serie5[i].brl)}`} />
            <Ticks itens={ticks5(d.serie5.map(x => x.t))} />
            <NotaPainel tom="var(--partLine)">
              {max > 0
                ? <>O maior bloco, {brl(max)}, ficou entre {hhmm(d.serie5[iMax].t)} e {hhmm(d.serie5[iMax].t + 300)}.</>
                : <>Nenhum Super Chat ou Super Sticker durante a transmissão. O canal pode não ter o recurso ativado — {live.canal.nome} não usou nesta live.</>}
              {d.sem_cambio > 0 && <> {n(d.sem_cambio)} apoio(s) em moeda sem câmbio do dia ficaram fora do total.</>}
            </NotaPainel>
          </Painel>
          {pagos > 0 && (
            <Grade>
              <Painel titulo="Super Chats por valor" estilo={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {d.faixas.map(r => <BarraH key={r.faixa} rotulo={<span style={{ color: "var(--ink2)" }}>{r.faixa}</span>} w={(r.n / maxF) * 100 + "%"} valor={n(r.n)} cor="var(--part)" colRotulo={120} colValor={32} />)}
              </Painel>
              <Painel titulo="Super Chats por moeda" sub="somados em reais pelo câmbio do dia" estilo={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {d.moedas.map(r => <BarraH key={r.moeda} rotulo={<b className="mono" style={{ fontSize: 12.5 }}>{r.moeda}</b>} w={(r.n / maxM) * 100 + "%"} valor={n(r.n)} cor="var(--part)" colRotulo={120} colValor={32} />)}
              </Painel>
            </Grade>
          )}
          <Grade>
            {d.apoiadores && pagos > 0 && (
              <Painel titulo="Maiores apoiadores">
                {d.apoiadores.map((r, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: 10, alignItems: "start", padding: "10px 0", borderTop: "1px solid var(--div)" }}>
                    <span className="mono" style={{ fontSize: 12, color: "var(--ink4)", paddingTop: 2 }}>{i + 1}</span>
                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.autor}</span>
                      {r.msg && <span style={{ fontSize: 13, color: "var(--ink2)", textWrap: "pretty" }}>“{r.msg}”</span>}
                    </div>
                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3 }}>
                      <b className="tnum" style={{ fontSize: 13.5, color: "var(--part)", whiteSpace: "nowrap" }}>{brl(r.brl)}</b>
                      <span style={{ fontSize: 12, color: "var(--ink3)", whiteSpace: "nowrap" }}>{n(r.qtd)} {r.qtd > 1 ? "apoios" : "apoio"}</span>
                    </div>
                  </div>
                ))}
              </Painel>
            )}
            <Painel titulo="Membros" estilo={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" }}>Novos membros por nível</div>
                {d.niveis.length === 0 ? <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Nenhum novo membro durante a transmissão.</div> : (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {d.niveis.map(v => (
                      <div key={v.nivel ?? "?"} style={{ flex: 1, minWidth: 120, background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 10, padding: "11px 13px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                        <span style={{ fontSize: 13.5 }}>{v.nivel ?? "nível não registrado"}</span><b className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 19 }}>{n(v.n)}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {d.presenteadores && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--div)", paddingTop: 13 }}>
                  <div style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)" }}>Quem presenteou assinaturas</div>
                  {d.presenteadores.length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Ninguém presenteou assinaturas.</div>}
                  {d.presenteadores.map(p => (
                    <div key={p.autor} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}><span>{p.autor}</span><b className="tnum">{n(p.n)} {p.n > 1 ? "assinaturas" : "assinatura"}</b></div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 13, color: "var(--ink2)", borderTop: "1px solid var(--div)", paddingTop: 13, textWrap: "pretty" }}>
                {d.marcos.n ? `${n(d.marcos.n)} membro${d.marcos.n > 1 ? "s" : ""} celebrou tempo de assinatura no chat${d.marcos.max_meses ? `. O mais antigo, ${n(d.marcos.max_meses)} meses.` : "."}` : "Nenhum membro celebrou tempo de assinatura no chat."}
              </div>
            </Painel>
          </Grade>
        </>
      );
    }}</Bloco>
  );
}

export function SecaoComunidade({ live }: { live: LiveDetalhe }) {
  const req = useSecao<SecComunidade>(live, "comunidade");
  return (
    <Bloco titulo="Comunidade" req={req}>{d => (
      d.enquetes.length === 0
        ? <SemDado titulo="Nenhuma enquete" texto="O canal não abriu enquete no chat durante a janela coletada." />
        : (
          <Grade>
            {d.enquetes.map((e, i) => (
              <Painel key={i} estilo={{ display: "flex", flexDirection: "column", gap: 13 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 15.5, fontWeight: 700, letterSpacing: "-.01em" }}>Enquete do canal</div>
                  <span className="mono tnum" style={{ fontSize: 12, color: "var(--ink3)" }}>{e.t != null ? `às ${hhmm(e.t)}` : ""}{e.total != null ? ` · ${n(e.total)} votos` : ""}</span>
                </div>
                {e.detalhe ? (
                  <>
                    <div style={{ fontSize: 15.5, fontWeight: 600, textWrap: "pretty" }}>{e.pergunta ?? "—"}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {e.opcoes.map(o => (
                        <div key={o.texto} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 12px", display: "flex", alignItems: "center", gap: 11 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>{o.texto}</span>
                          <span className="mono tnum" style={{ fontSize: 12, color: "var(--ink3)", flex: "0 0 auto" }}>{o.votos != null && e.total ? `${n(o.votos)} · ${pct((o.votos / e.total) * 100, 0)}` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>
                    A enquete aconteceu, mas esta coleta não guardou a pergunta nem os votos: o coletor ainda não lia os detalhes de enquete. Coletas novas guardam os dois.
                  </div>
                )}
              </Painel>
            ))}
          </Grade>
        )
    )}</Bloco>
  );
}

// ================================================================ Vídeo e contexto

export function SecaoVideo({ live, s }: { live: LiveDetalhe; s: Serie | null }) {
  const { conta } = useSessao();
  const req = useSecao<SecVideo>(live, "video");
  return (
    <Bloco titulo="Vídeo e canal" primeira req={req}>{d => {
      const h = d.horarios;
      const atraso = h.atraso_s == null ? "Sem horário agendado para comparar." : Math.abs(h.atraso_s) < 60 ? "Começou no horário marcado." : h.atraso_s > 0 ? `${minutos(h.atraso_s)} de atraso.` : `Começou ${minutos(h.atraso_s)} antes do horário marcado.`;
      const antes = h.antecedencia_s != null ? ` Agendada ${h.antecedencia_s >= 86400 ? `${n(Math.round(h.antecedencia_s / 86400))} dia(s)` : minutos(h.antecedencia_s)} antes.` : "";
      const likes = d.likes;
      const ultimo = likes ? [...likes].reverse().find(v => v != null) ?? null : null;
      let metade: number | null = null;
      if (likes && ultimo && d.t) {
        const primeiro = likes.find(v => v != null) ?? 0;
        const alvo = primeiro + (ultimo - primeiro) / 2;
        const i = likes.findIndex(v => v != null && v >= alvo);
        metade = i >= 0 ? d.t[i] : null;
      }
      return (
        <>
          <Painel titulo="Horários">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 12 }}>
              {[["Agendada", hora(h.agendada, conta.tz)], ["Começou", hora(h.inicio, conta.tz)], ["Terminou", hora(h.fim, conta.tz)], ["Duração", duracao(h.duracao_s)]].map(([k, v]) => (
                <div key={k} style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 5 }}>{k}</div>
                  <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 22, fontWeight: 700 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--ink2)" }}>{atraso}{antes}</div>
          </Painel>
          <Painel tom="aud" titulo="Curtidas acumuladas durante a live" sub="contador público do vídeo, lido junto com os espectadores">
            {likes && s ? (
              <>
                <SerieChart vals={likes} times={s.t} H={200} tipo="linha" cor="var(--aud)" fs={13} every={passoTicks(s.t.length)} />
                <NotaPainel tom="var(--audLine)">
                  {n(ultimo)} curtidas ao fim da coleta{metade != null ? `. Metade chegou depois de ${hhmm(metade)}` : ""}.
                  {d.likes_hoje != null && <> Hoje o vídeo tem {n(d.likes_hoje)}.</>}
                </NotaPainel>
              </>
            ) : <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Não consta: esta coleta não leu o contador de curtidas.</div>}
          </Painel>
          <Painel titulo="Mudanças de título e thumbnail" sub={d.mudancas_monitoradas ? "título e thumbnail conferidos a cada minuto" : "esta coleta não conferia título e thumbnail durante a live"}>
            {d.mudancas.length === 0 && <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>{d.mudancas_monitoradas ? "Nenhuma mudança durante a live." : "Não consta."}</div>}
            {d.mudancas.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "96px 90px minmax(0,1fr)", gap: 14, alignItems: "baseline", padding: "11px 0", borderTop: "1px solid var(--div)", fontSize: 13.5 }}>
                <span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>{m.depois_da_live ? "depois da live" : m.quando ? hora(m.quando, conta.tz) : "—"}</span>
                <span style={{ fontWeight: 600 }}>{m.tipo}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ color: "var(--ink3)", textDecoration: "line-through", textWrap: "pretty" }}>{m.de}</span>
                  <span style={{ textWrap: "pretty" }}>{m.para}</span>
                </div>
              </div>
            ))}
          </Painel>
          <Grade>
            <Painel titulo="Inscritos do canal" estilo={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {[["Antes", d.inscritos.antes], ["Depois", d.inscritos.depois], ["Hoje", d.inscritos.hoje]].map(([k, v]) => (
                  <div key={k as string} style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 5 }}>{k}</div>
                    <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 22, fontWeight: 700, color: v == null ? "var(--ink4)" : undefined }}>{compacto(v as number | null)}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", textWrap: "pretty" }}>
                O YouTube arredonda o número de inscritos: num canal deste tamanho, só aparecem mudanças grandes.
                {d.inscritos.antes == null && " Antes e depois só existem para coletas que leram o canal no início e no fim."}
              </div>
            </Painel>
            <Painel titulo="Ficha do vídeo" estilo={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {!d.ficha && <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Não consta.</div>}
              {d.ficha?.map(f => (
                <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13.5 }}>
                  <span style={{ color: "var(--ink2)" }}>{f.k}</span><b style={{ textAlign: "right", color: f.v == null ? "var(--ink4)" : undefined }}>{f.v ?? "—"}</b>
                </div>
              ))}
            </Painel>
          </Grade>
        </>
      );
    }}</Bloco>
  );
}

export function SecaoComparacao({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const req = useSecao<SecComparacao>(live, "comparacao");
  return (
    <Bloco titulo="Comparação" req={req}>{d => {
      const esta = d.lives.find(l => l.esta)!;
      const ant = d.lives.filter(l => !l.esta);
      const media = (f: (l: typeof esta) => number | null) => {
        const v = ant.map(f).filter((x): x is number => x != null);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      };
      const mViews = media(l => l.views);
      const lpk = (l: typeof esta) => (l.likes != null && l.views ? (l.likes / l.views) * 1000 : null);
      const mLpk = media(lpk);
      const mAtraso = media(l => l.atraso_s);
      const ordem = [...d.lives].filter(l => l.views != null).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      const pos = ordem.findIndex(l => l.esta) + 1;
      const kpis = [
        { k: "Visualizações", v: compacto(esta.views), n: mViews ? `${esta.views! >= mViews ? "+" : ""}${n((esta.views! / mViews - 1) * 100)}% sobre a média das ${ant.length} anteriores` : "sem lives anteriores para comparar", c: "var(--aud)" },
        { k: "Posição", v: pos ? `${pos}ª` : "—", n: `em visualizações entre as ${d.lives.length} lives da tabela` },
        { k: "Curtidas por mil views", v: n(lpk(esta), 1), n: mLpk != null ? `média ${n(mLpk, 1)}` : "—" },
        { k: "Atraso no início", v: esta.atraso_s != null ? minutos(esta.atraso_s) : "—", n: mAtraso != null ? `média ${minutos(mAtraso)}` : "—" },
      ];
      const vMax = Math.max(1, ...d.lives.map(l => l.views ?? 0));
      return (
        <>
          <Kpis itens={kpis} />
          {ant.length === 0 && <SemDado titulo="Nenhuma live anterior lida" texto="A playlist do canal não chegou a lives anteriores a esta. Canais que publicam muito precisam de muitas páginas da API para voltar no tempo." />}
          {ant.length > 0 && (
            <>
              <Painel tom="aud" titulo="Visualizações das lives anteriores" sub="últimas lives do canal, da mais antiga à mais recente">
                <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 190 }}>
                  {d.lives.map(l => (
                    <div key={l.id} title={l.titulo} style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 7 }}>
                      <span className="tnum" style={{ fontSize: 12.5, fontWeight: l.esta ? 700 : 500, color: l.esta ? "var(--ink)" : "var(--ink3)", whiteSpace: "nowrap" }}>{compacto(l.views)}</span>
                      <div style={{ width: "100%", maxWidth: 64, height: Math.max(2, ((l.views ?? 0) / vMax) * 100) + "%", background: l.esta ? "var(--aud)" : "var(--audLine)", borderRadius: "5px 5px 0 0", animation: "growY .7s cubic-bezier(.2,.8,.2,1) both", transformOrigin: "50% 100%" }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 7, borderTop: "1px solid var(--audLine)", paddingTop: 7 }}>
                  {d.lives.map(l => <span key={l.id} className="mono" style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 11, color: l.esta ? "var(--ink)" : "var(--ink3)", fontWeight: l.esta ? 700 : 500 }}>{dataCurta(l.inicio, conta.tz).slice(0, 5)}</span>)}
                </div>
              </Painel>
              <Painel titulo="Lado a lado">
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: 760 }}>
                    <Tabela colunas={["Data", "Live", "Views", "Curtidas", "Comentários", "Duração", "Atraso", "Chat"]} larguras="54px minmax(0,1fr) 84px 80px 90px 64px 60px 90px" esquerda={2}
                      linhas={[...d.lives].reverse().map(l => [
                        <span key="d" className="mono" style={{ fontSize: 12.5, color: "var(--ink3)" }}>{dataCurta(l.inicio, conta.tz).slice(0, 5)}</span>,
                        <span key="n" style={{ fontWeight: l.esta ? 700 : 500, whiteSpace: "nowrap" }}>{nomeLive(l.titulo, 2)}</span>,
                        compacto(l.views), compacto(l.likes), n(l.comentarios), duracao(l.duracao_s), l.atraso_s != null ? minutos(l.atraso_s) : "—",
                        <span key="c" style={{ fontSize: 12.5, color: l.coleta === "coletada" ? "var(--okInk)" : l.coleta === "perdida" ? "var(--redInk)" : "var(--ink4)" }}>{l.coleta}</span>,
                      ])} />
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 12, textWrap: "pretty" }}>
                  Views, curtidas e comentários vêm do vídeo público e foram contados {d.contadores_em ? `em ${dataCurta(d.contadores_em, conta.tz)}` : "na última leitura"} — não na mesma idade de cada vídeo. Pico de audiência e chat só existem para as lives que o Vigia acompanhou.
                </div>
              </Painel>
            </>
          )}
          {d.concorrencia ? (
            <Painel titulo="Concorrência no mesmo horário" sub={`lives na mesma categoria e idioma no ar perto do pico · ${dataHora(d.concorrencia.quando, conta.tz)}`}
              direita={<span style={{ fontFamily: "Figtree, sans-serif", fontSize: 24, fontWeight: 700, color: "var(--aud)" }}>{pct(((d.concorrencia.lista.find(r => r.esta)?.espectadores ?? 0) / d.concorrencia.total) * 100, 0)}</span>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {d.concorrencia.lista.map(r => (
                  <div key={r.titulo} style={{ display: "grid", gridTemplateColumns: "minmax(0,220px) minmax(0,1fr) 64px", gap: 14, alignItems: "center", fontSize: 13.5 }}>
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={{ fontWeight: r.esta ? 700 : 500 }}>{r.canal}</span>
                      <span style={{ fontSize: 12.5, color: "var(--ink3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.titulo}</span>
                    </div>
                    <div style={{ height: 8, background: "var(--track)", borderRadius: 4, overflow: "hidden" }}><div style={{ width: (r.espectadores / d.concorrencia!.lista[0].espectadores) * 100 + "%", height: "100%", background: r.esta ? "var(--aud)" : "var(--audLine)", borderRadius: 4 }} /></div>
                    <b className="tnum" style={{ textAlign: "right" }}>{compacto(r.espectadores)}</b>
                  </div>
                ))}
              </div>
            </Painel>
          ) : (
            <SemDado titulo="Concorrência no mesmo horário: não consta"
              texto="A busca por outras lives no ar só existe durante a coleta. Esta transmissão foi coletada antes dela, e o que estava no ar naquele horário não pode mais ser consultado." />
          )}
        </>
      );
    }}</Bloco>
  );
}
