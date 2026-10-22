"""
Confere se esta maquina esta pronta para rodar o Vigia, antes de ligar o
vigia nela (deploy/README.md). Nao muda nada, a nao ser 1 unidade de cota
para testar a chave (pule com --sem-cota).

    python -m collector.checar
    python -m collector.checar --sem-cota

Sai com codigo 1 se alguma conferencia falhar.
"""
import argparse
import os
import shutil
import sys
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

OK, AVISO, FALHA = "ok", "aviso", "FALHA"
_falhas = 0


def linha(estado, o_que, detalhe=""):
    global _falhas
    if estado == FALHA:
        _falhas += 1
    print(f"[{estado:>5}] {o_que}" + (f": {detalhe}" if detalhe else ""))


def _env(raiz: Path) -> dict:
    """O .env lido a mao: importar o config com o .env errado poderia gerar outro PID_SALT."""
    vals = {}
    arq = raiz / ".env"
    if arq.exists():
        for l in arq.read_text(encoding="utf-8").splitlines():
            l = l.strip()
            if l and not l.startswith("#") and "=" in l:
                k, v = l.split("=", 1)
                vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def main():
    p = argparse.ArgumentParser(description="Confere se esta maquina esta pronta para o Vigia")
    p.add_argument("--sem-cota", action="store_true", help="nao testa a chave da API (economiza 1 unidade)")
    a = p.parse_args()

    v = sys.version_info
    linha(OK if v >= (3, 11) else FALHA, "Python", f"{v.major}.{v.minor}.{v.micro} (precisa de 3.11 ou mais)")

    raiz = Path(os.environ.get("LIVES_HOME") or Path(__file__).resolve().parent.parent)
    env = _env(raiz)
    if not (raiz / ".env").exists():
        linha(FALHA, ".env", f"nao existe em {raiz}. Copie o .env do computador de origem")
        return _fim()
    chave = env.get("YT_API_KEY", "")
    linha(OK if chave and chave != "cole_sua_chave_aqui" else FALHA, "YT_API_KEY no .env",
          "presente" if chave else "ausente")
    linha(OK if env.get("PID_SALT") else FALHA, "PID_SALT no .env",
          "presente (precisa ser o MESMO do computador de origem)" if env.get("PID_SALT")
          else "ausente: copie do .env original, nunca gere outro")
    if not env.get("PID_SALT"):
        return _fim()

    try:  # so agora: o .env esta completo
        from . import config, db, processo, yt
    except ImportError:
        import config, db, processo, yt  # noqa: E401

    # banco
    if not config.CAMINHO_DB.exists():
        linha(AVISO, "banco", f"{config.CAMINHO_DB} nao existe: comeca vazio. Para levar o historico, "
                              "copie com python -m collector.backup")
    else:
        con = db.conectar()
        ok = con.execute("PRAGMA quick_check").fetchone()[0]
        n_lives = con.execute("SELECT COUNT(*) FROM live").fetchone()[0]
        n_canais = con.execute("SELECT COUNT(*) FROM canal WHERE vigiado = 1 AND removido_em IS NULL").fetchone()[0]
        linha(OK if ok == "ok" else FALHA, "banco", f"{config.CAMINHO_DB} · {n_lives} lives · {n_canais} canais vigiados"
              + ("" if ok == "ok" else f" · defeito: {ok}"))
        b = con.execute("SELECT ultimo_ciclo, pid, encerrado_em FROM vigia_batimento WHERE id = 1").fetchone()
        if b and not b["encerrado_em"]:
            t = yt.parse_ts(b["ultimo_ciclo"])
            if t and (datetime.now(timezone.utc) - t).total_seconds() < 300 and processo.vivo(b["pid"]):
                linha(AVISO, "vigia", f"um vigia ja esta de pe neste banco (pid {b['pid']}). "
                                      "Dois vigias com a mesma chave coletam em dobro")
        con.close()
    livre = shutil.disk_usage(config.CAMINHO_DB.parent if config.CAMINHO_DB.parent.exists() else raiz).free / 1e9
    linha(OK if livre > 2 else AVISO, "disco livre", f"{livre:.1f} GB (o banco cresce ~10 MB por live movimentada)")

    # rede: o YouTube entrega a pagina dos canais a partir deste IP?
    try:
        req = urllib.request.Request("https://www.youtube.com/@cazetv/streams", headers={"User-Agent": yt.UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            final = r.geturl()
            relogio = parsedate_to_datetime(r.headers["Date"]) if r.headers.get("Date") else None
        if "consent." in final:
            linha(FALHA, "pagina dos canais", "o YouTube devolveu a tela de consentimento de cookies, nao a pagina. "
                                              "A agenda nao vai funcionar a partir deste IP")
        else:
            ids = yt.ids_da_pagina("@cazetv")
            linha(OK if ids else FALHA, "pagina dos canais (agenda sem cota)",
                  f"{len(ids)} videos lidos" if ids else "nenhum video na pagina: o YouTube pode estar bloqueando este IP")
            if ids:
                e = yt.estado_pela_pagina(ids[0])
                linha(OK if e else AVISO, "pagina do video", e or "sem resposta clara (privada ou bloqueio)")
        if relogio:
            dif = abs((datetime.now(timezone.utc) - relogio).total_seconds())
            linha(OK if dif < 60 else FALHA, "relogio", f"{dif:.0f} s de diferenca para o YouTube"
                  + ("" if dif < 60 else ": ajuste o NTP, os horarios da coleta dependem disso"))
    except Exception as e:
        linha(FALHA, "acesso ao YouTube", str(e))

    if a.sem_cota:
        linha(AVISO, "chave da API", "nao testada (--sem-cota)")
    else:
        try:
            con = db.conectar()
            item = yt.video(con, "jNQXAC9IVRw")  # "Me at the zoo": video publico e estavel; 1 unidade
            con.commit()
            con.close()
            linha(OK if item else FALHA, "chave da API", "respondeu (1 unidade)" if item else "sem resposta")
        except Exception as e:
            linha(FALHA, "chave da API", str(e))

    dist = raiz / "web" / "dist" / "index.html"
    linha(OK if dist.exists() else AVISO, "interface construida",
          "web/dist pronto" if dist.exists() else "rode npm run build em web/ para a API servir a interface")
    return _fim()


def _fim():
    print("pronto para ligar o vigia" if not _falhas else f"{_falhas} conferencia(s) falharam: corrija antes de ligar o vigia")
    sys.exit(1 if _falhas else 0)


if __name__ == "__main__":
    main()
