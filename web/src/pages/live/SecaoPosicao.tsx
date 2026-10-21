// Sub-aba "Comparar": onde esta live fica entre as outras coletas, métrica a
// métrica, no mesmo canal, na mesma categoria ou em todas.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../../api/client";
import type { FichaLive, MetricaDef, Posicao, Recorte } from "../../api/types";
import { NotaPainel, Painel, SemDado } from "../../components/blocos";
import { foraDoRanking, valorMetrica } from "../../lib/ficha";
import { n } from "../../lib/format";

const COLUNAS = "minmax(150px,1.4fr) minmax(90px,.8fr) minmax(110px,.9fr) minmax(110px,.9fr) minmax(130px,1.1fr)";

const NOMES_RECORTE: Record<Recorte, string> = { canal: "Mesmo canal", categoria: "Mesma categoria", todas: "Todas as coletas" };

/** Uma barra por live do recorte, da maior para a menor; esta em destaque. */
function Barras({ id, p, formato }: { id: string; p: Posicao; formato: MetricaDef["formato"] }) {
  const max = Math.max(...p.valores.map(x => Math.abs(x.v)), 0) || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 26 }} aria-hidden>
      {p.valores.map(x => {
        const esta = x.id === id;
        return (
          <div key={x.id} title={`${x.nome ?? x.id}: ${valorMetrica(x.v, formato)}`}
            style={{ width: 12, flex: "0 0 12px", height: `${Math.max(8, (100 * Math.abs(x.v)) / max)}%`, borderRadius: "3px 3px 0 0",
              background: esta ? "var(--msg)" : "var(--track)", outline: esta ? "1px solid var(--msgLine)" : "none" }} />
        );
      })}
    </div>
  );
}

/** "+84% acima da mediana", em palavras: mais facil de ler que uma marca numa reta. */
function VsMediana({ v, p }: { v: number; p: Posicao }) {
  if (!p.mediana) return <span style={{ fontSize: 12.5, color: "var(--ink4)" }}>mediana zero</span>;
  const rel = (v - p.mediana) / Math.abs(p.mediana);
  if (Math.abs(rel) < 0.05) return <span style={{ fontSize: 13, color: "var(--ink3)" }}>na mediana</span>;
  const acima = rel > 0;
  return (
    <span className="tnum" style={{ fontSize: 13, color: "var(--ink2)" }}>
      <b style={{ color: acima ? "var(--okInk)" : "var(--ink)" }}>{acima ? "▲" : "▼"} {n(Math.abs(100 * rel))}%</b> {acima ? "acima" : "abaixo"}
    </span>
  );
}

export function SecaoPosicao({ id }: { id: string }) {
  const req = useApi<FichaLive>(`/lives/${id}/ficha`);
  const [recorte, setRecorte] = useState<Recorte>("canal");
  if (req.erro) return <SemDado titulo="Sem ficha" texto={req.erro.message} />;
  if (!req.dados) return <div style={{ color: "var(--ink3)", fontSize: 14, padding: "24px 0" }}>calculando a ficha…</div>;
  const { ficha: f, posicoes, metricas, grupos } = req.dados;
  const pos = posicoes[recorte];
  const porGrupo = Object.keys(grupos).map(g => ({ g, ms: metricas.filter(m => m.grupo === g) })).filter(x => x.ms.length);

  const linha = (m: MetricaDef) => {
    const v = f.valores[m.chave];
    const fora = foraDoRanking(f, m);
    const p = pos.metricas[m.chave];
    return (
      <div key={m.chave} style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 14, alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--div)" }}>
        <span style={{ fontSize: 13.5, color: "var(--ink2)" }} title={m.descricao}>{m.rotulo}</span>
        <b className="tnum" style={{ fontSize: 14.5 }}>{valorMetrica(v, m.formato)}</b>
        {fora || !p || p.posicao == null
          ? <span style={{ fontSize: 12, color: "var(--ink4)" }}>{fora ?? "sem outras para comparar"}</span>
          : p.n > 1 && p.min === p.max
            ? <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>igual nas {p.n}</span>
            : <span className="tnum" style={{ fontSize: 13.5 }}><b>{p.posicao}ª</b> <span style={{ color: "var(--ink3)" }}>de {p.n}{p.empatadas > 1 ? `, empatada com ${p.empatadas - 1}` : ""}</span></span>}
        {!fora && p && p.n > 1 && p.min !== p.max && v != null ? <VsMediana v={v} p={p} /> : <span />}
        {!fora && p && p.n > 1 && p.min !== p.max && v != null ? <Barras id={id} p={p} formato={m.formato} /> : <span />}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Painel titulo="Esta live entre as coletas" sub={`${f.versao} · posição 1 = maior valor · passe o mouse no nome da métrica para ver como ela é calculada`}
        direita={
          <div role="radiogroup" aria-label="Comparar com" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.keys(NOMES_RECORTE) as Recorte[]).map(r => {
              const sel = r === recorte;
              const rotulo = r === "categoria" && f.categoria ? f.categoria : NOMES_RECORTE[r];
              return (
                <button key={r} type="button" role="radio" aria-checked={sel} onClick={() => setRecorte(r)}
                  style={{ fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: "5px 11px", cursor: "pointer",
                    border: `1px solid ${sel ? "var(--lineH)" : "var(--line2)"}`, background: sel ? "var(--surface)" : "transparent",
                    color: sel ? "var(--ink)" : "var(--ink3)" }}>
                  {rotulo} <span className="tnum" style={{ color: "var(--ink4)", marginLeft: 3 }}>{posicoes[r].n}</span>
                </button>
              );
            })}
          </div>
        }>
        {(f.curta || f.parcial || f.trecho) && (
          <div style={{ fontSize: 13, color: "var(--ink2)", background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 13px", marginBottom: 6, textWrap: "pretty" }}>
            {f.curta
              ? "A coleta desta live durou menos de 15 minutos: os números aparecem, mas nenhum entra no ranking."
              : <>
                  {f.parcial && "A coleta acompanhou parte da transmissão: totais (pico, mensagens, apoio) ficam fora do ranking; taxas por minuto e por espectador entram. "}
                  {f.trecho && "Este é um trecho de um vídeo maior: views e comentários são do vídeo inteiro e ficam fora do ranking."}
                </>}
          </div>
        )}
        {pos.n < 2 && <div style={{ fontSize: 13, color: "var(--ink3)", margin: "4px 0 8px" }}>Nenhuma outra coleta neste recorte ainda.</div>}
        <div style={{ display: "grid", gridTemplateColumns: COLUNAS, gap: 14, fontSize: 11.5, color: "var(--ink4)", marginTop: 10 }}>
          <span /><span>valor</span><span>posição</span><span>vs. mediana</span><span>todas, da maior à menor</span>
        </div>
        {porGrupo.map(({ g, ms }) => (
          <div key={g} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 2 }}>{grupos[g]}</div>
            {ms.map(linha)}
          </div>
        ))}
        <NotaPainel>
          Com poucas lives coletadas, vale a posição e a distância da mediana, não uma média. Passe o mouse numa barra para ver de que live ela é; a desta live está em destaque. A ficha é recalculada quando chegam as leituras de depois da live.
        </NotaPainel>
      </Painel>
      <div>
        <Link to={`/yt/comparar?ids=${encodeURIComponent(id)}`} className="botao-escuro" style={{ textDecoration: "none", display: "inline-block" }}>Comparar lado a lado com outras lives →</Link>
      </div>
    </div>
  );
}
