// Descartar uma coleta (muito parcial, reprise...): ela sai das listas, das
// comparações, do ranking e dos totais do canal. Reversível: o dado bruto
// fica, e "Restaurar" traz de volta.
import { useState } from "react";
import { api } from "../../api/client";
import type { LiveDetalhe } from "../../api/types";
import { Erro } from "../../components/basicos";
import { Modal, btnAcao, btnCancelar } from "../../components/Modal";
import { dataHora, pct } from "../../lib/format";
import { useSessao } from "../../state/sessao";

const MOTIVOS = ["Coleta muito parcial", "Reprise ou conteúdo repetido"];

const pilula = {
  fontSize: 12.5, fontWeight: 600, color: "var(--ink3)", border: "1px solid var(--line2)", borderRadius: 99,
  padding: "4px 11px", background: "transparent", cursor: "pointer", whiteSpace: "nowrap" as const,
};

/** Botão no topo da página de uma coleta encerrada que ainda não foi descartada. */
export function BotaoDescartar({ live, mudou }: { live: LiveDetalhe; mudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  if (live.descartada) return null;
  return (
    <>
      <button type="button" style={pilula} onClick={() => setAberto(true)} title="Tirar esta coleta das listas, comparações e totais">Descartar coleta</button>
      {aberto && <ModalDescartar live={live} fechar={() => setAberto(false)} mudou={mudou} />}
    </>
  );
}

function ModalDescartar({ live, fechar, mudou }: { live: LiveDetalhe; fechar: () => void; mudou: () => void }) {
  // coleta com buraco: sugere o motivo
  const [escolha, setEscolha] = useState(live.estado === "parcial" ? MOTIVOS[0] : "");
  const [outro, setOutro] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const motivo = escolha === "outro" ? outro.trim() : escolha;
  const inteiro = live.trechos.length > 1 && !live.trecho;

  const enviar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await api(`/lives/${live.id}/descarte`, { method: "PUT", body: JSON.stringify({ motivo }) });
      fechar();
      mudou();
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  };

  return (
    <Modal fechar={fechar} largura={480}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Descartar coleta</div>
      <div style={{ fontSize: 13.5, color: "var(--ink3)", marginBottom: 16, textWrap: "pretty" }}>
        {inteiro ? "O link inteiro e todos os trechos dele" : "Esta coleta"} sai da lista do canal, das comparações, do ranking e dos totais.
        Nada é apagado: os dados ficam guardados, a coleta aparece no filtro “Descartadas” e pode ser restaurada.
        {live.acompanhada != null && <> Esta coleta acompanhou {pct(live.acompanhada)} da transmissão.</>}
      </div>
      <div role="radiogroup" aria-label="Motivo" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {[...MOTIVOS, "outro"].map(m => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, cursor: "pointer" }}>
            <input type="radio" name="motivo" checked={escolha === m} onChange={() => setEscolha(m)} />
            {m === "outro" ? "Outro motivo" : m}
          </label>
        ))}
        {escolha === "outro" && (
          <input autoFocus value={outro} onChange={e => setOutro(e.target.value)} maxLength={200} placeholder="Escreva o motivo"
            style={{ fontSize: 14, padding: "9px 11px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--ink)" }} />
        )}
      </div>
      {erro && <div style={{ margin: "6px 0 10px" }}><Erro texto={erro} /></div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
        <button type="button" style={btnAcao(!!motivo && !enviando)} disabled={!motivo || enviando} onClick={enviar}>{enviando ? "Descartando…" : "Descartar"}</button>
      </div>
    </Modal>
  );
}

/** Faixa no topo de uma coleta descartada: quando, por quê, e restaurar. */
export function AvisoDescartada({ live, mudou }: { live: LiveDetalhe; mudou: () => void }) {
  const { conta } = useSessao();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const d = live.descartada;
  if (!d) return null;
  const pai = live.trecho?.video_id;

  const restaurar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await api(`/lives/${d.do_video && pai ? pai : live.id}/descarte`, { method: "DELETE" });
      mudou();
    } catch (e) {
      setErro((e as Error).message);
    }
    setEnviando(false);
  };

  return (
    <div style={{ background: "var(--s3)", border: "1px solid var(--line2)", borderLeft: "3px solid var(--ink4)", borderRadius: 12, padding: "12px 16px", marginBottom: 16,
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 240, fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>
        <b>Coleta descartada</b>{d.do_video ? " junto com o link inteiro" : ""} em {dataHora(d.em, conta.tz)}: {d.motivo}.
        Ela não aparece na lista do canal, nas comparações, no ranking nem nos totais. Os dados continuam aqui.
      </div>
      {erro && <Erro texto={erro} />}
      <button type="button" style={{ ...btnCancelar, padding: "7px 13px", fontSize: 13 }} disabled={enviando} onClick={restaurar}>
        {enviando ? "Restaurando…" : d.do_video ? "Restaurar o link inteiro" : "Restaurar"}
      </button>
    </div>
  );
}
