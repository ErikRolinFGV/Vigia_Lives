import { useCallback, useEffect, useState } from "react";

export class ErroApi extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
  const r = await fetch("/api" + caminho, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json", ...init?.headers }
      : init?.headers,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const j = await r.json();
      msg = j.detail || msg;
    } catch { /* corpo sem JSON */ }
    throw new ErroApi(r.status, msg);
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

type Estado<T> = { dados: T | null; erro: ErroApi | Error | null; carregando: boolean };

/** GET com estado de carregamento. `caminho` nulo não dispara a chamada. */
export function useApi<T>(caminho: string | null) {
  const [st, setSt] = useState<Estado<T>>({ dados: null, erro: null, carregando: !!caminho });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!caminho) return;
    let vivo = true;
    setSt(s => ({ ...s, carregando: true, erro: null }));
    api<T>(caminho)
      .then(d => vivo && setSt({ dados: d, erro: null, carregando: false }))
      .catch(e => vivo && setSt({ dados: null, erro: e, carregando: false }));
    return () => { vivo = false; };
  }, [caminho, versao]);

  const recarregar = useCallback(() => setVersao(v => v + 1), []);
  return { ...st, recarregar };
}
