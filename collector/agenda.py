"""
Agenda de lives de um canal: o que esta no ar agora e o que esta marcado
para os proximos dias.

    python collector/agenda.py --canal @CazeTV
    python collector/agenda.py --canal @CazeTV --limite 20

Le a aba /streams do canal, que nao consome cota, e confirma cada video
com videos.list (1 unidade por video). Um canal com 10 videos recentes
custa 10 unidades, ou 0,1% da cota diaria.

Serve para responder "quando eu preciso estar com o coletor rodando",
que e a pergunta pratica de todo dia: o chat ao vivo so existe durante a
transmissao e nao pode ser recuperado depois.
"""
import argparse
from datetime import datetime, timezone

try:  # instalado como pacote
    from . import config, db, yt
except ImportError:  # rodando o arquivo direto
    import config
    import db
    import yt

FUSO = "America/Sao_Paulo"


def local(iso):
    """Converte o horario UTC da API para o fuso do usuario."""
    if not iso:
        return None
    dt = yt.parse_ts(iso)
    if not dt:
        return None
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo(FUSO))
    except Exception:
        # Windows sem o pacote tzdata: cai para o offset fixo de Brasilia
        from datetime import timedelta
        return dt.astimezone(timezone(timedelta(hours=-3)))


def quando(dt):
    if not dt:
        return ""
    agora = datetime.now(dt.tzinfo)
    delta = (dt - agora).total_seconds()
    if delta < 0:
        return "ja passou"
    if delta < 3600:
        return f"em {int(delta/60)} min"
    if delta < 86400:
        return f"em {delta/3600:.0f} h"
    return f"em {int(delta/86400)} dias"


def main():
    p = argparse.ArgumentParser(description="Agenda de lives de um canal")
    p.add_argument("--canal", required=True, help="@handle, UC... ou url")
    p.add_argument("--limite", type=int, default=10,
                   help="quantos videos verificar (1 unidade cada)")
    args = p.parse_args()

    if not config.API_KEY:
        raise SystemExit("YT_API_KEY nao configurada")

    con = db.conectar()
    ids = yt.ids_da_pagina(args.canal, "streams")[:args.limite]
    if not ids:
        print("nenhuma transmissao encontrada na aba /streams desse canal")
        return

    print(f"\nverificando {len(ids)} transmissoes "
          f"({len(ids)} unidades de cota)\n")

    ao_vivo, agendadas, encerradas = [], [], []
    for vid in ids:
        item = yt.video(con, vid)
        if not item:
            continue
        snip = item.get("snippet", {})
        lsd = item.get("liveStreamingDetails", {})
        if not lsd:
            continue          # video comum, nao e transmissao
        reg = {
            "id": vid,
            "titulo": snip.get("title", "")[:64],
            "agendada": lsd.get("scheduledStartTime"),
            "inicio": lsd.get("actualStartTime"),
            "fim": lsd.get("actualEndTime"),
            "espectadores": lsd.get("concurrentViewers"),
        }
        if reg["fim"]:
            encerradas.append(reg)
        elif reg["inicio"]:
            ao_vivo.append(reg)
        else:
            agendadas.append(reg)

    if ao_vivo:
        print("NO AR AGORA")
        for r in ao_vivo:
            esp = f" | {int(r['espectadores']):,}".replace(",", ".") + " assistindo" \
                  if r["espectadores"] else ""
            print(f"  {r['titulo']}{esp}")
            print(f"    python collector/collector.py --video {r['id']}\n")

    if agendadas:
        agendadas.sort(key=lambda r: r["agendada"] or "")
        print("AGENDADAS")
        for r in agendadas:
            dt = local(r["agendada"])
            when = f"{dt:%d/%m %H:%M}" if dt else "sem horario"
            print(f"  {when}  ({quando(dt)})  {r['titulo']}")
            print(f"    python collector/collector.py --video {r['id']}\n")

    if encerradas:
        print("ENCERRADAS (chat nao pode mais ser recuperado)")
        for r in encerradas[:5]:
            dt = local(r["inicio"])
            print(f"  {dt:%d/%m %H:%M}  {r['titulo']}" if dt
                  else f"  {r['titulo']}")

    if not ao_vivo and not agendadas:
        print("\nNada no ar nem agendado. Para engatar sozinho quando subir:")
        print(f"  python collector/collector.py --canal {args.canal}")

    con.close()


if __name__ == "__main__":
    main()
