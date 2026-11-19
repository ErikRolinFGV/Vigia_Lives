import { useEffect, useState } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSessao, type Notif } from "../state/sessao";
import { usePlano } from "../state/plano";
import { Avatar } from "./basicos";
import u from "./ui.module.css";
import s from "./drawers.module.css";

const FUSOS: [string, string][] = [
  ["America/Noronha", "Fernando de Noronha (UTC−2)"],
  ["America/Sao_Paulo", "Brasília (UTC−3)"],
  ["America/Manaus", "Manaus (UTC−4)"],
  ["America/Rio_Branco", "Rio Branco (UTC−5)"],
  ["Europe/Lisbon", "Lisboa (UTC+0/+1)"],
  ["UTC", "UTC"],
];

const NOTIFS: { k: keyof Notif; label: string }[] = [
  { k: "noar", label: "Uma live de canal vigiado entrar no ar" },
  { k: "rel", label: "O relatório de uma transmissão ficar pronto" },
  { k: "perdida", label: "Uma transmissão for perdida" },
];

function lerArquivo(e: ChangeEvent<HTMLInputElement>, fim: (url: string) => void) {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => fim(String(r.result));
  r.readAsDataURL(f);
  e.target.value = "";
}

export function useEsc(fechar: () => void) {
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fechar]);
}

