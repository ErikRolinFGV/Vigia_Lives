// Estados sem coleta: transmissão perdida e transmissão agendada.
import { useApi } from "../../api/client";
import type { LiveDetalhe, Previsao } from "../../api/types";
import { dataCurta, dataHora, duracao, ha, n, nomeLive, pct } from "../../lib/format";
import { useSaude } from "../../state/saude";
import { useSessao } from "../../state/sessao";
import st from "./live.module.css";

function Selo({ texto, bg, bd, ink, dot }: { texto: string; bg: string; bd: string; ink: string; dot?: string }) {
  return (
    <div className={st.selo} style={{ background: bg, borderColor: bd }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, animation: "pulseDot 1.4s infinite" }} />}
      <span className={st.seloTxt} style={{ color: ink }}>{texto}</span>
    </div>
  );
}

export function Perdida({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const agora = live.ao_vivo;
  const dur = live.duracao_s ?? (live.inicio ? Math.max(0, (Date.now() - new Date(live.inicio).getTime()) / 1000) : null);
  const janelas = dur ? Math.max(1, Math.round(dur / 60)) : 0;
  const janela = live.inicio
    ? `${dataHora(live.inicio, conta.tz)} → ${agora ? "agora" : dataHora(live.fim, conta.tz).slice(6)} · ${duracao(dur)}`
    : "—";

  return (
    <div className={`${st.pagina} view-in`}>
      <div className={st.estreito}>
        <div style={{ padding: "36px 0 22px" }}>
          {agora
            ? <Selo texto="NO AR SEM COLETA" bg="var(--redT)" bd="var(--redLine)" ink="var(--redInk)" dot="var(--red)" />
            : <Selo texto="LIVE PERDIDA" bg="var(--redT)" bd="var(--redLine)" ink="var(--redInk)" />}
          <h1 className={st.h1} style={{ fontSize: "clamp(24px,3vw,32px)" }}>
            {agora ? "Esta transmissão está no ar e não está sendo coletada." : "Esta transmissão aconteceu e não foi coletada."}
          </h1>
          <p style={{ margin: 0, fontSize: 16.5, color: "var(--ink2)", maxWidth: "56ch", textWrap: "pretty" }}>
            {agora
              ? "Cada minuto que passa sem coletor é chat que deixa de existir. O vigia não está de pé para subir um coletor."
              : "Não há chat, não há curva de audiência e não haverá relatório. O chat só existe enquanto a live está no ar, e essa janela fechou."}
          </p>
        </div>

        <div className={st.cartao} style={{ borderColor: "var(--redLine)", borderLeft: "3px solid var(--red)" }}>
          <div className={st.rotulo} style={{ marginBottom: 16 }}>O que se sabe</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            <div className={st.kv}><span>Canal</span><b>{live.canal.nome}</b></div>
            <div className={st.kv}><span>Transmissão</span><b style={{ textAlign: "right", maxWidth: "60%" }}>{nomeLive(live.titulo, 2)}</b></div>
            <div className={st.kv}><span>{agora ? "No ar desde" : "Janela perdida"}</span><b className={st.kvMono}>{janela}</b></div>
            <div className={st.kv}><span>Motivo</span><b>nenhum coletor estava de pé</b></div>
            <div className={st.kv}><span>Detectada em</span><b className={st.kvMono}>{dataHora(live.detectada_em, conta.tz)}, na aba de transmissões</b></div>
            <div className={st.kv}><span>Cota consumida</span><b className={st.kvMono} style={{ color: "var(--ink3)" }}>0 un. — nada foi coletado</b></div>
          </div>
        </div>

        <div className={st.cartao}>
          <div className={st.rotulo} style={{ marginBottom: 14 }}>O que não existe desta transmissão</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
            {[["Curva de audiência", "não existe"], ["Mensagens do chat", "não existem"], ["Momentos de reação", "não existem"]].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 3 }}>{k}</div>
                <div className="mono" style={{ fontSize: 14, color: "var(--ink3)" }}>{v}</div>
              </div>
            ))}
          </div>
          {janelas > 0 && (
            <>
              <div style={{ display: "flex", gap: 1.5, alignItems: "stretch", height: 30, marginTop: 16 }}>
                {Array.from({ length: janelas }, (_, i) => <div key={i} style={{ flex: 1, minWidth: 0, background: "var(--div)", borderRadius: 1.5 }} />)}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 10, textWrap: "pretty" }}>
                {agora
                  ? `As ${n(janelas)} janelas de 60 segundos desde o início, todas vazias. A faixa continua crescendo enquanto a live estiver no ar.`
                  : `As ${n(janelas)} janelas de 60 segundos que a transmissão durou, todas vazias. Nenhuma delas será preenchida depois.`}
              </div>
            </>
          )}
        </div>

        <div className={st.cartao} style={{ background: "var(--s3)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 7, textWrap: "pretty" }}>Por que esta linha continua na lista</div>
          <div style={{ fontSize: 14, color: "var(--ink2)", textWrap: "pretty" }}>
            Sumir com ela deixaria o histórico do canal parecendo completo. A falha fica à vista porque é exatamente ela que justifica manter alguém de pé — e é a pergunta que um cliente deve poder fazer.
          </div>
        </div>
      </div>
    </div>
  );
}

