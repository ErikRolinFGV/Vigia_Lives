// Acervo da Lively (v2): todas as lives ouvidas numa tabela, com filtro e
// seleção de 2 a 4 para comparar.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApi } from "../api/client";
import type { ListaFichas } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { valorMetrica } from "../lib/ficha";
import { dataCurta, nomeLive } from "../lib/format";
import { useSessao } from "../state/sessao";
import s from "./v2.module.css";

const MAX = 4;

export function Acervo() {
  useCrumbs([]);
  const nav = useNavigate();
  const { conta } = useSessao();
  const [q] = useSearchParams();
  const lista = useApi<ListaFichas>("/fichas");
  const [busca, setBusca] = useState(q.get("q") ?? "");
  const [canal, setCanal] = useState("");
  const [sel, setSel] = useState<string[]>([]);

  const fichas = lista.dados?.fichas ?? [];
  const canais = useMemo(() => [...new Set(fichas.map(f => f.canal))].sort(), [fichas]);
  const termo = busca.trim().toLowerCase();
  const linhas = fichas.filter(f => (!canal || f.canal === canal)
    && (!termo || [f.titulo, f.nucleo, f.canal, f.categoria].some(x => (x ?? "").toLowerCase().includes(termo))))
    .sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""));

  const marcar = (id: string) => setSel(a => a.includes(id) ? a.filter(x => x !== id) : a.length >= MAX ? a : [...a, id]);
  const comparar = () => nav(`/yt/comparar?ids=${encodeURIComponent(sel.join(","))}`);

  return (
    <div className={s.pagina}>
      <div className={s.titulo}>
        <h1>Acervo</h1>
        <div className={s.acoes}>
          <button type="button" className="botao-escuro" disabled={sel.length < 2} onClick={comparar}>Comparar ({sel.length})</button>
        </div>
      </div>

      <section className={s.cartao}>
        <div className={s.cab} style={{ gap: 8 }}>
          <input className={s.inp} style={{ flex: "2 1 240px" }} type="search" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar título, time, campeonato" aria-label="Buscar no acervo" />
          <select className={s.inp} style={{ flex: "1 1 160px" }} value={canal} onChange={e => setCanal(e.target.value)} aria-label="Canal">
            <option value="">Todos os canais</option>
            {canais.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className={s.sub} style={{ marginLeft: "auto" }}>{linhas.length} {linhas.length === 1 ? "live" : "lives"}</span>
        </div>
        {lista.erro && <div className={s.vazio}>Não consegui ler o acervo: {lista.erro.message}</div>}
        {lista.dados && linhas.length === 0 && <div className={s.vazio}>Nenhuma live com esse filtro.</div>}
        {linhas.length > 0 && (
          <div className={s.rolar}>
            <table className={s.tabela}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}><span style={{ position: "absolute", left: -9999 }}>Selecionar</span></th>
                  <th>Data</th><th>Live</th><th className={s.n}>Duração</th><th className={s.n}>Pico</th>
                  <th className={s.n}>Pessoas no chat</th><th className={s.n}>Participação</th><th>Acompanhamento</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(f => {
                  const v = f.valores;
                  const marcada = sel.includes(f.id);
                  return (
                    <tr key={f.id} className={`${s.linha} ${marcada ? s.sel : ""}`} onClick={() => nav(`/yt/lives/${f.id}`)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className={s.cb} checked={marcada} disabled={!marcada && sel.length >= MAX}
                          onChange={() => marcar(f.id)} aria-label={`Selecionar ${nomeLive(f.titulo)}`} />
                      </td>
                      <td className="tnum" style={{ whiteSpace: "nowrap", color: "var(--ink2)" }}>{dataCurta(f.inicio, conta.tz)}</td>
                      <td><span className={s.nome}>{nomeLive(f.titulo)}</span> <span className={s.sub}>{f.canal}{f.categoria && ` · ${f.categoria}`}</span></td>
                      <td className={s.n}>{valorMetrica(v.duracao, "dur")}</td>
                      <td className={s.n} style={{ fontWeight: 600 }}>{valorMetrica(v.pico, "int")}</td>
                      <td className={s.n}>{valorMetrica(v.pessoas, "int")}</td>
                      <td className={s.n}>{valorMetrica(v.participacao, "pct2")}</td>
                      <td>{f.parcial
                        ? <span className={`${s.st} ${s.parte}`}>Em parte · {valorMetrica(v.acompanhada, "pct1")}</span>
                        : <span className="tnum">{valorMetrica(v.acompanhada, "pct1")}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
