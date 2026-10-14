import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessao } from "../state/sessao";
import { Erro, Logo, ThemeToggle, emailValido } from "../components/basicos";
import { LoginDeco, useLarguraJanela } from "../components/LoginDeco";
import u from "../components/ui.module.css";
import s from "./auth.module.css";

function AuthShell({ children }: { children: ReactNode }) {
  const wide = useLarguraJanela() >= 1180;
  return (
    <div className={s.tela} style={{ padding: `48px ${wide ? "33.333%" : "24px"} 48px 24px` }}>
      <LoginDeco />
      <div className={s.tema}><ThemeToggle /></div>
      <div className={s.coluna}>
        <div className={s.marca}>
          <Logo size={40} cor="#F57F5B" />
          <span style={{ fontFamily: "Figtree, sans-serif", fontWeight: 700, fontSize: 30, letterSpacing: "-.035em", color: "var(--ink)" }}>vigia</span>
        </div>
        <div className={s.card}>{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const { conta, entrar } = useSessao();
  const nav = useNavigate();
  const [email, setEmail] = useState(conta.email === "pesquisa@vigia.app" ? "" : conta.email);
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");

  // Login de demonstração: qualquer credencial bem formada entra.
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    if (senha.length < 6) return setErro("A senha tem no mínimo 6 caracteres.");
    entrar(email.trim());
    nav("/plataformas");
  };

  return (
    <AuthShell>
      <h1 className={s.titulo}>Entrar na sua conta</h1>
      <form className={s.campos} onSubmit={enviar} noValidate>
        <div className={s.campo}>
          <label className={u.label} htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="email" className={u.input} value={email}
            onChange={e => { setEmail(e.target.value); setErro(""); }} />
        </div>
        <div className={s.campo}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <label className={u.label} htmlFor="senha">Senha</label>
            <button type="button" className={s.ver} onClick={() => setVer(v => !v)}>{ver ? "ocultar" : "mostrar"}</button>
          </div>
          <input id="senha" type={ver ? "text" : "password"} autoComplete="current-password" className={u.input} value={senha}
            onChange={e => { setSenha(e.target.value); setErro(""); }} />
        </div>
        {erro && <Erro texto={erro} />}
        <button type="submit" className={u.btnPrimary} style={{ marginTop: 2 }}>Entrar</button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 }}>
          <button type="button" className={u.linkBtn} onClick={() => nav("/recuperar", { state: { email } })}>Esqueci a senha</button>
        </div>
      </form>
    </AuthShell>
  );
}

export function Recuperar() {
  const nav = useNavigate();
  const { conta } = useSessao();
  const veio = (useLocation().state as { email?: string } | null)?.email;
  const [email, setEmail] = useState(veio || (conta.email === "pesquisa@vigia.app" ? "" : conta.email));
  const [enviado, setEnviado] = useState("");
  const [erro, setErro] = useState("");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!emailValido(email)) return setErro("Informe um e-mail válido.");
    setErro("");
    setEnviado(email.trim());
  };

  return (
    <AuthShell>
      {!enviado ? (
        <form onSubmit={enviar} noValidate>
          <h1 className={s.titulo} style={{ marginBottom: 8 }}>Recuperar acesso</h1>
          <p className={s.sub}>Enviamos um link de redefinição. Ele vale por 30 minutos e só pode ser usado uma vez.</p>
          <div className={s.campo} style={{ marginBottom: 14 }}>
            <label className={u.label} htmlFor="rec">E-mail da conta</label>
            <input id="rec" type="email" className={u.input} value={email} onChange={e => { setEmail(e.target.value); setErro(""); }} />
          </div>
          {erro && <div style={{ marginBottom: 14 }}><Erro texto={erro} /></div>}
          <button type="submit" className={u.btnPrimary}>Enviar link</button>
        </form>
      ) : (
        <div style={{ animation: "riseIn .26s ease-out both" }}>
          <div className={s.okIcone}><span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--ok)" }} /></div>
          <h1 className={s.titulo} style={{ marginBottom: 8 }}>Link enviado</h1>
          <p className={s.sub} style={{ fontSize: 13.5, marginBottom: 6 }}>Se existir conta para este endereço, o link chega em alguns minutos.</p>
          <div className={s.destino}>{enviado}</div>
        </div>
      )}
      <button type="button" className={u.linkBtn} style={{ display: "block", margin: "14px auto 0" }} onClick={() => nav("/login")}>Voltar ao login</button>
    </AuthShell>
  );
}
