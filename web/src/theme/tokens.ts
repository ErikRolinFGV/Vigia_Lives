// Tokens dos dois temas, portados de temaVars() do protótipo (paleta "1a · quente").
// Viram variáveis CSS no <html>: trocar o tema troca as variáveis e nenhuma tela
// precisa saber qual tema está ativo.

export type Tema = "claro" | "escuro";

type Tokens = Record<string, string>;

const neutros: Record<Tema, Tokens> = {
  claro: {
    bg: "#EFEBE1", surface: "#FFFFFF", s2: "#FBFAF8", s3: "#F4F2EE", modal: "#FBF9F4",
    ink: "#17140F", ink2: "#4E4A42", ink3: "#6C6559", ink4: "#8F887C",
    line: "#E6E2DB", line2: "#DDD8CF", lineH: "#C9C2B6", lineDash: "#D8D3C9",
    div: "#F0EDE7", track: "#EFECE5", modalLine: "#DFD9CC", grid: "#DCD6C8",
    overlay: "rgba(23,20,15,.36)", accentH: "#2E2A24",
  },
  escuro: {
    bg: "#14120F", surface: "#1D1B17", s2: "#221F1B", s3: "#2A2722", modal: "#1D1B17",
    ink: "#F2EEE7", ink2: "#CDC6BA", ink3: "#A39C90", ink4: "#7E776C",
    line: "#302C27", line2: "#3B3731", lineH: "#59524A", lineDash: "#403B35",
    div: "#28251F", track: "#2E2A25", modalLine: "#3B3731", grid: "#2F2B26",
    overlay: "rgba(0,0,0,.55)", accentH: "#D9D3C8",
  },
};

const semanticos: Record<Tema, Tokens> = {
  claro: {
    red: "#DC2A25", redInk: "#B8221D", redT: "#FDF2F1", redLine: "#F3C9C7", redSoft: "#E8A9A6",
    ok: "#1F9D55", okInk: "#146B3A", okT: "#EAF6EE", okLine: "#B9DFC6",
    aud: "#2563C7", audT: "#F5F9FE", audLine: "#D9E5F5",
    msg: "#C6541A", msgT: "#FDF7F2", msgLine: "#F0E0D0", msgMid: "#E0B08A", msgSoft: "#F3DCC8",
    part: "#167A4E", partT: "#F4FAF6", partLine: "#D7E9DE", partMid: "#9CCDB2",
    rose: "#FDF3F2", roseLine: "#F2D6D4", dosT: "#FBF6EC", dosLine: "#E8DCC4",
    ambT: "#FDF4E7", ambLine: "#F0D9AE", ambInk: "#8A5A11", amb: "#D4930F",
  },
  escuro: {
    red: "#F0564F", redInk: "#FF8E88", redT: "rgba(240,86,79,.12)", redLine: "rgba(240,86,79,.34)", redSoft: "#8A4542",
    ok: "#3CC57A", okInk: "#74D9A0", okT: "rgba(60,197,122,.12)", okLine: "rgba(60,197,122,.32)",
    aud: "#7AA9F4", audT: "rgba(122,169,244,.07)", audLine: "rgba(122,169,244,.22)",
    msg: "#F0915C", msgT: "rgba(240,145,92,.07)", msgLine: "rgba(240,145,92,.22)", msgMid: "#8E5A3C", msgSoft: "rgba(240,145,92,.2)",
    part: "#5FCB97", partT: "rgba(95,203,151,.07)", partLine: "rgba(95,203,151,.22)", partMid: "#3E7F60",
    rose: "rgba(240,86,79,.06)", roseLine: "rgba(240,86,79,.2)", dosT: "rgba(232,190,120,.06)", dosLine: "rgba(232,190,120,.22)",
    ambT: "rgba(232,170,60,.12)", ambLine: "rgba(232,170,60,.32)", ambInk: "#E9B865", amb: "#E9B865",
  },
};

export function tokens(tema: Tema): Tokens {
  const n = neutros[tema];
  return {
    ...n,
    ...semanticos[tema],
    accent: n.ink,
    onAccent: tema === "escuro" ? n.bg : "#FFFFFF",
    cardShadow: tema === "escuro" ? "0 24px 64px rgba(0,0,0,.45)" : "0 18px 48px rgba(23,20,15,.10)",
    hoverShadow: tema === "escuro" ? "0 18px 40px rgba(0,0,0,.5)" : "0 12px 30px rgba(23,20,15,.12)",
  };
}

export function aplicarTema(tema: Tema) {
  const st = document.documentElement.style;
  const t = tokens(tema);
  for (const k of Object.keys(t)) st.setProperty("--" + k, t[k]);
  st.colorScheme = tema === "escuro" ? "dark" : "light";
  document.documentElement.dataset.tema = tema;
}
