import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api/client";
import type { CanalDetalhe, LiveResumo } from "../api/types";
import { useCrumbs } from "../components/AppLayout";
import { CanalAvatar, useTrocarFoto } from "../components/CanalFoto";
import { PararModal } from "../components/ModaisCanal";
import { CHIP } from "../lib/estados";
import { apelido, dataCurta, dataHora, n, pct } from "../lib/format";
import { useSessao } from "../state/sessao";
import { rotaLive } from "./Canais";
import s from "./canais.module.css";

// Quantas transmissões entram no gráfico de picos: o canal pode ter dezenas
// de agendadas, e barra de "—" não diz nada.
const BARRAS_MAX = 8;

function Barras({ lives, pico, tz }: { lives: LiveResumo[]; pico: number | null; tz: string }) {
  const passadas = lives.filter(l => l.estado !== "agendada");
  const proximas = lives.filter(l => l.estado === "agendada").slice(0, 2);
  const mostrar = [...passadas.slice(-(BARRAS_MAX - proximas.length)), ...proximas];
  return (
    <div className={s.barras}>
      {mostrar.map(l => {
        const b = l.estado === "coletada" || l.estado === "parcial"
          ? { valor: n(l.pico), h: Math.max(14, Math.round(((l.pico || 0) / (pico || 1)) * 120)), fill: "var(--audLine)", stroke: "var(--aud)", ink: "var(--aud)", nome: apelido(l.titulo) }
          : l.estado === "perdida"
            ? { valor: "perdida", h: 8, fill: "var(--redT)", stroke: "var(--redSoft)", ink: "var(--redInk)", nome: "não coletada" }
            : l.estado === "no_ar"
              ? { valor: "no ar", h: 22, fill: "var(--redT)", stroke: "var(--red)", ink: "var(--redInk)", nome: apelido(l.titulo) }
              : { valor: "—", h: 6, fill: "var(--s3)", stroke: "var(--line2)", ink: "var(--ink4)", nome: apelido(l.titulo) };
        return (
          <div key={l.id} className={s.barraCol} title={l.titulo || ""}>
            <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 12, fontWeight: 600, color: b.ink }}>{b.valor}</div>
            <div className={s.barra} style={{ height: b.h, background: b.fill, borderColor: b.stroke }} />
            <div className={s.barraNome}>{b.nome}</div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink4)", textAlign: "center" }}>{dataHora(l.inicio || l.agendada_para, tz)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CanalPagina() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { conta } = useSessao();
  const { dados: c, erro, recarregar } = useApi<CanalDetalhe>(`/canais/${id}`);
  const [parar, setParar] = useState(false);
  const { onFoto, erro: erroFoto } = useTrocarFoto(id, recarregar);
  useCrumbs(c ? [{ label: c.nome }] : []);

  if (erro) return <div className={s.pagina}><div className={s.conteudo}><div className={s.erroCaixa}>{erro.message}</div></div></div>;
  if (!c) return <div className={s.pagina}><div className={`${s.conteudo} ${s.carregando}`}>carregando o canal…</div></div>;

  const vazio = c.lives.length === 0;
  const chip = c.estado === "no_ar"
    ? { label: "no ar agora", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)", dot: "var(--red)" }
    : { label: "fora do ar", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)", dot: "var(--ink4)" };
  const lives = [...c.lives].sort((a, b) => b.numero - a.numero);

  return (
    <div className={`${s.pagina} view-in`}>
      <div className={s.conteudo}>
        <div className={s.cabecalho}>
          <label className={s.fotoGrande} title={c.foto ? "Trocar a foto do canal" : "Adicionar a foto do canal"}>
            <CanalAvatar id={c.id} nome={c.nome} foto={c.foto} />
            <span className={s.fotoAcao}>{c.foto ? "trocar" : "adicionar"} foto</span>
            <input type="file" accept="image/*" onChange={onFoto} style={{ display: "none" }} />
          </label>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className={s.h1}>{c.nome}</h1>
            <div className="mono" style={{ fontSize: 13, color: "var(--ink3)" }}>
              {c.handle || c.id} · {c.vigiado ? `vigiado desde ${dataCurta(c.vigiado_desde, conta.tz)}` : "não vigiado"}
            </div>
            {erroFoto && <div style={{ fontSize: 12, color: "var(--redInk)", marginTop: 4 }}>{erroFoto}</div>}
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", background: chip.bg, border: `1px solid ${chip.border}`, borderRadius: 99, padding: "6px 13px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: chip.dot }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: chip.ink }}>{chip.label}</span>
            </div>
            <a className={s.botaoLinha} href={c.url} target="_blank" rel="noopener noreferrer">Abrir no YouTube <span>↗</span></a>
            {c.vigiado && <button type="button" className={`${s.botaoLinha} ${s.botaoPerigo}`} onClick={() => setParar(true)}>Parar de vigiar</button>}
          </div>
        </div>

        {vazio ? (
          <div className={s.vazioCanal}>
            <span style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--s3)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ok)", animation: "pulseDot 2s infinite" }} />
            </span>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 700, letterSpacing: "-.015em" }}>De pé, esperando a primeira transmissão</div>
            <div style={{ fontSize: 14.5, color: "var(--ink2)", maxWidth: "52ch", textWrap: "pretty" }}>
              O vigia já está acompanhando {c.handle || c.nome}. Quando uma live subir, um coletor entra no ar junto com ela e esta tela passa a listar as transmissões.
            </div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink3)", marginTop: 2 }}>nenhuma transmissão anterior será recuperada</div>
          </div>
        ) : (
          <>
            <div className={s.dois}>
              <div className={s.picos}>
                <div style={{ fontSize: 11.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink3)", marginBottom: 14 }}>Pico de audiência por transmissão</div>
                <Barras lives={c.lives} pico={c.pico} tz={conta.tz} />
              </div>
              <div className={s.resumo}>
                <div style={{ fontSize: 11.5, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink3)" }}>Resumo do canal</div>
                <div className={s.resumoGrid}>
                  <div><div className={s.kLabel}>Transmissões coletadas</div><div className={s.kValor}>{n(c.n_coletadas)}</div></div>
                  <div><div className={s.kLabel}>Cobertura média</div><div className={s.kValor} style={{ color: "var(--part)" }}>{pct(c.cobertura_media)}</div></div>
                  <div><div className={s.kLabel}>Maior pico</div><div className={s.kValor} style={{ color: "var(--aud)" }}>{n(c.pico)}</div></div>
                  <div><div className={s.kLabel}>Lives perdidas</div><div className={s.kValor} style={{ color: c.n_perdidas > 0 ? "var(--redInk)" : "var(--ink)" }}>{n(c.n_perdidas)}</div></div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "28px 0 12px", flexWrap: "wrap" }}>
              <h2 className={s.h2}>Transmissões</h2>
              <span className={s.sub}>clique numa transmissão para abrir</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lives.map(l => {
                const ch = CHIP[l.estado];
                const apagado = l.estado === "perdida" || l.estado === "agendada";
                return (
                  <button key={l.id} type="button" className={s.live} onClick={() => nav(rotaLive(l))}
                    style={{ borderColor: l.estado === "perdida" ? "var(--redLine)" : "var(--line)", borderLeftColor: ch.accent }}>
                    <div className={s.liveNum}>#{l.numero}</div>
                    <div className={s.liveData}>{dataHora(l.inicio || l.agendada_para, conta.tz)}</div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div className={s.liveTitulo} style={{ color: apagado ? "var(--ink3)" : "var(--ink)" }}>{l.titulo}</div>
                    </div>
                    <div className={s.liveChip} style={{ background: ch.bg, borderColor: ch.border }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", color: ch.ink }}>{ch.label}</span>
                    </div>
                    <div className={s.liveFim}>
                      {(l.estado === "coletada" || l.estado === "parcial") && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink4)" }}>pico</div>
                          <div className="tnum" style={{ fontFamily: "Figtree, sans-serif", fontSize: 15, fontWeight: 700, color: "var(--aud)" }}>{n(l.pico)}</div>
                        </div>
                      )}
                      <span style={{ fontSize: 15, color: "var(--redInk)" }}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {parar && <PararModal canal={c} fechar={() => setParar(false)} parado={() => nav("/yt/canais")} />}
    </div>
  );
}
