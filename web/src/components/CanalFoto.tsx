import { useState } from "react";
import type { ChangeEvent } from "react";
import { api } from "../api/client";

// Cor de fundo das iniciais: estável por canal, tirada das cores de série.
const PALETA = ["var(--aud)", "var(--msg)", "var(--part)", "var(--ink2)"];

export function iniciais(nome: string) {
  return String(nome || "?").replace(/^@/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

export function CanalAvatar({ id, nome, foto, size = 60 }: { id: string; nome: string; foto: string | null; size?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} />;
  }
  const k = String(id).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETA.length;
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: PALETA[k], color: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Figtree, sans-serif", fontWeight: 800, fontSize: Math.round(size * 0.35), letterSpacing: "-.02em" }}>
      {iniciais(nome)}
    </span>
  );
}

/** Envia a foto escolhida e devolve a nova URL. */
export function useTrocarFoto(canalId: string, depois: () => void) {
  const [erro, setErro] = useState("");
  const onFoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const fd = new FormData();
    fd.append("arquivo", f);
    try {
      await api(`/canais/${canalId}/foto`, { method: "PUT", body: fd });
      setErro("");
      depois();
    } catch (err) {
      setErro((err as Error).message);
    }
  };
  return { onFoto, erro };
}
