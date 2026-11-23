import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api/client";
import type { Canal, ListaCanais } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { CanalAvatar, useTrocarFoto } from "../components/CanalFoto";
import { LinkModal, PararModal, VigiarModal } from "../components/ModaisCanal";
import { dataHora, falta, ha, nomeLive } from "../lib/format";
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
  const { conta, admin } = useSessao();
  const st = statusDoCanal(c, conta.tz);
  const { onFoto, erro } = useTrocarFoto(c.id, recarregar);
  const pode = c.pode_gerenciar;
  return (
    <div className={s.card} role="link" tabIndex={0} onClick={abrir} onKeyDown={e => e.key === "Enter" && abrir()}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 88 }}>
        {pode ? (
          <label className={s.fotoMini} onClick={e => e.stopPropagation()} title={c.foto ? "Trocar a foto do canal" : "Adicionar a foto do canal"}>
            <CanalAvatar id={c.id} nome={c.nome} foto={c.foto} />
            <span className={s.fotoSelo}>{c.foto ? "trocar" : "foto"}</span>
            <input type="file" accept="image/*" onChange={onFoto} style={{ display: "none" }} />
          </label>
        ) : <CanalAvatar id={c.id} nome={c.nome} foto={c.foto} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={s.nome}>{c.nome}</div>
          <div className={s.handle}>{c.handle || c.id}</div>
          <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>{c.modo_coleta === "escolhidas" ? "coleta só as lives escolhidas" : "coleta todas as lives"}</div>
          {/* de quem é o canal: o visitante vê o que foi compartilhado; o admin, o que cada conta adicionou */}
          {c.compartilhado && <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>compartilhado com você</div>}
          {admin && c.dono && <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 3 }}>adicionado por {c.dono}</div>}
          {!c.foto && pode && <div style={{ fontSize: 11.5, color: "var(--ink4)", marginTop: 3 }}>foto do canal não encontrada · clique para adicionar</div>}
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
        {pode && <button type="button" className={s.parar} onClick={e => { e.stopPropagation(); parar(); }}>Parar de acompanhar</button>}
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
  const saude = useSaude();
  const lista = useApi<ListaCanais>("/canais");
  const [add, setAdd] = useState(false);
  const [porLink, setPorLink] = useState(false);
  const [parar, setParar] = useState<Canal | null>(null);
  const [tip, setTip] = useState(false);

  const limite = lista.dados?.limite_slots ?? 10;
  const emUso = lista.dados?.em_uso ?? 0;
  const fr = emUso / limite;
  const slotsTexto = `${emUso} de ${limite} slots em uso`;
  const slotsCor = fr >= 0.8 ? "var(--red)" : fr >= 0.5 ? "var(--amb)" : "var(--ok)";
  const recarregar = () => { lista.recarregar(); };
  const vigia = saude?.vigia.de_pe ? `coleta de pé ${ha(saude.vigia.desde)}` : "vigia parado";
  return (
    <div className={`${s.pagina} view-in`}>
      <div className={s.conteudo}>
        <div style={{ padding: "24px 0 4px", display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <h1 className={s.h1} style={{ margin: 0 }}>Canais</h1>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="botao-claro" onClick={() => setPorLink(true)}>Ouvir live pelo link</button>
            <button type="button" className="botao-escuro" onClick={() => setAdd(true)}>+ Acompanhar canal</button>
          </div>
        </div>

        <div className={s.slots}>
          <h2 className={s.h2}>Acompanhados</h2>
          <span style={{ fontSize: 13.5, color: "var(--ink3)", whiteSpace: "nowrap" }}>{slotsTexto} · {vigia}</span>
          <div className={s.slotBarra} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
            <div className={s.slotTrilho}><div className={s.slotFill} style={{ width: Math.round(fr * 100) + "%", background: slotsCor }} /></div>
            {tip && (
              <div className={s.slotTip}>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>Slots do plano: {slotsTexto}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 10, textWrap: "pretty" }}>Cada canal vigiado ocupa um slot. Para liberar um, use "Parar de acompanhar" no card do canal.</div>
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
                <span style={{ width: 30, height: 30, borderRadius: 4, background: "var(--redT)", border: "1px solid var(--redLine)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 600, color: "var(--ink)", flex: "0 0 30px", lineHeight: 1 }}>+</span>
                <span style={{ fontFamily: "var(--fonte)", fontSize: 17, fontWeight: 700, color: "var(--ink2)" }}>Abrir mais um slot</span>
              </div>
              <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>Cole um @handle. A coleta começa na próxima transmissão que subir — nada é retroativo.</div>
              <div className="mono" style={{ fontSize: 11.5, color: "var(--ink4)" }}>{slotsTexto}</div>
            </button>
          ) : (
            <div className={s.cheio}>
              <div style={{ fontFamily: "var(--fonte)", fontSize: 17, fontWeight: 700, color: "var(--ink4)" }}>Todos os slots em uso</div>
              <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>O plano de pesquisa vigia até {limite} canais ao mesmo tempo. Libere um slot para acompanhar outro canal.</div>
            </div>
          ))}
        </div>

      </div>

      {porLink && <LinkModal fechar={() => setPorLink(false)} marcada={id => { setPorLink(false); nav(rotaLive({ id })); }} />}
      {add && <VigiarModal fechar={() => setAdd(false)} adicionado={recarregar} />}
      {parar && <PararModal canal={parar} fechar={() => setParar(null)} parado={() => { setParar(null); recarregar(); }} />}
    </div>
  );
}
