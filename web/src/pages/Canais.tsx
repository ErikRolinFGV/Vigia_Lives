import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import type { Agenda, Canal, ItemAgenda, ListaCanais } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { CanalAvatar, useTrocarFoto } from "../components/CanalFoto";
import { BotaoColetar, CotaPrevista } from "../components/Coleta";
import { Filtros, grupo } from "../components/Filtro";
import type { Grupo } from "../components/Filtro";
import { PararModal, VigiarModal } from "../components/ModaisCanal";
import { dataHora, duracao, falta, ha, n, nomeLive } from "../lib/format";
import { useSaude } from "../state/saude";
import { useSessao } from "../state/sessao";
import s from "./canais.module.css";

type Status = { label: string; bg: string; border: string; ink: string; dot: string; pulso: string; texto: string; sub: string };

function statusDoCanal(c: Canal, tz: string): Status {
  const prox = c.proxima;
  const proxTxt = prox ? `${dataHora(prox.agendada_para, tz)} · ${falta(prox.agendada_para)}` : "";
  const semProx = c.modo_coleta === "escolhidas" ? "Nenhuma live escolhida na agenda" : "Nenhuma transmissão agendada";
  if (c.estado === "no_ar" && c.no_ar && c.no_ar.estado === "nao_escolhida") {
    return {
      label: "NO AR · NÃO ESCOLHIDA", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)", dot: "var(--ink4)", pulso: "none",
      texto: `${nomeLive(c.no_ar.titulo, 1)} está no ar`,
      sub: `não escolhida para coleta · abra a live para coletar agora`,
    };
  }
  if (c.estado === "no_ar" && c.no_ar && c.no_ar.estado !== "no_ar") {
    return {
      label: "NO AR SEM COLETA", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", dot: "var(--red)", pulso: "pulseDot 1.4s infinite",
      texto: `${nomeLive(c.no_ar.titulo, 1)} está sendo perdida`,
      sub: `no ar ${ha(c.no_ar.inicio)} · nenhum coletor de pé`,
    };
  }
  if (c.estado === "no_ar" && c.no_ar) {
    return {
      label: "NO AR", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", dot: "var(--red)", pulso: "pulseDot 1.4s infinite",
      texto: `Coletando ${nomeLive(c.no_ar.titulo, 1)}`,
      sub: `no ar ${ha(c.no_ar.inicio)}` + (prox ? ` · próxima em ${dataHora(prox.agendada_para, tz)}` : ""),
    };
  }
  if (c.n_coletadas === 0) {
    return {
      label: "AGUARDANDO 1ª LIVE", bg: "var(--okT)", border: "var(--okLine)", ink: "var(--okInk)", dot: "var(--ok)", pulso: "pulseDot 2.4s infinite",
      texto: prox ? `Próxima live: ${nomeLive(prox.titulo, 1)}` : c.modo_coleta === "escolhidas" ? semProx : "Vigiando a agenda do canal",
      sub: prox ? proxTxt : "a coleta começa na próxima live",
    };
  }
  return {
    label: "FORA DO AR", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)", dot: "var(--ink4)", pulso: "none",
    texto: prox ? `Próxima live: ${nomeLive(prox.titulo, 1)}` : semProx,
    sub: prox ? proxTxt : `última coleta em ${dataHora(c.ultima?.inicio, tz)}`,
  };
}

function CardCanal({ c, abrir, parar, recarregar }: { c: Canal; abrir: () => void; parar: () => void; recarregar: () => void }) {
  const { conta } = useSessao();
  const st = statusDoCanal(c, conta.tz);
  const { onFoto, erro } = useTrocarFoto(c.id, recarregar);
  return (
    <div className={s.card} role="link" tabIndex={0} onClick={abrir} onKeyDown={e => e.key === "Enter" && abrir()}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 88 }}>
        <label className={s.fotoMini} onClick={e => e.stopPropagation()} title={c.foto ? "Trocar a foto do canal" : "Adicionar a foto do canal"}>
          <CanalAvatar id={c.id} nome={c.nome} foto={c.foto} />
          <span className={s.fotoSelo}>{c.foto ? "trocar" : "foto"}</span>
          <input type="file" accept="image/*" onChange={onFoto} style={{ display: "none" }} />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.nome}>{c.nome}</div>
          <div className={s.handle}>{c.handle || c.id}</div>
          <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>{c.modo_coleta === "escolhidas" ? "coleta só as lives escolhidas" : "coleta todas as lives"}</div>
          {!c.foto && <div style={{ fontSize: 11.5, color: "var(--ink4)", marginTop: 3 }}>foto do canal não encontrada · clique para adicionar</div>}
          {erro && <div style={{ fontSize: 11.5, color: "var(--redInk)", marginTop: 3 }}>{erro}</div>}
        </div>
      </div>

      <div className={s.status} style={{ background: st.bg, borderColor: st.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: st.dot, animation: st.pulso }} />
          <span className={s.statusChip} style={{ color: st.ink }}>{st.label}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", textWrap: "pretty" }}>{st.texto}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--ink3)" }}>{st.sub}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink2)", whiteSpace: "nowrap" }}>Ver transmissões →</span>
        <button type="button" className={s.parar} onClick={e => { e.stopPropagation(); parar(); }}>Parar de vigiar</button>
      </div>
    </div>
  );
}

