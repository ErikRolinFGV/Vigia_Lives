// Início da Lively (v2): o que está no ar, o que vem nas próximas 48 h, a
// capacidade do dia, os canais e o que acabou de ficar pronto.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import type { Agenda, ItemAgenda, ListaCanais } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { CanalAvatar } from "../components/CanalFoto";
import { BotaoColetar, CotaPrevista } from "../components/Coleta";
import { LinkModal, VigiarModal } from "../components/ModaisCanal";
import { dataCurta, dataHora, falta, ha, n, nomeLive } from "../lib/format";
import { useSessao } from "../state/sessao";
import s from "./v2.module.css";

function saudacao(tz: string) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function hoje(tz: string) {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function situacao(estado: ItemAgenda["estado"]) {
  if (estado === "perdida") return <span className={`${s.st} ${s.cinza}`}>Não ouvida</span>;
  if (estado === "parcial") return <span className={`${s.st} ${s.parte}`}>Em parte</span>;
  if (estado === "nao_escolhida") return <span className={`${s.st} ${s.cinza}`}>Fora da seleção</span>;
  return <span className={`${s.st} ${s.pronto}`}>Resumo pronto</span>;
}

export function Inicio() {
  useCrumbs([]);
  const nav = useNavigate();
  const { conta, acesso } = useSessao();
  const agenda = useApi<Agenda>("/agenda");
  const lista = useApi<ListaCanais>("/canais");
  const [add, setAdd] = useState(false);
  const [porLink, setPorLink] = useState(false);
  const recarregar = () => { agenda.recarregar(); lista.recarregar(); };

  const proximas = agenda.dados?.proximas ?? [];
  const noAr = proximas.filter(a => a.estado === "no_ar" || a.ao_vivo);
  const limite = Date.now() + 48 * 3600 * 1000;
  const janela = proximas.filter(a => !(a.estado === "no_ar" || a.ao_vivo) && (!a.agendada_para || new Date(a.agendada_para).getTime() <= limite));
  const marcadas = janela.filter(a => a.coletar).length;
  const recentes = (agenda.dados?.recentes ?? []).slice(0, 6);
  const nome = acesso?.usuario ? acesso.usuario.charAt(0).toUpperCase() + acesso.usuario.slice(1) : "";

  return (
    <div className={s.pagina}>
      <div className={s.titulo}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className={s.sub} style={{ fontSize: 13 }}>{hoje(conta.tz)}</span>
          <h1>{saudacao(conta.tz)}{nome && `, ${nome}`}</h1>
        </div>
        <div className={s.acoes}>
          <button type="button" className="botao-claro" onClick={() => setPorLink(true)}>Ouvir live pelo link</button>
          <button type="button" className="botao-escuro" onClick={() => setAdd(true)}>+ Acompanhar canal</button>
        </div>
      </div>

      {noAr.map(a => {
        const ouvindo = a.estado === "no_ar";
        return (
          <div key={a.id} className={`${s.cartao} ${s.linha}`} role="link" tabIndex={0}
            onClick={() => nav(`/yt/lives/${a.id}`)} onKeyDown={e => e.key === "Enter" && nav(`/yt/lives/${a.id}`)}
            style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, padding: "16px 20px" }}>
            <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={`${s.st} ${s.vivo}`}><i />AO VIVO</span>
                <span className={s.sub} style={{ fontSize: 13 }}>{a.canal} · {ha(a.inicio || a.detectada_em)}{!ouvindo && " · não está sendo ouvida"}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{nomeLive(a.titulo)}</div>
              {ouvindo && (
                <div className={s.kpis}>
                  <div className={s.kpi}><b>{n(a.pico)}</b><span className={s.sub}>pico até agora</span></div>
                  <div className={s.kpi}><b>{n(a.mensagens)}</b><span className={s.sub}>mensagens</span></div>
                </div>
              )}
            </div>
            <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {!ouvindo && <BotaoColetar l={a} mudou={recarregar} />}
              <Link to={`/yt/lives/${a.id}`} className="botao-claro" style={{ textDecoration: "none" }}>Abrir</Link>
            </div>
          </div>
        );
      })}

      <div className={s.duas}>
        <section className={`${s.cartao} ${s.larga}`}>
          <div className={s.cab}><h2>Próximas 48 h</h2><span className={s.sub} style={{ marginLeft: "auto" }}>{marcadas} de {janela.length} marcadas</span></div>
          {agenda.dados && janela.length === 0 ? <div className={s.vazio}>Nenhuma live marcada nas próximas 48 h.</div> : (
            <div className={s.rolar}>
              <table className={s.tabela}>
                <thead><tr><th>Quando</th><th>Live</th><th>Ouvir</th></tr></thead>
                <tbody>
                  {janela.map(a => (
                    <tr key={a.id} className={`${s.linha} ${a.coletar ? "" : s.apagado}`} onClick={() => nav(`/yt/lives/${a.id}`)}>
                      <td style={{ whiteSpace: "nowrap" }} className="tnum">{dataHora(a.agendada_para, conta.tz)}<div className={s.sub}>{falta(a.agendada_para)}</div></td>
                      <td><div className={s.nome}>{nomeLive(a.titulo)}</div><div className={s.sub}>{a.canal}{a.avulsa && " · pelo link"}</div></td>
                      <td onClick={e => e.stopPropagation()}><BotaoColetar l={a} mudou={recarregar} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className={s.estreita}>
          <section className={s.cartao}>
            <div className={s.cab}><h2>Capacidade</h2></div>
            <div className={s.corpo}>{agenda.dados ? <CotaPrevista dias={agenda.dados.cota} tz={conta.tz} /> : <span className={s.sub}>…</span>}</div>
          </section>
          <section className={s.cartao}>
            <div className={s.cab}><h2>Canais</h2><Link to="/yt/canais" style={{ marginLeft: "auto", fontSize: 13 }}>Ver todos</Link></div>
            {lista.dados?.canais.slice(0, 5).map(c => (
              <Link key={c.id} to={`/yt/canais/${c.id}`} className={s.canal}>
                <CanalAvatar id={c.id} nome={c.nome} foto={c.foto} />
                <span className={s.nome} style={{ flex: 1, minWidth: 0 }}>{c.nome}</span>
                {c.estado === "no_ar" && <span className={`${s.st} ${s.vivo}`}><i />no ar</span>}
              </Link>
            ))}
            {lista.dados && lista.dados.canais.length === 0 && <div className={s.vazio}>Nenhum canal ainda.</div>}
          </section>
        </div>
      </div>

      <section className={s.cartao}>
        <div className={s.cab}><h2>Recentes</h2><Link to="/yt/acervo" style={{ marginLeft: "auto", fontSize: 13 }}>Ver acervo</Link></div>
        {agenda.dados && recentes.length === 0 ? <div className={s.vazio}>Nenhuma live ouvida ainda.</div> : (
          <div className={s.rolar}>
            <table className={s.tabela}>
              <thead><tr><th>Live</th><th>Canal</th><th>Data</th><th className={s.n}>Pico</th><th>Situação</th></tr></thead>
              <tbody>
                {recentes.map(r => (
                  <tr key={r.id} className={s.linha} onClick={() => nav(`/yt/lives/${r.id}`)}>
                    <td className={s.nome}>{r.estado === "perdida" ? "Transmissão sem acompanhamento" : nomeLive(r.titulo)}</td>
                    <td>{r.canal}</td>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{dataCurta(r.inicio || r.agendada_para, conta.tz)}</td>
                    <td className={s.n}>{r.estado === "perdida" ? "—" : n(r.pico)}</td>
                    <td>{situacao(r.estado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {porLink && <LinkModal fechar={() => setPorLink(false)} marcada={id => { setPorLink(false); nav(`/yt/lives/${id}`); }} />}
      {add && <VigiarModal fechar={() => setAdd(false)} adicionado={recarregar} />}
    </div>
  );
}
