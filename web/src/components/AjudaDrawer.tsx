import { useEsc } from "./ContaDrawer";
import u from "./ui.module.css";
import s from "./drawers.module.css";

const PASSOS = [
  { titulo: "Cole o canal", texto: "Um @handle, uma vez só. Resolver o canal e ler a agenda não consome nada." },
  { titulo: "Veja o que será vigiado", texto: "O Vigia lê a agenda do canal e já sabe quando precisa estar pronto." },
  { titulo: "Espere", texto: "Não há botão a apertar. Pode fechar a aba: quem garante a coleta é o processo, não a sua presença." },
  { titulo: "Leia o relatório", texto: "Fica pronto quando a transmissão encerra, com uma conclusão de como ela performou." },
];

const SABERES = [
  { cor: "var(--red)", titulo: "Nada é retroativo", texto: "Vigiar hoje começa na próxima live. Nunca existirá um botão para coletar a transmissão de ontem." },
  { cor: "var(--part)", titulo: "Cobertura é a promessa", texto: "Todo relatório declara quanto da transmissão foi acompanhado, inclusive quando o número é ruim." },
  { cor: "var(--msg)", titulo: "O limite é a cota da API", texto: "Uma coleta custa cerca de 609 unidades por hora, e o dia tem 10.000. Duas lives simultâneas gastam o dobro." },
  { cor: "var(--aud)", titulo: "O valor está no que sobra", texto: "Acompanhar ao vivo convence numa demonstração. A série de várias transmissões é o que se consulta toda semana." },
];

export const ESTADOS = [
  { label: "AGENDADA", nota: "coletor a postos", bg: "var(--s3)", border: "var(--line)", ink: "var(--ink2)" },
  { label: "NO AR", nota: "coletando agora", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)" },
  { label: "COLETADA", nota: "relatório pronto", bg: "var(--okT)", border: "var(--okLine)", ink: "var(--okInk)" },
  { label: "PARCIAL", nota: "ficou um buraco", bg: "var(--ambT)", border: "var(--ambLine)", ink: "var(--ambInk)" },
  { label: "PERDIDA", nota: "ninguém coletou", bg: "var(--redT)", border: "var(--redLine)", ink: "var(--redInk)" },
];

export function AjudaDrawer({ fechar }: { fechar: () => void }) {
  useEsc(fechar);
  return (
    <div className={u.overlay} style={{ zIndex: 40, animation: "none" }} onClick={fechar}>
      <aside className={s.painelAjuda} onClick={e => e.stopPropagation()} aria-label="O que é o Vigia">
        <div className={s.ajudaTopo}>
          <div className={s.ajudaTitulo}>O que é o Vigia</div>
          <button type="button" className={u.closeBtn} onClick={fechar} aria-label="Fechar">×</button>
        </div>

        <div className={s.alerta}>
          <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 6, textWrap: "pretty" }}>
            O chat de uma live existe enquanto ela está no ar e some quando ela acaba.
          </div>
          <div style={{ fontSize: 14, color: "var(--ink2)", textWrap: "pretty" }}>
            Não existe coletar depois. Ou alguém está de pé no momento da transmissão, ou aquele dado não existe mais.
            É a diferença entre este produto e qualquer painel de estatística.
          </div>
        </div>

        <div className={u.secLabel} style={{ marginBottom: 14 }}>Como usar, em quatro passos</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {PASSOS.map((p, i) => (
            <div key={p.titulo} className={s.passo}>
              <span className={s.passoN}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{p.titulo}</div>
                <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>{p.texto}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={u.secLabel} style={{ marginBottom: 14 }}>O que você precisa saber</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
          {SABERES.map(x => (
            <div key={x.titulo} style={{ borderLeft: `2px solid ${x.cor}`, paddingLeft: 14 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 3, textWrap: "pretty" }}>{x.titulo}</div>
              <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>{x.texto}</div>
            </div>
          ))}
        </div>

        <div className={u.secLabel} style={{ marginBottom: 14 }}>Os estados de uma transmissão</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {ESTADOS.map(e => (
            <div key={e.label} className={s.estado} style={{ background: e.bg, borderColor: e.border }}>
              <div style={{ fontFamily: "Figtree, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: ".04em", color: e.ink }}>{e.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 2 }}>{e.nota}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--ink3)", textWrap: "pretty" }}>
          Perdida e parcial não são erros escondidos. Aparecem marcadas na lista do canal, porque esse buraco é exatamente o que justifica manter alguém de pé.
        </div>
      </aside>
    </div>
  );
}
