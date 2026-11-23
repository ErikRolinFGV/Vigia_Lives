// Ao vivo (v2): as lives que a Lively está ouvindo agora e as que estão no ar
// sem ser ouvidas. Relê sozinha enquanto a página está aberta.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import type { Agenda } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { BotaoColetar } from "../components/Coleta";
import { LinkModal } from "../components/ModaisCanal";
import { ha, n, nomeLive } from "../lib/format";
import { useSaude } from "../state/saude";
import s from "./v2.module.css";

const RELER_MS = 30_000;

export function NoAr() {
  useCrumbs([]);
  const nav = useNavigate();
  const saude = useSaude();
  const agenda = useApi<Agenda>("/agenda");
  const [porLink, setPorLink] = useState(false);
  const { recarregar } = agenda;
  useEffect(() => {
    const t = window.setInterval(recarregar, RELER_MS);
    return () => window.clearInterval(t);
  }, [recarregar]);

  const noAr = (agenda.dados?.proximas ?? []).filter(a => a.estado === "no_ar" || a.ao_vivo);
  const coletas = saude?.coletas ?? [];
  const porId = new Map(coletas.map(c => [c.id, c]));
  const ouvindo = noAr.filter(a => a.estado === "no_ar" || porId.has(a.id));
  // coletor de pé de live que a agenda não lista (colada pelo link, por exemplo)
  const soNoServico = coletas.filter(c => !noAr.some(a => a.id === c.id));
  const semOuvir = noAr.filter(a => !(a.estado === "no_ar" || porId.has(a.id)));
  const vazio = agenda.dados && ouvindo.length === 0 && soNoServico.length === 0 && semOuvir.length === 0;

  return (
    <div className={s.pagina}>
      <div className={s.titulo}>
        <h1>Ao vivo</h1>
        <span className={s.sub} style={{ fontSize: 13, paddingBottom: 4 }}>atualiza sozinho</span>
        <div className={s.acoes}>
          <button type="button" className="botao-claro" onClick={() => setPorLink(true)}>Ouvir live pelo link</button>
        </div>
      </div>

      {vazio && (
        <section className={s.cartao}>
          <div className={s.vazio}>Nenhuma live no ar agora. As próximas estão no <Link to="/yt/inicio">Início</Link>.</div>
        </section>
      )}

      {(ouvindo.length > 0 || soNoServico.length > 0) && (
        <section className={s.cartao}>
          <div className={s.cab}>
            <span className={`${s.st} ${s.vivo}`}><i />OUVINDO</span>
            <h2>{ouvindo.length + soNoServico.length} {ouvindo.length + soNoServico.length === 1 ? "live" : "lives"}</h2>
          </div>
          <div className={s.rolar}>
            <table className={s.tabela}>
              <thead><tr><th>Live</th><th>Desde</th><th className={s.n}>Pico até agora</th><th className={s.n}>Mensagens</th><th className={s.n}>Cota na última hora</th><th /></tr></thead>
              <tbody>
                {ouvindo.map(a => {
                  const c = porId.get(a.id);
                  return (
                    <tr key={a.id} className={s.linha} onClick={() => nav(`/yt/lives/${a.id}`)}>
                      <td><div className={s.nome}>{nomeLive(a.titulo)}</div><div className={s.sub}>{a.canal}{a.avulsa && " · pelo link"}</div></td>
                      <td style={{ whiteSpace: "nowrap" }}>{ha(c?.desde || a.coleta_inicio || a.inicio)}</td>
                      <td className={s.n} style={{ fontWeight: 600 }}>{n(a.pico)}</td>
                      <td className={s.n}>{n(a.mensagens)}</td>
                      <td className={s.n}>{c ? `${n(c.ultima_hora)} un.` : "—"}</td>
                      <td style={{ textAlign: "right" }}><Link to={`/yt/lives/${a.id}`} onClick={e => e.stopPropagation()}>Abrir</Link></td>
                    </tr>
                  );
                })}
                {soNoServico.map(c => (
                  <tr key={c.id} className={s.linha} onClick={() => nav(`/yt/lives/${c.id}`)}>
                    <td><div className={s.nome}>{nomeLive(c.titulo)}</div><div className={s.sub}>{c.canal}</div></td>
                    <td style={{ whiteSpace: "nowrap" }}>{ha(c.desde)}</td>
                    <td className={s.n}>—</td>
                    <td className={s.n}>—</td>
                    <td className={s.n}>{n(c.ultima_hora)} un.</td>
                    <td style={{ textAlign: "right" }}><Link to={`/yt/lives/${c.id}`} onClick={e => e.stopPropagation()}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {semOuvir.length > 0 && (
        <section className={s.cartao}>
          <div className={s.cab}>
            <span className={`${s.st} ${s.cinza}`}>NO AR, SEM OUVIR</span>
            <h2>{semOuvir.length} {semOuvir.length === 1 ? "live" : "lives"}</h2>
          </div>
          <div className={s.rolar}>
            <table className={s.tabela}>
              <thead><tr><th>Live</th><th>No ar</th><th /></tr></thead>
              <tbody>
                {semOuvir.map(a => (
                  <tr key={a.id} className={`${s.linha} ${s.apagado}`} onClick={() => nav(`/yt/lives/${a.id}`)}>
                    <td><div className={s.nome}>{nomeLive(a.titulo)}</div><div className={s.sub}>{a.canal}</div></td>
                    <td style={{ whiteSpace: "nowrap" }}>{ha(a.inicio || a.detectada_em)}</td>
                    <td style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}><BotaoColetar l={a} mudou={agenda.recarregar} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {porLink && <LinkModal fechar={() => setPorLink(false)} marcada={id => { setPorLink(false); nav(`/yt/lives/${id}`); }} />}
    </div>
  );
}