export function rotaLive(l: { id: string }) {
  return `/yt/lives/${l.id}`;
}

export function Canais() {
  useCrumbs([]);
  const nav = useNavigate();
  const { conta } = useSessao();
  const saude = useSaude();
  const lista = useApi<ListaCanais>("/canais");
  const agenda = useApi<Agenda>("/agenda");
  const [add, setAdd] = useState(false);
  const [parar, setParar] = useState<Canal | null>(null);
  const [tip, setTip] = useState(false);

  const limite = lista.dados?.limite_slots ?? 10;
  const emUso = lista.dados?.em_uso ?? 0;
  const fr = emUso / limite;
  const slotsTexto = `${emUso} de ${limite} slots em uso`;
  const slotsCor = fr >= 0.8 ? "var(--red)" : fr >= 0.5 ? "var(--amb)" : "var(--ok)";
  const recarregar = () => { lista.recarregar(); agenda.recarregar(); };
  const vigia = saude?.vigia.de_pe ? `coleta de pé ${ha(saude.vigia.desde)}` : "vigia parado";
  // a agenda mostra o que esta no ar e as proximas 48 h: e ali que se escolhe
  const limite48 = Date.now() + 48 * 3600 * 1000;
  const todas = agenda.dados?.proximas ?? [];
  const [filtro, setFiltro] = useState<Grupo>("todas");
  const janela = todas.filter(a => a.ao_vivo || a.estado === "no_ar" || !a.agendada_para || new Date(a.agendada_para).getTime() <= limite48);
  const proximas = filtro === "todas" ? janela : janela.filter(a => grupo(a) === filtro);
  const depois = todas.length - janela.length;

  return (
    <div className={`${s.pagina} view-in`}>
      <div className={s.conteudo}>
        <div style={{ padding: "36px 0 6px" }}>
          <h1 className={s.h1}>Canais vigiados</h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--ink2)" }}>Clique num canal para ver as transmissões coletadas.</p>
        </div>

        <div className={s.slots}>
          <h2 className={s.h2}>Em vigilância</h2>
          <span style={{ fontSize: 13.5, color: "var(--ink3)", whiteSpace: "nowrap" }}>{slotsTexto} · {vigia}</span>
          <div className={s.slotBarra} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
            <div className={s.slotTrilho}><div className={s.slotFill} style={{ width: Math.round(fr * 100) + "%", background: slotsCor }} /></div>
            {tip && (
              <div className={s.slotTip}>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Slots do plano: {slotsTexto}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 10, textWrap: "pretty" }}>Cada canal vigiado ocupa um slot. Para liberar um, use "Parar de vigiar" no card do canal.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--ink2)" }}>
                  <span className={s.legenda}><span style={{ background: "var(--ok)" }} />com folga · até 4 slots</span>
                  <span className={s.legenda}><span style={{ background: "var(--amb)" }} />metade · 5 a 7 slots</span>
                  <span className={s.legenda}><span style={{ background: "var(--red)" }} />perto do limite · 8 slots ou mais</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {lista.erro && <div className={s.erroCaixa}>Não consegui falar com a API: {lista.erro.message}. Ela está rodando? (<span className="mono">lives-api</span>)</div>}

        <div className={s.grid}>
          {lista.dados?.canais.map(c => (
            <CardCanal key={c.id} c={c} abrir={() => nav(`/yt/canais/${c.id}`)} parar={() => setParar(c)} recarregar={lista.recarregar} />
          ))}
          {lista.dados && (emUso < limite ? (
            <button type="button" className={s.addCard} onClick={() => setAdd(true)}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "var(--redT)", border: "1px solid var(--redLine)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 600, color: "var(--ink)", flex: "0 0 30px", lineHeight: 1 }}>+</span>
                <span style={{ fontFamily: "Figtree, sans-serif", fontSize: 17, fontWeight: 700, color: "var(--ink2)" }}>Abrir mais um slot</span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>Cole um @handle. A coleta começa na próxima transmissão que subir — nada é retroativo.</div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--ink4)" }}>{slotsTexto}</div>
            </button>
          ) : (
            <div className={s.cheio}>
              <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 17, fontWeight: 700, color: "var(--ink4)" }}>Todos os slots em uso</div>
              <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>O plano de pesquisa vigia até {limite} canais ao mesmo tempo. Libere um slot para acompanhar outro canal.</div>
            </div>
          ))}
        </div>

        <div className={s.paineis}>
          <div className={s.painel}>
            <div className={s.painelTopo}>
              <h2 className={s.h2}>Agenda</h2>
              <span style={{ fontSize: 13, color: "var(--ink3)" }}>o que os canais vigiados vão transmitir</span>
            </div>
            {agenda.dados && <CotaPrevista dias={agenda.dados.cota} tz={conta.tz} />}
            {janela.length > 0 && <div style={{ marginBottom: 12 }}><Filtros itens={janela} ativo={filtro} mudar={setFiltro} grupos={["todas", "coletando", "vao", "nao_escolhidas"]} /></div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {proximas.map(a => <LinhaAgenda key={a.id} a={a} tz={conta.tz} ir={() => nav(rotaLive(a))} mudou={recarregar} />)}
              {depois > 0 && <div className={s.vazioLista}>e mais {depois} {depois === 1 ? "transmissão" : "transmissões"} depois de 48 h, na página de cada canal.</div>}
              {agenda.dados && agenda.dados.proximas.length === 0 && (
                <div className={s.vazioLista}>Nenhum canal vigiado tem transmissão marcada. Estado normal: o vigia continua lendo a agenda.</div>
              )}
            </div>
          </div>
          <div className={s.painel}>
            <div className={s.painelTopo}>
              <h2 className={s.h2}>Últimas coletas</h2>
              <span style={{ fontSize: 13, color: "var(--ink3)" }}>inclusive o que foi perdido</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {agenda.dados?.recentes.map(r => <LinhaRecente key={r.id} r={r} tz={conta.tz} ir={() => nav(rotaLive(r))} />)}
              {agenda.dados && agenda.dados.recentes.length === 0 && (
                <div className={s.vazioLista}>Nenhuma transmissão coletada ainda.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {add && <VigiarModal fechar={() => setAdd(false)} adicionado={recarregar} />}
      {parar && <PararModal canal={parar} fechar={() => setParar(null)} parado={() => { setParar(null); recarregar(); }} />}
    </div>
  );
}

function LinhaAgenda({ a, tz, ir, mudou }: { a: ItemAgenda; tz: string; ir: () => void; mudou: () => void }) {
  const noAr = a.estado === "no_ar";
  const noArSem = a.ao_vivo && !noAr;
  const fora = !a.coletar && !noAr;
  // div e nao button: o botao de coletar fica dentro da linha
  return (
    <div role="link" tabIndex={0} className={s.linha} onClick={ir} onKeyDown={e => e.key === "Enter" && ir()}
      style={{ borderLeft: `3px solid ${noAr ? "var(--red)" : a.coletar ? "var(--ok)" : "var(--line2)"}` }}>
      <div style={{ width: 86, flex: "0 0 86px" }}>
        <div className="mono tnum" style={{ fontSize: 12.5, color: fora ? "var(--ink3)" : "var(--ink)" }}>{noAr || noArSem ? "agora" : dataHora(a.agendada_para, tz)}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: noAr ? "var(--redInk)" : "var(--ink2)" }}>{noAr ? "coletando" : noArSem ? "no ar" : falta(a.agendada_para)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={s.titulo1} style={{ color: fora ? "var(--ink3)" : undefined }}>{nomeLive(a.titulo)}</div>
        <div className={s.mono12}>{a.canal}</div>
      </div>
      <BotaoColetar l={a} mudou={mudou} />
      <span style={{ fontSize: 14, color: "var(--ink4)" }}>→</span>
    </div>
  );
}

