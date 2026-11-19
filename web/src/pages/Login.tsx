import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useSessao } from "../state/sessao";
import { Erro, Logo, ThemeToggle } from "../components/basicos";
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

// Contas são criadas por quem administra (python -m api.acessos): não há
// cadastro nem recuperação de senha pela tela.
export function Login() {
  const { entrar, logado, verificando } = useSessao();
  const nav = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!verificando && logado && !enviando) return <Navigate to="/plataformas" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !senha) return setErro("Informe o usuário e a senha.");
    setEnviando(true);
    try {
      await entrar(usuario.trim(), senha);
      nav("/plataformas");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  };

  return (
    <AuthShell>
      <h1 className={s.titulo}>Entrar na sua conta</h1>
      <form className={s.campos} onSubmit={enviar} noValidate>
        <div className={s.campo}>
          <label className={u.label} htmlFor="usuario">Usuário</label>
          <input id="usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} className={u.input} value={usuario}
            onChange={e => { setUsuario(e.target.value); setErro(""); }} />
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
        <button type="submit" className={u.btnPrimary} style={{ marginTop: 2 }} disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </AuthShell>
  );
}