export function ContaDrawer({ fechar, mostrarTrocar }: { fechar: () => void; mostrarTrocar: boolean }) {
  const { conta, nomeConta, atualizar, tema, setTema, sair, acesso } = useSessao();
  const plano = usePlano();
  const nav = useNavigate();
  useEsc(fechar);

  const [editNome, setEditNome] = useState(false);
  const [nomeDraft, setNomeDraft] = useState(nomeConta);
  const [exportPedido, setExportPedido] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [excluirTxt, setExcluirTxt] = useState("");

  const salvarNome = () => { atualizar({ nome: nomeDraft.trim() || null }); setEditNome(false); };
  const onNomeKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") salvarNome();
    if (e.key === "Escape") { e.stopPropagation(); setEditNome(false); }
  };

  const orc = conta.orcid.trim();
  const orcOk = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orc);
  const orcidNota = !orc ? "Opcional. Formato 0000-0000-0000-0000." : orcOk ? "ORCID válido · orcid.org/" + orc : "Formato esperado: 0000-0000-0000-0000";
  const orcidInk = !orc ? "var(--ink3)" : orcOk ? "var(--okInk)" : "var(--redInk)";

  let tzExemplo = "";
  try {
    const f = new Intl.DateTimeFormat("pt-BR", { timeZone: conta.tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
      .format(new Date(Date.UTC(2026, 8, 8, 12, 0)));
    tzExemplo = "A live Brasil × Canadá aparece como " + f;
  } catch { /* fuso inválido */ }

  const sairDaConta = () => { fechar(); sair(); nav("/login"); };
  const podeExcluir = excluirTxt.trim() === "EXCLUIR";

  return (
    <div className={u.overlay} style={{ zIndex: 45 }} onClick={fechar}>
      <aside className={s.painelConta} onClick={e => e.stopPropagation()} aria-label="Sua conta">
        <div className={s.topo}>
          <div className={s.topoTitulo}>Sua conta</div>
          <button type="button" className={u.closeBtn} onClick={fechar} aria-label="Fechar">×</button>
        </div>

        <div className={s.corpo}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <label className={s.fotoLabel} title="Trocar foto">
              <Avatar size={64} fs={23} />
              <span className={s.fotoSelo}>foto</span>
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => lerArquivo(e, foto => atualizar({ foto }))} />
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              {!editNome ? (
                <div className={s.nomeLinha}>
                  <span className={s.nome}>{nomeConta}</span>
                  <button type="button" className={s.editar} onClick={() => { setNomeDraft(nomeConta); setEditNome(true); }}>Editar</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
                  <input className={u.inputSm} style={{ fontSize: 15 }} value={nomeDraft} autoFocus
                    onChange={e => setNomeDraft(e.target.value)} onKeyDown={onNomeKey} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className={u.btnSm} style={{ padding: "7px 13px" }} onClick={salvarNome}>Salvar</button>
                    <button type="button" className={u.btnSmGhost} style={{ padding: "7px 13px" }} onClick={() => setEditNome(false)}>Cancelar</button>
                  </div>
                </div>
              )}
              <div className={s.emailMono}>{conta.email}</div>
              {conta.foto && <button type="button" className={s.remover} onClick={() => atualizar({ foto: null })}>Remover foto</button>}
            </div>
          </div>

          <div className={s.grupo}>
            <div className={u.secLabel}>Perfil acadêmico</div>
            <div>
              <div className={s.campoLabel}>Instituição</div>
              <input className={u.inputSm} value={conta.inst} placeholder="Universidade, laboratório ou grupo"
                onChange={e => atualizar({ inst: e.target.value })} />
            </div>
            <div>
              <div className={s.campoLabel}>ORCID</div>
              <input className={u.inputSmMono} value={conta.orcid} placeholder="0000-0000-0000-0000"
                onChange={e => atualizar({ orcid: e.target.value.toUpperCase() })} />
              <div style={{ fontSize: 12, color: orcidInk, marginTop: 5 }}>{orcidNota}</div>
            </div>
            <div className={s.nota}>Aparecem no rodapé dos relatórios que você publicar.</div>
          </div>

          <div className={s.plano}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div className={u.secLabel} style={{ flex: 1 }}>Plano</div>
              <span className={s.chipOk}>ativo</span>
            </div>
            <div className={s.planoNome}>Pesquisa</div>
            <div>
              <div className={s.linhaKV} style={{ marginBottom: 7 }}>
                <span>Canais vigiados</span>
                <b className="tnum">{plano.texto}</b>
              </div>
              <div className={s.barra}>
                <div className={s.barraFill} title="Cada canal vigiado ocupa um slot do plano" style={{ width: plano.pct, background: plano.cor }} />
              </div>
            </div>
            <div className={s.sep}>
              <div className={s.linhaKV}><span>Relatório com leitura do modelo</span><b>sem limite</b></div>
              <div className={s.linhaKV}><span>Plataformas</span><b>YouTube</b></div>
            </div>
            <div className={s.sep}>
              <div className={u.secLabel} style={{ marginBottom: 2 }}>Faturamento</div>
              <div className={s.linhaKV}><span>Próxima cobrança</span><b className="tnum">13/11/2026 · R$ —</b></div>
              <div className={s.linhaKV} style={{ alignItems: "center" }}>
                <span>Pagamento</span>
                <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                  <b className="mono" style={{ fontSize: 13 }}>cartão •••• 4821</b>
                  <button type="button" className={s.acao}>Trocar</button>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {["13/10/2026", "13/09/2026"].map(d => (
                  <div key={d} className={s.fatura}>
                    <span className="mono" style={{ color: "var(--ink2)", flex: 1 }}>{d}</span>
                    <span className="tnum" style={{ color: "var(--ink2)" }}>R$ —</span>
                    <span className={s.paga}>paga</span>
                    <button type="button" className={s.acao}>PDF</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className={u.secLabel} style={{ marginBottom: 8 }}>Avisar por e-mail quando</div>
            {NOTIFS.map(n => {
              const on = conta.notif[n.k];
              return (
                <button type="button" key={n.k} className={s.notif} role="switch" aria-checked={on}
                  onClick={() => atualizar({ notif: { ...conta.notif, [n.k]: !on } })}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: "var(--ink)" }}>{n.label}</span>
                  <span className={s.trilho} style={{ background: on ? "var(--ok)" : "var(--line2)" }}>
                    <span className={s.bolinha} style={{ left: on ? 19 : 3 }} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className={s.grupo}>
            <div className={u.secLabel}>Preferências</div>
            <div>
              <div className={s.campoLabel}>Aparência</div>
              <div className={s.seg}>
                {(["claro", "escuro"] as const).map(k => {
                  const at = tema === k;
                  return (
                    <button type="button" key={k} className={s.segOpt} onClick={() => setTema(k)}
                      style={{ background: at ? "var(--surface)" : "transparent", color: at ? "var(--ink)" : "var(--ink3)", boxShadow: at ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>
                      {k === "claro" ? "Claro" : "Escuro"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className={s.campoLabel}>Fuso horário</div>
              <select className={`${u.inputSm} ${s.select}`} value={conta.tz} onChange={e => atualizar({ tz: e.target.value })}>
                {FUSOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            {tzExemplo && <div className={s.tzEx}>{tzExemplo}</div>}
          </div>

          {/* a conta é criada e trocada por quem administra (python -m api.acessos) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className={u.secLabel} style={{ marginBottom: 8 }}>Acesso</div>
            <div className={s.acesso}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: "var(--ink3)" }}>Usuário</div>
                <div className="mono" style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acesso?.usuario}</div>
              </div>
              <span style={{ fontSize: 13, color: "var(--ink2)" }}>{acesso?.papel === "admin" ? "Administrador" : "Visitante"}</span>
            </div>
            {acesso?.expira_em && (
              <div className={s.nota} style={{ marginTop: 6 }}>
                Este acesso vale até {new Date(acesso.expira_em).toLocaleString("pt-BR", { timeZone: conta.tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
              </div>
            )}
          </div>

          {acesso?.papel === "admin" && (
            <button type="button" className={s.trocar} onClick={() => { fechar(); nav("/yt/registro"); }}>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>Registro do sistema</span>
              <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>avisos e erros</span>
              <span style={{ fontSize: 15, color: "var(--ink3)" }}>→</span>
            </button>
          )}

          {mostrarTrocar && (
            <button type="button" className={s.trocar} onClick={() => { fechar(); nav("/plataformas"); }}>
              <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600 }}>Trocar de plataforma</span>
              <span style={{ fontSize: 15, color: "var(--ink3)" }}>→</span>
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className={u.secLabel}>Dados e privacidade</div>
            <div className={s.caixa}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>Exportar todos os meus dados</div>
                  <div className={s.nota}>Conta, canais vigiados, coletas e relatórios, num arquivo .zip.</div>
                </div>
                {!exportPedido && <button type="button" className={u.btnSmGhost} style={{ flex: "0 0 auto" }} onClick={() => setExportPedido(true)}>Pedir</button>}
              </div>
              {exportPedido && <div className={s.okMsg}>Pedido registrado. O link para baixar chega em {conta.email} em até 48 h.</div>}
            </div>
            <div className={s.caixaPerigo}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--redInk)" }}>Excluir conta</div>
                  <div className={s.nota}>Apaga a conta e os dados coletados. Links publicados deixam de funcionar.</div>
                </div>
                {!excluir && (
                  <button type="button" className={u.btnSmGhost} style={{ flex: "0 0 auto", color: "var(--ink)", borderColor: "var(--redLine)" }}
                    onClick={() => { setExcluir(true); setExcluirTxt(""); }}>Excluir</button>
                )}
              </div>
              {excluir && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "riseIn .2s ease-out both" }}>
                  <div style={{ fontSize: 12.5, color: "var(--ink2)" }}>Digite <b className="mono">EXCLUIR</b> para confirmar.</div>
                  <input className={u.inputSmMono} value={excluirTxt} onChange={e => setExcluirTxt(e.target.value)} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className={u.btnSm} disabled={!podeExcluir}
                      style={{ background: podeExcluir ? "var(--redInk)" : "var(--redLine)", cursor: podeExcluir ? "pointer" : "not-allowed" }}
                      onClick={() => podeExcluir && sairDaConta()}>Excluir definitivamente</button>
                    <button type="button" className={u.btnSmGhost} onClick={() => setExcluir(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.rodape}>
          <button type="button" className={s.sairConta} onClick={sairDaConta}>Sair da conta</button>
        </div>
      </aside>
    </div>
  );
}
