// Registro do sistema: avisos e erros do vigia, dos coletores e da API
// (collector/registro.py). Só o admin vê. É o que substitui olhar o terminal
// quando a Lively roda numa VM.
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useApi } from "../api/client";
import { CHAVE_VISTO, useCrumbs } from "../components/AppLayout";
import { dataHora, ha, nomeLive } from "../lib/format";
import { useSessao } from "../state/sessao";
import s from "./canais.module.css";

export type Evento = {
  id: number; em: string; ultimo_em: string; nivel: "aviso" | "erro" | "critico"; origem: "vigia" | "coletor" | "api";
  video_id: string | null; titulo: string | null; mensagem: string; detalhe: string | null; repeticoes: number;
};

const NIVEL = {
  critico: { t: "caiu", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)" },
  erro: { t: "erro", bg: "var(--redT)", bd: "var(--redLine)", ink: "var(--redInk)" },
  aviso: { t: "aviso", bg: "var(--ambT)", bd: "var(--ambLine)", ink: "var(--ambInk)" },
};
const ORIGEM = { vigia: "vigia", coletor: "coletor", api: "API" };

function Linha({ e, tz }: { e: Evento; tz: string }) {
  const [aberto, setAberto] = useState(false);
  const c = NIVEL[e.nivel];
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "12px 2px" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12.5, color: "var(--ink3)", width: 132, flex: "0 0 132px" }} title={e.ultimo_em}>
          {dataHora(e.ultimo_em, tz)}
        </span>
        <span className={s.chipP} style={{ background: c.bg, borderColor: c.bd, color: c.ink, width: 52, textAlign: "center", flex: "0 0 52px" }}>{c.t}</span>
        <span style={{ fontSize: 12.5, color: "var(--ink2)", width: 56, flex: "0 0 56px" }}>{ORIGEM[e.origem]}</span>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 14, color: "var(--ink)", textWrap: "pretty", overflowWrap: "anywhere" }}>{e.mensagem}</div>
          <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {e.video_id && <Link to={`/yt/lives/${e.video_id}`} style={{ color: "var(--ink2)" }}>{e.titulo ? nomeLive(e.titulo) : e.video_id}</Link>}
            {e.repeticoes > 1 && <span>repetiu {e.repeticoes}× desde {dataHora(e.em, tz)}</span>}
            {e.detalhe && (
              <button type="button" onClick={() => setAberto(a => !a)}
                style={{ border: 0, background: "none", padding: 0, color: "var(--ink2)", textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>
                {aberto ? "esconder detalhe" : "ver detalhe técnico"}
              </button>
            )}
          </div>
          {aberto && e.detalhe && (
            <pre className="mono" style={{ fontSize: 11.5, background: "var(--s3)", border: "1px solid var(--line)", borderRadius: 4,
              padding: "10px 12px", marginTop: 8, overflowX: "auto", whiteSpace: "pre", color: "var(--ink2)" }}>{e.detalhe}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function Registro() {
  useCrumbs([{ label: "Registro do sistema" }]);
  const { admin, conta } = useSessao();
  const [nivel, setNivel] = useState<"" | "erro" | "aviso">("");
  const [origem, setOrigem] = useState("");
  const q = new URLSearchParams({ ...(nivel && { nivel }), ...(origem && { origem }) }).toString();
  const { dados, erro, carregando, recarregar } = useApi<{ eventos: Evento[]; guardados_dias: number }>(
    admin ? `/operacao/eventos${q ? "?" + q : ""}` : null);

  // abriu o registro: o selo do cabeçalho zera
  useEffect(() => {
    try { localStorage.setItem(CHAVE_VISTO, new Date().toISOString()); } catch { /* sem storage: o selo só não zera */ }
    window.dispatchEvent(new Event(CHAVE_VISTO));
  }, [dados]);

  if (!admin) return <Navigate to="/yt/canais" replace />;
  const lista = dados?.eventos ?? [];
  const sel = { fontSize: 13, padding: "6px 10px", borderRadius: 4, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--ink)" };

  return (
    <div className={`${s.pagina} view-in`}>
      <div className={s.conteudo}>
        <div style={{ padding: "36px 0 6px" }}>
          <h1 className={s.h1}>Registro do sistema</h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink2)", textWrap: "pretty", maxWidth: 760 }}>
            Avisos e erros do vigia, dos coletores e da API. O que se repete em poucos minutos vira uma linha só.
            {dados && ` Ficam guardados ${dados.guardados_dias} dias.`}
          </p>
        </div>

        <div className={s.painel} style={{ marginTop: 18 }}>
          <div className={s.painelTopo} style={{ alignItems: "center" }}>
            <select aria-label="Nível" value={nivel} onChange={e => setNivel(e.target.value as typeof nivel)} style={sel}>
              <option value="">Avisos e erros</option>
              <option value="erro">Só erros</option>
              <option value="aviso">Só avisos</option>
            </select>
            <select aria-label="Origem" value={origem} onChange={e => setOrigem(e.target.value)} style={sel}>
              <option value="">Todas as origens</option>
              <option value="vigia">Vigia</option>
              <option value="coletor">Coletores</option>
              <option value="api">API</option>
            </select>
            <button type="button" className={s.botaoLinha} style={{ marginLeft: "auto" }} onClick={recarregar}>Atualizar</button>
          </div>
          {erro && <div className={s.erroCaixa}>{erro.message}</div>}
          {carregando && !dados && <div className={s.carregando}>carregando o registro…</div>}
          {dados && lista.length === 0 && (
            <div className={s.vazioLista}>Nada registrado{nivel || origem ? " com esse filtro" : ""}. Quando algo der errado, aparece aqui.</div>
          )}
          {lista.map(e => <Linha key={e.id} e={e} tz={conta.tz} />)}
          {lista.length > 0 && (
            <div className={s.vazioLista} style={{ paddingTop: 12 }}>
              Último registro {ha(lista[0].ultimo_em)}. Mostrando os {lista.length} mais recentes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
