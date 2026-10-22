// O que liga uma transmissão a outras: o link (vídeo no YouTube) de onde ela
// vem, os outros trechos do mesmo link (o canal trocou o título no meio) e o
// mesmo conteúdo em outro link.
import type React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { LiveDetalhe } from "../api/types";
import { apelido, hora, nomeLink, nomeLive } from "../lib/format";
import { useSessao } from "../state/sessao";
import { Erro } from "./basicos";
import { Modal, btnAcao, btnCancelar } from "./Modal";

const pilula = {
  fontSize: 12.5, fontWeight: 600, color: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: 99,
  padding: "4px 11px", background: "var(--s3)", textDecoration: "none", whiteSpace: "nowrap" as const,
};

/** Abre a live (no minuto do trecho, se for um) em outra aba. */
export function BotaoYouTube({ url }: { url: string }) {
  return <a href={url} target="_blank" rel="noopener noreferrer" style={pilula} title="Abre o vídeo no YouTube em outra aba">Assistir no YouTube ↗</a>;
}

const caixa = { background: "var(--s2)", border: "1px solid var(--line)", borderRadius: 12, padding: "13px 16px", marginBottom: 16, display: "flex", flexDirection: "column" as const, gap: 9 };

function hms(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null;
}

function relogio(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso));
}

