import { useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Canal, CanalDetalhe } from "../api/types";
import { apelido, ha, n } from "../lib/format";
import { definirSaude, recarregarSaude } from "../state/saude";
import type { Saude } from "../state/saude";
import { usePlano } from "../state/plano";
import { Erro } from "./basicos";
import { Modal, btnAcao, btnCancelar } from "./Modal";
import u from "./ui.module.css";

function Marca({ m, tom }: { m: string; tom: "ok" | "red" | "neutro" }) {
  const c = tom === "ok" ? ["var(--okT)", "var(--okLine)", "var(--okInk)"]
    : tom === "red" ? ["var(--redT)", "var(--redLine)", "var(--redInk)"]
      : ["var(--s3)", "var(--line)", "var(--ink3)"];
  return (
    <span style={{ width: 22, height: 22, flex: "0 0 22px", borderRadius: 7, background: c[0], border: `1px solid ${c[1]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: c[2] }}>{m}</span>
  );
}

function Item({ m, tom, children }: { m: string; tom: "ok" | "red" | "neutro"; children: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Marca m={m} tom={tom} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--ink2)", textWrap: "pretty" }}>{children}</div>
    </div>
  );
}

export function VigiarModal({ fechar, adicionado }: { fechar: () => void; adicionado: () => void }) {
  const [handle, setHandle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [canal, setCanal] = useState<CanalDetalhe | null>(null);
  const ok = handle.trim().length > 0 && !enviando;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setEnviando(true);
    setErro("");
    try {
      const c = await api<CanalDetalhe>("/canais", { method: "POST", body: JSON.stringify({ handle: handle.trim() }) });
      setCanal(c);
      adicionado();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (canal) {
    const prox = canal.proxima;
    const nAg = canal.lives.filter(l => l.estado === "agendada").length;
    return (
      <Modal fechar={fechar}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--okT)", border: "1px solid var(--okLine)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ok)", animation: "pulseDot 2s infinite" }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Vigiando {canal.handle || canal.nome}</div>
            <div style={{ fontSize: 13, color: "var(--ink3)" }}>o vigia passou a acompanhar este canal</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <Item m="✓" tom="ok">O vigia vai ler a aba de transmissões do canal a cada poucos minutos, sem consumir cota.</Item>
          <Item m="✓" tom="ok">Quando uma live subir — agendada ou não — um coletor entra no ar junto com ela.</Item>
          <Item m="·" tom="neutro">Não há nada mais a fazer. O relatório fica pronto quando a transmissão encerrar.</Item>
        </div>
        <div style={{ background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 11, padding: "14px 16px", fontSize: 13, color: "var(--ink2)", textWrap: "pretty" }}>
          {prox
            ? `A agenda foi lida agora: ${nAg} ${nAg === 1 ? "transmissão marcada" : "transmissões marcadas"}. A próxima é ${apelido(prox.titulo, 60)}.`
            : "A agenda foi lida agora e não há transmissão marcada. O vigia continua olhando."}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
          <button type="button" style={btnAcao(true)} onClick={fechar}>Entendi</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal fechar={fechar}>
      <form onSubmit={enviar}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Vigiar um canal</div>
            <div style={{ fontSize: 13.5, color: "var(--ink3)" }}>Uma vez só. Depois é automático.</div>
          </div>
          <button type="button" className={u.closeBtn} style={{ width: 30, height: 30, borderRadius: 8, fontSize: 16 }} onClick={fechar} aria-label="Fechar">×</button>
        </div>

        <label htmlFor="handle" style={{ display: "block", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 }}>Canal do YouTube</label>
        <input id="handle" autoFocus value={handle} onChange={e => { setHandle(e.target.value); setErro(""); }} placeholder="@handle ou UC…"
          className={u.input} style={{ background: "var(--surface)", borderRadius: 10, padding: "13px 15px" }} />
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 8 }}>resolver o canal e ler a agenda não consome cota</div>
        {erro && <div style={{ marginTop: 12 }}><Erro texto={erro} /></div>}

        <div style={{ background: "var(--redT)", border: "1px solid var(--redLine)", borderRadius: 11, padding: "15px 17px", marginTop: 20 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 5, textWrap: "pretty" }}>As transmissões anteriores deste canal não serão recuperadas.</div>
          <div style={{ fontSize: 13, color: "var(--ink2)", textWrap: "pretty" }}>O chat de uma live só existe enquanto ela está no ar. A vigilância começa na próxima transmissão que subir.</div>
        </div>

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 22 }}>
          <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
          <button type="submit" disabled={!ok} style={{ ...btnAcao(ok, "var(--red)"), color: "#FFFFFF" }}>
            {enviando ? "Lendo o canal…" : "Vigiar canal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PararModal({ canal, fechar, parado }: { canal: Canal; fechar: () => void; parado: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const noAr = canal.estado === "no_ar";

  const confirmar = async () => {
    setEnviando(true);
    try {
      await api(`/canais/${canal.id}`, { method: "DELETE" });
      parado();
    } catch (err) {
      setErro((err as Error).message);
      setEnviando(false);
    }
  };

  return (
    <Modal fechar={fechar} largura={500} estilo={{ boxShadow: "var(--cardShadow)" }}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Parar de vigiar {canal.nome}?</div>
      <div className="mono" style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 18 }}>{canal.handle}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <Item m="✓" tom="ok">O slot fica livre na hora, para vigiar outro canal.</Item>
        <Item m="✓" tom="ok">Coletas e relatórios já feitos continuam disponíveis, inclusive os links publicados.</Item>
        {noAr && <Item m="×" tom="red">A coleta da live no ar agora é encerrada. O que já foi capturado fica salvo; o resto da transmissão não.</Item>}
        <Item m="×" tom="red">As próximas transmissões do canal não serão coletadas.</Item>
      </div>
      {erro && <div style={{ marginBottom: 14 }}><Erro texto={erro} /></div>}
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
        <button type="button" disabled={enviando} style={{ ...btnAcao(true, "var(--red)"), color: "#FFFFFF" }} onClick={confirmar}>
          {enviando ? "Parando…" : "Parar e liberar o slot"}
        </button>
      </div>
    </Modal>
  );
}

/** Liga ou desliga o vigia (o processo que sobe os coletores). */
export function VigiaModal({ saude, fechar }: { saude: Saude | null; fechar: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const { emUso } = usePlano();
  const dePe = !!saude?.vigia.de_pe;
  const ativas = saude?.coletas_ativas ?? 0;

  const confirmar = async () => {
    setEnviando(true);
    setErro("");
    try {
      definirSaude(await api<Saude>(`/operacao/vigia/${dePe ? "desligar" : "ligar"}`, { method: "POST" }));
      fechar();
    } catch (err) {
      setErro((err as Error).message);
      recarregarSaude();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal fechar={fechar} largura={500} estilo={{ boxShadow: "var(--cardShadow)" }}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>{dePe ? "Desligar o vigia?" : "Ligar o vigia"}</div>
      <div style={{ fontSize: 13.5, color: "var(--ink3)", marginBottom: 18 }}>
        {dePe
          ? `Rodando ${ha(saude?.vigia.desde ?? null)}.`
          : "O vigia acompanha os canais e começa a coletar sozinho quando uma live sobe."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {dePe ? (
          <>
            <Item m="×" tom="red">Lives que começarem com o vigia desligado não serão coletadas. O chat ao vivo não pode ser recuperado depois.</Item>
            {ativas > 0
              ? <Item m="✓" tom="ok">{`${ativas === 1 ? "A coleta em andamento continua" : `As ${ativas} coletas em andamento continuam`} até o fim da live. Para parar antes, use "Encerrar coleta" na própria live.`}</Item>
              : <Item m="·" tom="neutro">Nenhuma coleta em andamento agora.</Item>}
            <Item m="✓" tom="ok">Coletas, relatórios e links publicados continuam disponíveis.</Item>
          </>
        ) : (
          <>
            <Item m="✓" tom="ok">{`Lê a agenda ${emUso === 1 ? "do canal vigiado" : `dos ${emUso} canais vigiados`} a cada 5 minutos, gastando pouca cota.`}</Item>
            <Item m="✓" tom="ok">Quando uma live entra no ar, sobe um coletor para ela. Uma live de 3 h gasta cerca de 2.700 das 10.000 unidades diárias.</Item>
            <Item m="·" tom="neutro">Só vigia enquanto este computador e a API estiverem ligados.</Item>
          </>
        )}
      </div>
      {!!saude?.coletas?.length && (
        <div style={{ background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 11, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 8 }}>
            Coletando agora · um coletor por vídeo
          </div>
          {saude.coletas.map(c => (
            <a key={c.id} href={`/yt/lives/${c.id}`} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 0", borderTop: "1px solid var(--div)", color: "inherit", textDecoration: "none" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apelido(c.titulo, 44)}</span>
              <span className="mono tnum" style={{ fontSize: 12, color: "var(--ink3)", whiteSpace: "nowrap" }} title="unidades gastas por este coletor: total · na última hora">
                {n(c.unidades)} un. · {n(c.ultima_hora)}/h
              </span>
            </a>
          ))}
        </div>
      )}
      {erro && <div style={{ marginBottom: 14 }}><Erro texto={erro} /></div>}
      <div style={{ display: "flex", gap: 9, justifyContent: "flex-end" }}>
        <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
        <button type="button" disabled={enviando} onClick={confirmar}
          style={dePe ? { ...btnAcao(!enviando, "var(--red)"), color: "#FFFFFF" } : { ...btnAcao(!enviando, "var(--ok)"), color: "#FFFFFF" }}>
          {enviando ? (dePe ? "Desligando…" : "Ligando…") : (dePe ? "Desligar o vigia" : "Ligar o vigia")}
        </button>
      </div>
    </Modal>
  );
}