function LinhaRecente({ r, tz, ir }: { r: ItemAgenda; tz: string; ir: () => void }) {
  const perdida = r.estado === "perdida";
  const chip = perdida
    ? { t: "PERDIDA", ink: "var(--redInk)", bg: "var(--redT)", bd: "var(--redLine)" }
    : r.estado === "parcial"
      ? { t: "PARCIAL", ink: "var(--ambInk)", bg: "var(--ambT)", bd: "var(--ambLine)" }
      : { t: "RELATÓRIO PRONTO", ink: "var(--okInk)", bg: "var(--okT)", bd: "var(--okLine)" };
  return (
    <button type="button" className={s.linha} onClick={ir}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={s.titulo1}>{perdida ? (r.ao_vivo ? "No ar agora, sem coleta" : "Transmissão sem coleta") : nomeLive(r.titulo)}</div>
        <div className={s.mono12}>{r.canal} · {dataHora(r.inicio || r.agendada_para, tz)}</div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 15, fontWeight: 700, color: perdida ? "var(--redInk)" : "var(--aud)" }}>
          {perdida ? (r.ao_vivo ? "no ar" : duracao(r.duracao_s)) : n(r.pico)}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink4)" }}>{perdida ? (r.ao_vivo ? "perdendo agora" : "sem dado") : "pico"}</div>
      </div>
      <span className={s.chipP} style={{ color: chip.ink, background: chip.bg, borderColor: chip.bd }}>{chip.t}</span>
    </button>
  );
}
