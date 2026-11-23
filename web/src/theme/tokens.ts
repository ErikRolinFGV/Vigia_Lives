// Tokens dos dois temas, portados de temaVars() do protótipo (paleta "1a · quente").
// Viram variáveis CSS no <html>: trocar o tema troca as variáveis e nenhuma tela
// precisa saber qual tema está ativo.

export type Tema = "claro" | "escuro";

type Tokens = Record<string, string>;

// Lively (v2): neutros de programa de escritório e o azul da marca nos botões.
const neutros: Record<Tema, Tokens> = {
  claro: {
    bg: "#F5F5F5", surface: "#FFFFFF", s2: "#FAFAFA", s3: "#F3F3F3", modal: "#FFFFFF",
    ink: "#242424", ink2: "#424242", ink3: "#616161", ink4: "#707070",
    line: "#E0E0E0", line2: "#D1D1D1", lineH: "#A6A6A6", lineDash: "#D1D1D1",
    div: "#EDEDED", track: "#EDEDED", modalLine: "#E0E0E0", grid: "#E6E6E6",
    overlay: "rgba(0,0,0,.32)", accentH: "#2B3BAA",
    marca: "#3347C9", marcaT: "#EBEEFA", marcaInk: "#1F2C8F", latao: "#C08A1C",
  },
  escuro: {
    bg: "#1F1F1F", surface: "#292929", s2: "#2E2E2E", s3: "#333333", modal: "#292929",
    ink: "#FFFFFF", ink2: "#D6D6D6", ink3: "#ADADAD", ink4: "#8F8F8F",
    line: "#3D3D3D", line2: "#474747", lineH: "#666666", lineDash: "#474747",
    div: "#333333", track: "#3D3D3D", modalLine: "#474747", grid: "#3D3D3D",
    overlay: "rgba(0,0,0,.6)", accentH: "#4B5DD6",
    marca: "#3347C9", marcaT: "rgba(140,155,245,.16)", marcaInk: "#B9C2F8", latao: "#F0B54A",
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
    accent: "#3347C9",
    onAccent: "#FFFFFF",
    cardShadow: tema === "escuro" ? "0 1px 2px rgba(0,0,0,.4)" : "0 1px 2px rgba(0,0,0,.06)",
    hoverShadow: tema === "escuro" ? "0 2px 8px rgba(0,0,0,.5)" : "0 2px 8px rgba(0,0,0,.10)",
  };
}

export function aplicarTema(tema: Tema) {
  const st = document.documentElement.style;
  const t = tokens(tema);
  for (const k of Object.keys(t)) st.setProperty("--" + k, t[k]);
  st.colorScheme = tema === "escuro" ? "dark" : "light";
  document.documentElement.dataset.tema = tema;
}