/** Muda a hora de cada corte, volta ao automático ou desfaz a divisão. O dado bruto não muda. */
function AjustarCorte({ live, pai, fechar }: { live: LiveDetalhe; pai: string; fechar: () => void }) {
  const { conta } = useSessao();
  const nav = useNavigate();
  const atuais = live.trechos.slice(1);
  const [valores, setValores] = useState(() => atuais.map(t => relogio(t.inicio, conta.tz)));
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (cortes: number[] | null, destino: string) => {
    setEnviando(true);
    setErro("");
    try {
      await api(`/lives/${pai}/divisao`, { method: "PUT", body: JSON.stringify({ cortes }) });
      fechar();
      nav(destino);
      window.location.reload();
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  };

  const salvar = () => {
    // o novo corte = corte atual + diferença entre o relógio digitado e o atual
    const cortes: number[] = [];
    for (let i = 0; i < atuais.length; i++) {
      const novo = hms(valores[i]), velho = hms(relogio(atuais[i].inicio, conta.tz));
      if (novo == null || velho == null) { setErro(`Hora inválida: "${valores[i]}". Use HH:MM ou HH:MM:SS.`); return; }
      cortes.push(atuais[i].trecho!.ini + (novo - velho));
    }
    enviar(cortes, `/yt/lives/${live.id}`);
  };

  return (
    <Modal fechar={fechar} largura={480}>
      <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", marginBottom: 4 }}>Ajustar o corte</div>
      <div style={{ fontSize: 13.5, color: "var(--ink3)", marginBottom: 16, textWrap: "pretty" }}>
        O corte foi sugerido na troca de título. Se o jogo acabou antes ou depois, mude a hora. Só a janela de cada trecho muda; nenhum dado é apagado.
      </div>
      {atuais.map((t, i) => (
        <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 14 }}>
          <span style={{ flex: 1, minWidth: 0, color: "var(--ink2)" }}>Começo de “{apelido(t.titulo, 34)}”</span>
          <input value={valores[i]} onChange={e => setValores(v => v.map((x, j) => (j === i ? e.target.value : x)))}
            className="mono" style={{ width: 104, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--surface)", color: "var(--ink)" }} />
        </label>
      ))}
      {erro && <div style={{ margin: "6px 0 10px" }}><Erro texto={erro} /></div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" style={btnCancelar} disabled={enviando} onClick={() => enviar([], `/yt/lives/${pai}`)} title="Volta a ser uma transmissão só">Não dividir</button>
        <button type="button" style={btnCancelar} disabled={enviando} onClick={() => enviar(null, `/yt/lives/${live.id}`)} title="Corte na troca de título">Automático</button>
        <span style={{ flex: 1 }} />
        <button type="button" style={btnCancelar} onClick={fechar}>Cancelar</button>
        <button type="button" style={btnAcao(!enviando)} disabled={enviando} onClick={salvar}>{enviando ? "Salvando…" : "Salvar"}</button>
      </div>
    </Modal>
  );
}

const COM_COLETA = ["coletada", "parcial", "no_ar"];
const SEM_COLETA = ["perdida", "nao_escolhida"];
// mesma cor = mesmo conteúdo, em qualquer link (categórica, só neste mapa)
const CORES_CONTEUDO = ["var(--aud)", "var(--msg)", "var(--part)", "var(--amb)", "var(--ink3)"];

/** Por que o outro link ficou sem coleta, em palavras. */
function motivo(fora: LiveDetalhe["mesmo_jogo"]) {
  const perdida = fora.some(m => m.estado === "perdida"), nao = fora.some(m => m.estado === "nao_escolhida");
  if (perdida && nao) return "um estava marcado e não foi coletado, outro não estava marcado";
  return perdida ? "estava marcado, mas o vigia não percebeu quando entrou no ar" : "não estava marcado para coletar";
}

/**
 * O que o mesmo conteúdo em outro link muda nos números desta página: nada
 * em dobro quando os dois foram coletados; o chat do outro link de fora
 * quando ele não foi.
 */
function mesmoConteudo(live: LiveDetalhe): { alerta: boolean; texto: React.ReactNode } | null {
  if (!live.mesmo_jogo.length) return null;
  const esta = COM_COLETA.includes(live.estado ?? "");
  const fora = live.mesmo_jogo.filter(m => SEM_COLETA.includes(m.estado));
  const outras = live.mesmo_jogo.filter(m => COM_COLETA.includes(m.estado));
  const nomes = (lista: LiveDetalhe["mesmo_jogo"]) => lista.map(m => nomeLink(m.link?.comecou_como ?? m.titulo, 34)).join(", ");
  if (esta && fora.length) return {
    alerta: true,
    texto: <>
      <b style={{ color: "var(--ambInk)" }}>Parte do público pode estar fora destes números.</b>{" "}
      O mesmo conteúdo passou, ao mesmo tempo, {fora.length === 1 ? "no link" : "nos links"} {nomes(fora)}, que não foi coletado ({motivo(fora)}).
      Cada link tem a própria audiência e o próprio chat: quem assistiu e escreveu por lá não entra nesta página.
      Costuma ser a parte menor, porque o público tende a ficar no link onde já estava, mas o que não foi coletado não dá para medir.
    </>,
  };
  const privadas = live.mesmo_jogo.filter(m => m.estado === "privada");
  if (privadas.length && !fora.length) return {
    alerta: false,
    texto: <>O mesmo conteúdo também passou {privadas.length === 1 ? "no link" : "nos links"} {nomes(privadas)}, mas privado: só o canal via. Sem público por lá, não havia chat para coletar, e nada ficou de fora destes números.</>,
  };
  if (!esta && outras.length) return {
    alerta: false,
    texto: <>Este link não foi coletado, mas o mesmo conteúdo foi coletado, ao mesmo tempo, {outras.length === 1 ? "no link" : "nos links"} {nomes(outras)}. Os dados da transmissão estão lá; só o chat deste link ficou de fora.</>,
  };
  return {
    alerta: false,
    texto: <>O mesmo conteúdo também passou {live.mesmo_jogo.length === 1 ? "no link" : "nos links"} {nomes(live.mesmo_jogo)}. São vídeos diferentes, cada um com o próprio coletor: nada foi coletado em dobro, e os números de cada link são só dele.</>,
  };
}

const ms = (iso: string | null | undefined, padrao: number) => (iso ? new Date(iso).getTime() : padrao);

/**
 * De onde vem esta transmissão. O canal pode reaproveitar um link (trocar o
 * título e passar outra coisa no mesmo vídeo) e pode passar o mesmo conteúdo
 * em dois links ao mesmo tempo. A página diz em palavras qual link é este e
 * como ele começou, e desenha os links em volta numa linha do tempo: uma faixa
 * por link, um bloco por trecho, a mesma cor para o mesmo conteúdo.
 */
export function ContextoLinks({ live }: { live: LiveDetalhe }) {
  const { conta } = useSessao();
  const [ajustar, setAjustar] = useState(false);
  const tz = conta.tz;
  const links = live.links ?? [];
  const varios = live.trechos.length > 1;
  if (!links.length || (!varios && links.length < 2)) return null;
  const proprio = links[0];
  const pai = proprio.video_id;
  const inteiro = varios && !live.trecho;
  const meu = proprio.trechos.find(t => t.id === live.id);
  const mc = mesmoConteudo(live);

  const nomeProprio = <b>{nomeLink(proprio.comecou_como)}</b>;
  const abriu = hora(proprio.inicio, tz);
  let frase: React.ReactNode;
  if (live.trecho && meu) {
    const n = live.trecho.n;
    frase = n === 1
      ? <>Esta página é o <b>1º trecho</b> do link {nomeProprio}, aberto às {abriu}. Vai até as {hora(meu.fim, tz)}, quando o canal trocou o título e passou a transmitir outra coisa no mesmo link.</>
      : <>Esta página é o <b>{n}º trecho</b> do link que começou como {nomeProprio} às {abriu}. Às {hora(meu.inicio, tz)} o canal trocou o título desse link e passou a transmitir {nomeLink(meu.titulo)}; os números desta página contam só daí{meu.fim ? ` até as ${hora(meu.fim, tz)}` : " em diante"}.</>;
  } else if (inteiro) {
    frase = <>Esta página é o <b>link inteiro</b>, que começou como {nomeProprio} às {abriu} e carregou {live.trechos.length} transmissões. Cada trecho tem dados e relatório próprios.</>;
  } else {
    frase = <>Esta página é o link {nomeProprio}, aberto às {abriu}, com uma transmissão só.</>;
  }

  // cores por conteúdo, na ordem em que aparecem
  const cor = new Map<string, string>();
  for (const l of links) for (const t of l.trechos) {
    const k = t.nucleo || t.id;
    if (!cor.has(k)) cor.set(k, CORES_CONTEUDO[cor.size % CORES_CONTEUDO.length]);
  }
  const agora = Date.now();
  const todos = links.flatMap(l => l.trechos);
  const t0 = Math.min(...todos.map(t => ms(t.inicio, agora)));
  const t1 = Math.max(...todos.map(t => ms(t.fim, agora)));
  const span = Math.max(t1 - t0, 60_000);
  const x = (v: number) => ((v - t0) / span) * 100;
  const passo = (span > 10 * 3600e3 ? 3 : span > 5 * 3600e3 ? 2 : 1) * 3600e3;
  const marcas: number[] = [];
  for (let t = Math.ceil(t0 / passo) * passo; t <= t1; t += passo) marcas.push(t);

  const rotulo = { flex: "1 1 200px", maxWidth: 260, minWidth: 0 };
  const faixa = { flex: "1 1 240px", minWidth: 0, position: "relative" as const };

  return (
    <div style={caixa}>
      <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty" }}>{frase}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {links.map(l => {
          const este = l.video_id === pai;
          return (
            <div key={l.video_id} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={rotulo}>
                <div style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700, color: este ? "var(--ink2)" : "var(--ink4)" }}>
                  {este ? "este link" : "outro link"} <span className="mono" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {l.video_id}</span>
                </div>
                <div title={l.comecou_como ?? ""} style={{ fontSize: 13, color: este ? "var(--ink)" : "var(--ink2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  começou como {nomeLink(l.comecou_como, 34)}
                </div>
              </div>
              <div style={{ ...faixa, height: 30, background: "var(--s3)", borderRadius: 7 }}>
                {l.trechos.map(t => {
                  const a = x(ms(t.inicio, agora)), w = Math.max(x(ms(t.fim, agora)) - a, 0.8);
                  const c = cor.get(t.nucleo || t.id)!;
                  const sem = SEM_COLETA.includes(t.estado);
                  const atual = t.id === live.id || (inteiro && este);
                  const quando = `${hora(t.inicio, tz)}–${t.fim ? hora(t.fim, tz) : "agora"}`;
                  return (
                    <Link key={t.id} to={`/yt/lives/${t.id}`} aria-label={`${t.n ? `${t.n}º trecho, ` : ""}${nomeLive(t.titulo, 1)}, ${quando}${sem ? ", sem coleta" : ""}`}
                      title={`${t.n ? `${t.n}º trecho · ` : ""}${nomeLive(t.titulo, 2)} · ${quando}${sem ? " · sem coleta" : ""}`}
                      style={{ position: "absolute", left: `${a}%`, width: `${w}%`, top: 3, bottom: 3, borderRadius: 5, overflow: "hidden",
                        background: sem ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 25%, transparent) 0 5px, transparent 5px 10px)` : `color-mix(in srgb, ${c} 28%, transparent)`,
                        border: `1px ${sem ? "dashed" : "solid"} ${c}`, outline: atual ? "2px solid var(--ink)" : "none", outlineOffset: 1,
                        display: "flex", alignItems: "center", padding: "0 6px", fontSize: 11.5, fontWeight: 600, color: sem ? "var(--ink3)" : "var(--ink)",
                        textDecoration: "none", whiteSpace: "nowrap" }}>
                      {w > 9 && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.n ? `${t.n}º · ` : ""}{apelido(t.titulo, 40)}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ ...rotulo, height: 0 }} />
          <div style={{ ...faixa, height: 14 }}>
            {marcas.map(t => (
              <span key={t} className="mono tnum" style={{ position: "absolute", left: `${x(t)}%`, transform: "translateX(-50%)", fontSize: 10.5, color: "var(--ink4)" }}>{hora(new Date(t).toISOString(), tz)}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--ink4)" }}>
        mesma cor = mesmo conteúdo · tracejado = sem coleta · contorno = esta página · clique num trecho para abrir
      </div>

      {mc && (
        <div style={{ fontSize: 13.5, color: "var(--ink2)", textWrap: "pretty", ...(mc.alerta ? { borderLeft: "3px solid var(--amb)", paddingLeft: 11 } : {}) }}>{mc.texto}</div>
      )}

      {varios && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <Link to={`/yt/lives/${pai}`} style={{ ...pilula, borderStyle: "dashed", color: inteiro ? "var(--ink)" : "var(--ink3)" }}>link inteiro</Link>
          <button type="button" onClick={() => setAjustar(true)} style={{ ...pilula, cursor: "pointer", marginLeft: "auto" }}>Ajustar o corte</button>
        </div>
      )}
      {ajustar && <AjustarCorte live={live} pai={pai} fechar={() => setAjustar(false)} />}
    </div>
  );
}
