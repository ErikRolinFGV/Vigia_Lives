// Exportar (arquivo para o pesquisador) e Publicar (link para terceiros).
import { useEffect, useState } from "react";
import { api, useApi } from "../../api/client";
import type { Dossie, EstadoPublicacao, LiveDetalhe, Publicacao } from "../../api/types";
import { Modal } from "../../components/Modal";
import { apelido, dataCurta, n, pct } from "../../lib/format";
import { useSessao } from "../../state/sessao";

const caixa = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px" } as const;
const rot = { fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase" as const, color: "var(--ink3)" };

function Topo({ titulo, sub, fechar }: { titulo: string; sub: string; fechar: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>{titulo}</div>
        <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>{sub}</div>
      </div>
      <button type="button" onClick={fechar} aria-label="Fechar" style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 8, border: "1px solid var(--modalLine)", background: "none", cursor: "pointer", fontSize: 16, color: "var(--ink2)" }}>×</button>
    </div>
  );
}

const modalEstilo = { background: "var(--modal)", border: "1px solid var(--modalLine)", boxShadow: "0 16px 48px rgba(23,20,15,0.2)" };

// ================================================================ exportar

type Fmt = "csv" | "json" | "md";

export function ExportarModal({ live, fechar }: { live: LiveDetalhe; fechar: () => void }) {
  const { conta } = useSessao();
  const [fmt, setFmt] = useState<Fmt>(live.tem_serie ? "csv" : "json");
  const [previa, setPrevia] = useState<{ texto: string; nota: string; nome: string } | null>(null);
  const url = `/api/lives/${live.id}/export.${fmt}`;

  useEffect(() => {
    let vivo = true;
    setPrevia(null);
    fetch(url).then(async r => {
      const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || `export.${fmt}`;
      const txt = await r.text();
      const linhas = txt.split("\n");
      const corte = fmt === "csv" ? linhas.slice(0, 6) : fmt === "json" ? linhas.slice(0, 14) : linhas.slice(0, 12);
      const nota = fmt === "csv" ? `primeiras ${corte.length - 1} de ${linhas.filter(Boolean).length - 1} linhas` : "início";
      if (vivo) setPrevia({ texto: corte.join("\n") + (linhas.length > corte.length ? "\n…" : ""), nota, nome });
    }).catch(() => vivo && setPrevia({ texto: "não consegui gerar a prévia", nota: "", nome: "" }));
    return () => { vivo = false; };
  }, [url, fmt]);

  const formatos: { id: Fmt; ext: string; nome: string; desc: string; bloq?: string }[] = [
    { id: "csv", ext: ".csv", nome: "Série minuto a minuto", desc: "Uma linha por janela de 60 s: tempo, espectadores, mensagens por minuto, participação e cota gasta. Para planilha ou BI. Janela sem resposta da API sai vazia, nunca interpolada.",
      bloq: live.tem_serie ? undefined : "Esta transmissão não tem série minuto a minuto no banco, então não há o que exportar neste formato." },
    { id: "json", ext: ".json", nome: "Relatório completo", desc: `Leva todos os campos agregados${live.momentos.length ? `, os ${live.momentos.length} momentos detectados` : ""}, as seções da aba Dados, o dossiê (se gerado) e o custo da coleta por método da API. Para alimentar outro sistema.` },
    { id: "md", ext: ".md", nome: "Relatório redigido", desc: "O dossiê em texto, com a conclusão e os achados. Para colar em documento ou apresentação." },
  ];

  return (
    <Modal fechar={fechar} largura={760} estilo={modalEstilo}>
      <Topo titulo="Exportar dados da coleta" sub={`${live.canal.nome} · ${apelido(live.titulo)} · ${dataCurta(live.inicio, conta.tz)}`} fechar={fechar} />
      <div style={{ background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 11, padding: "14px 16px", margin: "16px 0", fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>
        O arquivo é para você, então leva tudo — inclusive cota consumida e custo por método. Diferente do link público, que é para terceiros e não expõe operação. Em nenhum formato vai texto de chat ou identificador de autor.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
        {formatos.map(f => {
          const sel = f.id === fmt && !f.bloq;
          return (
            <button key={f.id} type="button" disabled={!!f.bloq} onClick={() => setFmt(f.id)}
              style={{ background: f.bloq ? "var(--s3)" : sel ? "var(--surface)" : "var(--s2)", border: `1px solid ${sel ? "var(--red)" : "var(--line)"}`, borderRadius: 12, padding: "15px 17px", cursor: f.bloq ? "default" : "pointer", display: "flex", alignItems: "flex-start", gap: 13, textAlign: "left", color: "inherit", transition: "border-color .18s ease, background .18s ease" }}>
              <span style={{ width: 18, height: 18, flex: "0 0 18px", borderRadius: "50%", border: `2px solid ${f.bloq ? "var(--lineDash)" : sel ? "var(--red)" : "var(--ink4)"}`, background: sel ? "var(--red)" : "transparent", marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", marginBottom: 3 }}>
                  <span className="mono" style={{ fontSize: 13.5, fontWeight: 500, color: f.bloq ? "var(--ink4)" : "var(--ink)" }}>{f.ext}</span>
                  <span style={{ fontFamily: "Figtree, sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: "-.01em", color: f.bloq ? "var(--ink4)" : "var(--ink)" }}>{f.nome}</span>
                </div>
                <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>{f.desc}</div>
                {f.bloq && <div style={{ fontSize: 12.5, color: "var(--redInk)", marginTop: 6 }}>{f.bloq}</div>}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ ...caixa, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 11 }}>
          <div style={rot}>Prévia do {fmt}</div>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink3)" }}>{previa?.nota}</span>
        </div>
        <div className="mono" style={{ background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 9, padding: "13px 15px", fontSize: 12.5, lineHeight: 1.75, whiteSpace: "pre", overflowX: "auto", minHeight: 60 }}>
          {previa ? previa.texto : "gerando a prévia…"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
        <span className="mono" style={{ flex: 1, minWidth: 200, fontSize: 12, color: "var(--ink3)", overflowWrap: "anywhere" }}>{previa?.nome}</span>
        <button type="button" className="botao-claro" onClick={fechar}>Fechar</button>
        <a href={url} download={previa?.nome} className="botao-escuro" style={{ fontSize: 14, padding: "10px 18px", borderRadius: 9, textDecoration: "none" }}>Baixar</a>
      </div>
    </Modal>
  );
}

// ================================================================ publicar

export function PublicarModal({ live, dossie, fechar }: { live: LiveDetalhe; dossie: Dossie; fechar: () => void }) {
  const { conta, nomeConta } = useSessao();
  const est = useApi<EstadoPublicacao>(`/lives/${live.id}/publicacao`);
  const [feito, setFeito] = useState<Publicacao | null>(null);
  const [msg, setMsg] = useState("");
  const pub = feito ?? est.dados?.publicada ?? null;
  const caminho = pub?.caminho ?? est.dados?.proposta.caminho ?? "";
  const url = location.origin + caminho;

  const copiar = async (t: string, ok: string) => {
    try { await navigator.clipboard.writeText(t); setMsg(ok); } catch { setMsg("Não consegui copiar; selecione o texto e copie à mão."); }
  };
  const publicar = async () => {
    try {
      const p = await api<Publicacao>(`/lives/${live.id}/publicacao`, { method: "POST", body: JSON.stringify({ autor_nome: nomeConta, instituicao: conta.inst || null, orcid: conta.orcid || null }) });
      setFeito(p);
      await copiar(location.origin + p.caminho, "Publicado. Link copiado.");
    } catch (e) { setMsg((e as Error).message); }
  };
  const revogar = async () => {
    await api(`/lives/${live.id}/publicacao`, { method: "DELETE" });
    setFeito(null);
    est.recarregar();
    setMsg("Publicação revogada: o endereço passa a responder que o relatório não está mais público.");
  };

  const inclui = [
    live.pico != null && `Pico de ${n(live.pico)} e a curva de audiência minuto a minuto`,
    `${n(live.pessoas)} pessoas distintas no chat e ${n(live.mensagens_live)} mensagens`,
    live.momentos.length ? `Os ${live.momentos.length} momentos de reação, com link para o instante no vídeo` : "A constatação de que nenhum momento de reação passou do limiar",
    `A cobertura declarada: ${pct(live.cobertura)} da janela coletada${live.acompanhada != null ? `, ${pct(live.acompanhada)} da transmissão` : ""}`,
    "A conclusão de como a live performou, com os insights e a recomendação",
    "Seu nome, instituição e ORCID no rodapé, se estiverem no perfil",
  ].filter(Boolean) as string[];
  const exclui = ["Cota consumida e custo por método da API", "Consulta de espectadores janela por janela", "Saúde do coletor e histórico de lives perdidas",
    "Comparação com outras transmissões do canal", "Texto do chat e qualquer identificador de autor"];
  const texto = `${live.canal.nome} — ${apelido(live.titulo)}, ${dataCurta(live.inicio, conta.tz)}\n\n${dossie.veredito} ${dossie.veredito_sub}\n\nCobertura: ${pct(live.cobertura)} da janela coletada${live.acompanhada != null ? ` (${pct(live.acompanhada)} da transmissão acompanhada ao vivo)` : ""}.\nRelatório completo: ${url}`;
  const passos = [
    "Uma linha na tabela de publicações guarda a transmissão, o endereço e a data de emissão. O relatório não é duplicado: o link lê o mesmo banco da coleta.",
    "A leitura pública passa por uma projeção que só devolve agregados. Cota, custo e autores não existem nessa resposta — não é filtro de interface, é o que a consulta devolve.",
    "A página é servida sem login e sem cookie de sessão. Quem tem o endereço vê; quem não tem, não descobre por listagem.",
    "Revogar marca a publicação e o endereço passa a responder que o relatório não está mais público. Os dados da coleta continuam no banco.",
  ];

  return (
    <Modal fechar={fechar} largura={720} estilo={modalEstilo}>
      <Topo titulo="Publicar relatório" sub={`${live.canal.nome} · ${apelido(live.titulo)} · ${dataCurta(live.inicio, conta.tz)}`} fechar={fechar} />
      <div style={{ ...caixa, margin: "20px 0 16px" }}>
        <div style={{ ...rot, marginBottom: 9 }}>{pub ? "Endereço publicado" : "Endereço gerado"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="mono" style={{ fontSize: 14, background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", flex: 1, minWidth: 240, overflowWrap: "anywhere" }}>{url}</span>
          {pub && <button type="button" className="botao-escuro" style={{ fontSize: 13.5, padding: "10px 15px", borderRadius: 8 }} onClick={() => copiar(url, "Link copiado.")}>Copiar</button>}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 9, textWrap: "pretty" }}>
          O endereço usa o nome da transmissão, não um código: <span className="mono">{est.dados?.proposta.slug}</span>, com o dia para diferenciar duas lives do mesmo canal.
          {pub ? ` Publicado em ${dataCurta(pub.emitido_em, conta.tz)}.` : " Ainda não está no ar: só passa a responder depois de publicar."}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ ...caixa, borderColor: "var(--okLine)" }}>
          <div style={{ ...rot, color: "var(--okInk)", marginBottom: 11 }}>Vai no link público</div>
          {inclui.map(i => <div key={i} style={{ display: "flex", gap: 9, fontSize: 13.5, marginBottom: 7 }}><span style={{ color: "var(--ok)" }}>✓</span><span style={{ color: "var(--ink2)" }}>{i}</span></div>)}
        </div>
        <div style={caixa}>
          <div style={{ ...rot, marginBottom: 11 }}>Fica só na versão interna</div>
          {exclui.map(i => <div key={i} style={{ display: "flex", gap: 9, fontSize: 13.5, marginBottom: 7 }}><span style={{ color: "var(--ink4)" }}>—</span><span style={{ color: "var(--ink3)" }}>{i}</span></div>)}
        </div>
      </div>
      <div style={{ ...caixa, borderColor: "var(--dosLine)", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 11 }}>
          <div style={rot}>Texto pronto para enviar</div>
          <button type="button" onClick={() => copiar(texto, "Texto copiado.")} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, background: "none", border: 0, cursor: "pointer", color: "var(--ink)" }}>Copiar texto</button>
        </div>
        <div style={{ background: "var(--dosT)", border: "1px solid var(--dosLine)", borderRadius: 9, padding: "15px 16px", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}>{texto}</div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 10 }}>Os números vêm do banco da coleta, não são redigitados.</div>
      </div>
      <div style={{ ...caixa, marginBottom: 18 }}>
        <div style={{ ...rot, marginBottom: 11 }}>O que acontece no backend</div>
        {passos.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 9 }}>
            <span style={{ width: 22, height: 22, flex: "0 0 22px", borderRadius: 7, background: "var(--s3)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, color: "var(--ink2)" }}>{i + 1}</span>
            <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>{p}</div>
          </div>
        ))}
      </div>
      {msg && <div style={{ fontSize: 13, color: "var(--okInk)", marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {pub && <button type="button" className="botao-claro" style={{ color: "var(--redInk)", borderColor: "var(--redLine)" }} onClick={revogar}>Revogar publicação</button>}
        {pub && <a className="botao-claro" href={caminho} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>Abrir link ↗</a>}
        <button type="button" className="botao-claro" onClick={fechar}>Fechar</button>
        {!pub && <button type="button" className="botao-escuro" style={{ fontSize: 14, padding: "10px 18px", borderRadius: 9 }} onClick={publicar} disabled={!est.dados}>Publicar e copiar link</button>}
      </div>
    </Modal>
  );
}
