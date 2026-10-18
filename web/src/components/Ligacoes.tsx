// O que liga uma transmissão a outras: o vídeo no YouTube, os trechos do
// mesmo vídeo (o canal trocou o título no meio) e o mesmo jogo em outro link.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { LiveDetalhe } from "../api/types";
import { CHIP } from "../lib/estados";
import { apelido, hora } from "../lib/format";
import { useSessao } from "../state/sessao";
import { Erro } from "./basicos";
import { Modal, btnAcao, btnCancelar } from "./Modal";

const pilula = {
  fontSize: 12.5, fontWeight: 600, color: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: 99,
  padding: "4px 11px", background: "var(--s3)", textDecoration: "none", whiteSpace: "nowrap" as const,
};

/** Abre a live (no minuto do trecho, se for um) em outra aba. */
export function BotaoYouTube({ url }: { url: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" style={pilula} title="Abre o vídeo no YouTube em outra aba">Assistir no YouTube ↗</a>;
}

const caixa = { background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 12, padding: "13px 16px", marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 9 };

/** Trechos do mesmo vídeo: qual é este, os outros, o vídeo inteiro e o ajuste do corte. */
export function AvisoTrechos({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const [ajustar, setAjustar] = useState(false);
  if (live.trechos.length < 2) return null;
  const pai = live.trechos[0].trecho!.video_id;
  const inteiro = !live.trecho;
  const cortes = live.trechos.slice(1).map(t => hora(t.inicio ?? null, conta.tz));
  return (
    <div style={caixa}>
      <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>
        {inteiro
          ? <>Este vídeo carregou <b>{live.trechos.length} transmissões</b>: o canal trocou o título às {cortes.join(", ")}. Aqui está o vídeo inteiro; cada trecho tem dados e relatório próprios.</>
          : <>Trecho <b>{live.trecho!.n} de {live.trecho!.total}</b> do mesmo vídeo: o canal trocou o título às {cortes.join(", ")}. Os dados e o relatório desta página são só deste trecho.</>}
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
        {live.trechos.map(t => {
          const atual = t.id === live.id;
          return (
            <Link key={t.id} to={`/yt/lives/${t.id}`} style={{ ...pilula, background: atual ? "var(--surface)" : "var(--s3)", color: atual ? "var(--ink)" : "var(--ink2)", borderColor: atual ? "var(--lineH)" : "var(--line2)" }}>
              {t.trecho!.n}. {apelido(t.titulo, 30)} · {hora(t.inicio ?? null, conta.tz)}–{t.fim ? hora(t.fim, conta.tz) : "fim"}
            </Link>
          );
        })}
        <Link to={`/yt/lives/${pai}`} style={{ ...pilula, borderStyle: "dashed", color: inteiro ? "var(--ink)" : "var(--ink3)" }}>vídeo inteiro</Link>
        <button type="button" onClick={() => setAjustar(true)} style={{ ...pilula, cursor: "pointer", marginLeft: "auto" }}>Ajustar o corte</button>
      </div>
      {ajustar && <AjustarCorte live={live} pai={pai} fechar={() => setAjustar(false)} />}
    </div>
  );
}

function hms(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null;
}

function relogio(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

/** Muda a hora de cada corte, volta ao automático ou desfaz a divisão. O dado bruto não muda. */
function AjustarCorte({ live, pai, fechar }: { live: LiveDetalhe; pai: string; fechar: () => void }) {
  const { conta } = useSessao();
  const nav = useNavigate();
  const atuais = live.trechos.slice(1);
  const [valores, setValores] = useState(() => atuais.map(t => relogio(t.inicio, conta.tz)));
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (cortes: number[] | null, destino: string) => {
    setEnviando(true);
    setErro("");
    try {
      await api(`/lives/${pai}/divisao`, { method: "PUT", body: JSON.stringify({ cortes }) });
      fechar();
      nav(destino);
      window.location.reload();
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  };

  const salvar = () => {
    // o novo corte = corte atual + diferença entre o relógio digitado e o atual
    const cortes: number[] = [];
    for (let i = 0; i < atuais.length; i++) {
      const novo = hms(valores[i]), velho = hms(relogio(atuais[i].inicio, conta.tz));
      if (novo == null || velho == null) { setErro(`Hora inválida: "${valores[i]}". Use HH:MM ou HH:MM:SS.`); return; }
      cortes.push(atuais[i].trecho!.ini + (novo - velho));
    }
    enviar(cortes, `/yt/lives/${live.id}`);
  };

  return (
    <Modal fechar={fechar} largura={480}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Ajustar o corte</div>
      <div style={{ fontSize: 13.5, color: "var(--ink3)", marginBottom: 16, textWrap: "pretty" }}>
        O corte foi sugerido na troca de título. Se o jogo acabou antes ou depois, mude a hora. Só a janela de cada trecho muda; nenhum dado é apagado.
      </div>
      {atuais.map((t, i) => (
        <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 14 }}>
          <span style={{ flex: 1, minWidth: 0, color: "var(--ink2)" }}>Começo de “{apelido(t.titulo, 34)}”</span>
          <input value={valores[i]} onChange={e => setValores(v => v.map((x, j) => (j === i ? e.target.value : x)))}
            className="mono" style={{ width: 104, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--ink)" }} />
        </label>
      ))}
      {erro && <div style={{ margin: "6px 0 10px" }}><Erro texto={erro} /></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" style={btnCancelar} disabled={enviando} onClick={() => enviar([], `/yt/lives/${pai}`)} title="Volta a ser uma transmissão só">Não dividir</button>
        <button type="button" style={btnCancelar} disabled={enviando} onClick={() => enviar(null, `/yt/lives/${live.id}`)} title="Corte na troca de título">Automático</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
        <button type="button" style={btnAcao(!enviando)} disabled={enviando} onClick={salvar}>{enviando ? "Salvando…" : "Salvar"}</button>
      </div>
    </Modal>
  );
}

/** O mesmo jogo em outra transmissão do canal: liga as duas e diz que não é coleta dobrada. */
export function AvisoMesmoJogo({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  if (!live.mesmo_jogo.length) return null;
  return (
    <div style={caixa}>
      <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>
        O mesmo conteúdo também passou em {live.mesmo_jogo.length === 1 ? "outra transmissão" : `outras ${live.mesmo_jogo.length} transmissões`} do canal.
        São vídeos diferentes, cada um com o próprio coletor: nada foi coletado em dobro.
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        {live.mesmo_jogo.map(m => {
          const ch = CHIP[m.estado];
          return (
            <Link key={m.id} to={`/yt/lives/${m.id}`} style={{ ...pilula, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: ch.ink }}>{ch.label}</span>
              {apelido(m.titulo, 30)} · {hora(m.inicio ?? null, conta.tz)}{m.fim ? `–${hora(m.fim, conta.tz)}` : ""}
              {m.trecho ? ` · trecho ${m.trecho.n}` : ""}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
