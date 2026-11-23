import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useSessao } from "../state/sessao";
import { Erro, ThemeToggle } from "../components/basicos";
import { LoginDeco } from "../components/LoginDeco";
import u from "../components/ui.module.css";
import s from "./auth.module.css";

// À esquerda, o painel azul com o chat ao vivo de demonstração e o slogan;
// à direita, o formulário.
function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className={s.tela2}>
      <div className={s.painelAzul}>
        <span className={s.marcaAzul}>
          <img src="/logo-azul.svg" alt="" width={62} height={34} />
          <span className={s.wordAzul}>live<span style={{ color: "#F0B54A" }}>ly</span></span>
        </span>
        <div className={s.demo}>
          <LoginDeco embutido rodape={<p className={s.slogan}>Sua live,<br />live<span style={{ color: "#F0B54A" }}>ly</span>.</p>} />
        </div>
      </div>
      <div className={s.ladoForm}>
        <div className={s.tema}><ThemeToggle /></div>
        <div className={s.colunaForm}>{children}</div>
      </div>
    </div>
  );
}

function LogoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// o que /api/auth/google/retorno manda de volta na URL
const ERROS_GOOGLE: Record<string, string> = {
  "sem-acesso": "Este e-mail do Google não tem acesso à Lively.",
  "expirado": "Este acesso não vale mais.",
  "google-falhou": "Não deu para entrar com o Google. Tente de novo.",
  "google-desligado": "A entrada com o Google não está configurada.",
};

// Contas são criadas por quem administra (python -m api.acessos): não há
// cadastro nem recuperação de senha pela tela. Com o Google configurado, ele
// vem primeiro; usuário e senha ficam logo abaixo, sempre à vista.
export function Login() {
  const { entrar, logado, verificando } = useSessao();
  const nav = useNavigate();
  const [busca] = useSearchParams();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState(ERROS_GOOGLE[busca.get("erro") ?? ""] ?? "");
  const [enviando, setEnviando] = useState(false);
  const [google, setGoogle] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ google: boolean }>("/auth/config").then(r => setGoogle(r.google)).catch(() => setGoogle(false));
  }, []);

  if (!verificando && logado && !enviando) return <Navigate to="/yt/inicio" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!usuario.trim() || !senha) return setErro("Informe o usuário e a senha.");
    setEnviando(true);
    try {
      await entrar(usuario.trim(), senha);
      nav("/yt/inicio");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar.");
      setEnviando(false);
    }
  };

  return (
    <AuthShell>
      <h1 className={s.titulo}>Entrar na sua conta</h1>
      {google && (
        <div className={s.campos} style={{ marginBottom: 18 }}>
          <a className={s.google} href="/api/auth/google"><LogoGoogle /> Continuar com o Google</a>
          <div className={s.ou}><span>ou</span></div>
        </div>
      )}
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
