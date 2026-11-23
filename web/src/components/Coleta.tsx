// Escolha do que coletar: botão por live, modo do canal e cota prevista.
// A escolha existe por causa da cota: um canal como a CazéTV transmite mais
// lives num dia do que as 10.000 unidades diárias conseguem coletar.
import { useState } from "react";
import type { MouseEvent } from "react";
import { api } from "../api/client";
import type { CotaDia, LiveResumo, ModoColeta } from "../api/types";
import { dataCurta, hora, n } from "../lib/format";

/** Coletar / não coletar uma live agendada; "Coletar agora" numa live no ar sem coletor. */
export function BotaoColetar({ l, mudou }: { l: { id: string; estado: LiveResumo["estado"] | null; ao_vivo: boolean; coletar: boolean }; mudou: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const agora = l.estado === "nao_escolhida" && l.ao_vivo;
  if (l.estado !== "agendada" && !agora) return null;

  const trocar = async (e: MouseEvent) => {
    e.stopPropagation();
    setEnviando(true);
    setErro("");
    try {
      await api(`/lives/${l.id}/coletar`, { method: "PUT", body: JSON.stringify({ coletar: agora ? true : !l.coletar }) });
      mudou();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const dica = agora ? "Começa a ouvir em até 1 minuto. O chat de antes não volta."
    : l.coletar ? "Não ouvir esta live" : "Ouvir esta live";

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 3, flex: "0 0 auto" }}>
      {agora ? (
        <button type="button" className="botao-escuro" onClick={trocar} disabled={enviando} title={dica} style={{ padding: "6px 12px", fontSize: 13, whiteSpace: "nowrap" }}>
          {enviando ? "…" : "Ouvir agora"}
        </button>
      ) : (
        <button type="button" role="switch" aria-checked={l.coletar} onClick={trocar} disabled={enviando} title={dica}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 32, padding: "0 4px", border: 0, background: "transparent", cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1, fontSize: 13, color: "var(--ink2)" }}>
          <span style={{ position: "relative", width: 40, height: 20, borderRadius: 10, boxSizing: "border-box", flex: "0 0 40px",
            border: `1px solid ${l.coletar ? "#3347C9" : "var(--ink3)"}`, background: l.coletar ? "#3347C9" : "var(--surface)", transition: "background .12s" }}>
            <i style={{ position: "absolute", top: 3, left: l.coletar ? 23 : 3, width: 12, height: 12, borderRadius: "50%", background: l.coletar ? "#FFFFFF" : "var(--ink3)", transition: "left .12s" }} />
          </span>
          Ouvir
        </button>
      )}
      {erro && <span style={{ fontSize: 11, color: "var(--redInk)", maxWidth: 220 }}>{erro}</span>}
    </span>
  );
}

/** Todas as lives do canal ou só as escolhidas. Em canal compartilhado, só mostra o modo (`pode` falso). */
export function SeletorModo({ canalId, modo, mudou, pode }: { canalId: string; modo: ModoColeta; mudou: () => void; pode: boolean }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const escolher = async (m: ModoColeta) => {
    if (m === modo || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await api(`/canais/${canalId}/modo`, { method: "PUT", body: JSON.stringify({ modo: m }) });
      mudou();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const opcoes: { m: ModoColeta; t: string; d: string }[] = [
    { m: "todas", t: "Todas as lives", d: "toda live do canal" },
    { m: "escolhidas", t: "Só as que eu marcar", d: "você escolhe na agenda" },
  ];
  return (
    <div>
      <div role="radiogroup" aria-label="Modo de coleta" style={{ display: "inline-flex", background: "var(--s3)", border: "1px solid var(--line2)", borderRadius: 4, padding: 3, gap: 3 }}>
        {opcoes.map(o => (
          <button key={o.m} type="button" role="radio" aria-checked={o.m === modo} onClick={() => escolher(o.m)} disabled={enviando || !pode}
            style={{ fontSize: 13, fontWeight: 600, borderRadius: 4, padding: "7px 13px", border: 0, cursor: o.m === modo || !pode ? "default" : "pointer",
              background: o.m === modo ? "var(--surface)" : "transparent", color: o.m === modo ? "var(--ink)" : "var(--ink3)",
              boxShadow: o.m === modo ? "0 1px 3px rgba(23,20,15,.12)" : "none" }}>
            {o.t}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 7 }}>{opcoes.find(o => o.m === modo)?.d}</div>
      {erro && <div style={{ fontSize: 12, color: "var(--redInk)", marginTop: 4 }}>{erro}</div>}
    </div>
  );
}

/** Quanto as lives escolhidas devem gastar em cada dia de cota. */
export function CotaPrevista({ dias, tz, max = 2 }: { dias: CotaDia[]; tz: string; max?: number }) {
  const mostrar = dias.slice(0, max);
  if (!mostrar.length) {
    return <div style={{ fontSize: 13, color: "var(--ink3)", marginBottom: 14 }}>Nenhuma live escolhida na agenda: nada de cota reservado.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      {mostrar.map(d => {
        const fr = d.total / d.limite;
        const cor = fr > 1 ? "var(--red)" : fr >= 0.8 ? "var(--amb)" : "var(--ok)";
        const passa = d.total > d.limite;
        return (
          <div key={d.dia} style={{ background: passa ? "var(--redT)" : "var(--s2)", border: `1px solid ${passa ? "var(--redLine)" : "var(--div)"}`, borderRadius: 4, padding: "11px 13px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Cota de {dataCurta(d.dia + "T12:00:00Z", "UTC").slice(0, 5)}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: passa ? "var(--redInk)" : "var(--ink2)" }}>~{n(d.total)} de {n(d.limite)} un.</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
              <div style={{ width: Math.min(100, fr * 100) + "%", height: "100%", background: cor, transition: "width .5s cubic-bezier(.2,.8,.2,1)" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 7, textWrap: "pretty" }}>
              {d.lives.length} {d.lives.length === 1 ? "live escolhida" : "lives escolhidas"}
              {d.pico_simultaneas > 1 && d.pico_em ? ` · até ${d.pico_simultaneas} ao mesmo tempo, às ${hora(d.pico_em, tz)}` : ""}
              {d.gasto > 0 ? ` · inclui ${n(d.gasto)} já gastas` : ""}
              {d.agenda > 0 ? ` · ~${n(d.agenda)} da leitura de agenda` : ""}
            </div>
            {passa && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--redInk)", marginTop: 5, textWrap: "pretty" }}>
                Passa da cota: quando ela acabar, todas as coletas param juntas. Tire algumas lives.
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: "var(--ink4)", textWrap: "pretty" }}>
        Estimativa: chat e audiência pelo gasto medido nas coletas do canal × duração típica das lives dele, até 3 buscas de concorrência por live (100 un. cada) e a leitura da agenda. O dia de cota vira à meia-noite do Pacífico.
      </div>
    </div>
  );
}