export function Agendada({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const { dados: p } = useApi<Previsao>(`/lives/${live.id}/previsao`);
  const dePe = !!useSaude()?.vigia.de_pe;
  const custoPct = p ? (p.custo / p.cota_dia) * 100 : 0;
  const resPct = p ? (p.reservado / p.cota_dia) * 100 : 0;
  const dia = p?.dia_cota ? dataCurta(p.dia_cota + "T12:00:00Z", "UTC").slice(0, 5) : "—";

  return (
    <div className={`${st.pagina} view-in`}>
      <div className={st.medio}>
        <div style={{ padding: "36px 0 22px" }}>
          <Selo texto="AGENDADA" bg="var(--s3)" bd="var(--line)" ink="var(--ink2)" />
          <h1 className={st.h1} style={{ fontSize: "clamp(23px,2.8vw,30px)", lineHeight: 1.18, marginBottom: 10, maxWidth: "56ch" }}>{nomeLive(live.titulo, 3)}</h1>
          <p className="mono" style={{ margin: 0, fontSize: 13, color: "var(--ink3)" }}>
            {live.canal.nome} · início previsto {dataHora(live.agendada_para, conta.tz)}
            {live.agendada_para && new Date(live.agendada_para).getTime() < Date.now() ? ` · atrasada ${ha(live.agendada_para).replace("há ", "")}` : ""}
          </p>
        </div>

        <div className={st.cartao} style={{ borderLeft: `3px solid ${dePe ? "var(--ok)" : "var(--amb)"}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: "50%", background: dePe ? "var(--okT)" : "var(--ambT)", border: `1px solid ${dePe ? "var(--okLine)" : "var(--ambLine)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: dePe ? "var(--ok)" : "var(--amb)", animation: dePe ? "pulseDot 2s infinite" : "none" }} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 16.5, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 3 }}>{dePe ? "Coletor a postos" : "Coletor não está a postos"}</div>
            <div style={{ fontSize: 14, color: "var(--ink2)", textWrap: "pretty" }}>
              {dePe
                ? "Não há nada a configurar nem a apertar. Quando a transmissão subir, um coletor entra no ar junto com ela."
                : "O vigia está parado. Se ele não estiver de pé quando a transmissão subir, ela será perdida: o chat não pode ser coletado depois."}
            </div>
          </div>
        </div>

        {p && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16, marginBottom: 16 }}>
            <div className={st.cartao} style={{ marginBottom: 0, padding: "20px 22px" }}>
              <div className={st.rotulo} style={{ marginBottom: 12 }}>Custo estimado da coleta</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 12 }}>
                <span className={st.grande}>{n(p.custo)}</span><span style={{ fontSize: 13, color: "var(--ink3)" }}>unidades</span>
              </div>
              <div className={st.trilho} style={{ marginBottom: 9 }}><div style={{ width: Math.min(100, custoPct) + "%", height: "100%", background: "var(--aud)" }} /></div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", textWrap: "pretty" }}>
                {pct(custoPct)} da cota diária, para {duracao(p.duracao_estimada_s)} estimadas de transmissão
                {p.duracao_do_canal ? " (mediana das lives anteriores do canal)." : " (sem duração de referência no histórico do canal)."}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 9, borderTop: "1px solid var(--div)", paddingTop: 11, textWrap: "pretty" }}>
                {p.unidades_hora_medida
                  ? <>A estimativa usa as <b style={{ color: "var(--ink)" }}>{n(p.unidades_hora)} un./h</b> medidas nas coletas já feitas. </>
                  : <>Ainda não há coleta medida; a estimativa usa {n(p.unidades_hora)} un./h. </>}
                Um chat mais movimentado custa mais: o consumo acompanha o volume de mensagens, não a duração.
              </div>
            </div>

            <div className={st.cartao} style={{ marginBottom: 0, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 13 }}>
              <div className={st.rotulo}>Cota reservada para {dia}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span className={st.grande}>{n(p.reservado)}</span>
                <span style={{ fontSize: 13, color: "var(--ink3)" }}>de {n(p.cota_dia)} un. · {pct(resPct)}</span>
              </div>
              <div className={st.trilho}><div style={{ width: Math.min(100, resPct) + "%", height: "100%", background: resPct > 85 ? "var(--red)" : "var(--aud)", transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} /></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--div)", paddingTop: 12 }}>
                <div className={st.kv} style={{ fontSize: 13.5 }}><span>Esta transmissão</span><b className="mono tnum" style={{ fontSize: 13 }}>~{n(p.custo)} un.</b></div>
                {p.outras.map(o => (
                  <div key={o.id} className={st.kv} style={{ fontSize: 13.5, borderTop: 0, paddingTop: 0 }}>
                    <span>{o.canal} · {dataHora(o.agendada_para, conta.tz).slice(6)}</span><b className="mono tnum" style={{ fontSize: 13 }}>~{n(o.custo)} un.</b>
                  </div>
                ))}
                <div className={st.kv} style={{ fontSize: 13.5 }}><span>Sobra no dia</span><b className="mono tnum" style={{ fontSize: 13, color: p.reservado > p.cota_dia ? "var(--redInk)" : undefined }}>{n(p.cota_dia - p.reservado)} un.</b></div>
              </div>
              <div style={{ marginTop: "auto", fontSize: 12.5, color: "var(--ink3)", textWrap: "pretty" }}>
                {p.outras.length
                  ? `A cota é de uma única chave de API, então transmissões de canais diferentes no mesmo dia dividem o mesmo teto. Há ${n(p.outras.length)} ${p.outras.length === 1 ? "outra coleta prevista" : "outras coletas previstas"} para esta data.`
                  : "Nenhuma outra coleta prevista para esta data. A cota é de uma única chave de API e vale para todos os canais vigiados."}
                {" "}O dia da cota vira à meia-noite do horário do Pacífico.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
