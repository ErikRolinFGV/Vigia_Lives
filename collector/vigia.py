"""
Vigia: o processo que ninguem chama e que nao pode parar.

    lives-vigia                 # roda ate Ctrl+C
    lives-vigia --ciclo 30      # segundos entre ciclos (padrao 60)

Tambem sobe e para pela interface (POST /api/operacao/vigia/ligar|desligar):
desligar grava um pedido no banco, e o vigia sai sozinho em poucos segundos.

A cada ciclo:
  1. grava o batimento (a interface so diz "coleta de pe" se ele existir)
  2. le a agenda de cada canal vigiado: a cada 5 min, ou a cada ciclo se
     uma live esta para comecar (aba /streams e de graca; a confirmacao em
     lote com videos.list custa 1 unidade)
  3. sobe um coletor para cada live no ar sem coletor (todas, ou so as
     escolhidas, conforme o modo de coleta do canal)
  4. fecha coletas cujo processo morreu, para a live nao ficar "no ar"
     para sempre na interface
  5. roda os jobs vencidos de depois da live (+1 h ... +7 d)
  6. uma vez por dia, le a playlist de uploads de cada canal (comparacao)
  7. rele as lives coladas pelo link (avulsas, de canal nao vigiado): a cada
     ciclo perto do horario, a cada 5 min no ar, a cada 30 min longe dele

Cada coletor e um processo separado (python -m collector.collector):
se um deles cair, o vigia e as outras coletas seguem.
"""
import argparse
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import config, db, processo, publico, report, vigilancia, yt
except ImportError:  # rodando o arquivo direto
    import config
    import db
    import processo
    import publico
    import report
    import vigilancia
    import yt

AGENDA_CADA = timedelta(minutes=5)
UPLOADS_CADA = timedelta(hours=24)
# Perto do horario marcado, a agenda e lida a cada ciclo: o chat comeca
# a existir quando a live sobe, nao quando o horario chega.
JANELA_QUENTE = timedelta(minutes=15)
ATRASO_MAX = timedelta(hours=2)

AVULSAS_LONGE = timedelta(minutes=30)

_parar = False
_avulsas_lidas_em = None
_coletores: dict[str, subprocess.Popen] = {}


def _sinal(sig, frame):
    global _parar
    _parar = True
    print("\n[vigia] encerrando: os coletores em andamento continuam ate o fim de cada live")


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [vigia] {msg}", flush=True)


def _agora():
    return datetime.now(timezone.utc)


def _velho(iso, idade):
    t = yt.parse_ts(iso) if iso else None
    return not t or _agora() - t > idade


def batimento(con, iniciado_em):
    con.execute(
        """INSERT INTO vigia_batimento (id, iniciado_em, ultimo_ciclo, pid) VALUES (1,?,?,?)
           ON CONFLICT(id) DO UPDATE SET iniciado_em=excluded.iniciado_em,
             ultimo_ciclo=excluded.ultimo_ciclo, pid=excluded.pid, encerrado_em=NULL""",
        (iniciado_em, db.agora(), os.getpid()))
    con.commit()


def _pedido_parar(con):
    """A interface pediu para desligar?"""
    r = con.execute("SELECT parar_pedido_em FROM vigia_batimento WHERE id = 1").fetchone()
    return bool(r and r[0])


def _esperar(con, segundos):
    """Dorme ate o proximo ciclo; Ctrl+C ou pedido da interface interrompem."""
    global _parar
    for i in range(segundos):
        if _parar:
            return
        if i % 5 == 0 and _pedido_parar(con):
            log("a interface pediu para desligar")
            _parar = True
            return
        time.sleep(1)


def _live_quente(con, canal_id):
    """
    Ha live agendada para comecar em breve (ou atrasada ha pouco) neste
    canal? Atrasada ha mais de ATRASO_MAX nao conta: live apagada ou que
    nunca subiu fica "agendada" no banco para sempre, e deixava o canal
    quente o dia inteiro (agenda relida a cada minuto, ~60 un./h a toa).
    """
    agora = _agora()
    limite = (agora + JANELA_QUENTE).isoformat(timespec="seconds")
    piso = (agora - ATRASO_MAX).isoformat(timespec="seconds")
    return con.execute(
        """SELECT 1 FROM live WHERE canal_id=? AND status='agendada'
           AND agendada_para IS NOT NULL AND agendada_para <= ? AND agendada_para >= ? LIMIT 1""",
        (canal_id, limite, piso)).fetchone() is not None


def ler_agendas(con):
    for c in con.execute("SELECT canal_id, nome, agenda_lida_em, uploads_lidos_em FROM canal "
                         "WHERE vigiado = 1 AND removido_em IS NULL").fetchall():
        if _velho(c["agenda_lida_em"], AGENDA_CADA) or _live_quente(con, c["canal_id"]):
            try:
                n = vigilancia.sincronizar_agenda(con, c["canal_id"], avisar=log)
                if n:
                    log(f"agenda de {c['nome']}: {n} transmissões")
            except yt.ErroCota:
                raise
            except Exception as e:
                log(f"agenda de {c['nome']} falhou ({e}), tento no próximo ciclo")
        if _velho(c["uploads_lidos_em"], UPLOADS_CADA):
            try:
                publico.registrar_uploads(con, c["canal_id"], max_paginas=2)
                con.execute("UPDATE canal SET uploads_lidos_em=? WHERE canal_id=?", (db.agora(), c["canal_id"]))
                con.commit()
            except yt.ErroCota:
                raise
            except Exception as e:
                log(f"uploads de {c['nome']} falharam ({e})")


def ler_avulsas(con):
    """
    Lives coladas pelo link nao tem agenda de canal que as releia. Um lote
    so para todas (1 unidade), com a mesma pressa da agenda: perto do
    horario, todo ciclo; no ar, a cada 5 min; longe, a cada 30 min.
    """
    global _avulsas_lidas_em
    agora = _agora()
    linhas = con.execute(
        "SELECT status, agendada_para FROM live WHERE avulsa = 1 AND status IN ('agendada','ao_vivo')").fetchall()
    if not linhas:
        return
    marcadas = [yt.parse_ts(l["agendada_para"]) for l in linhas if l["status"] == "agendada" and l["agendada_para"]]
    quente = any(t and agora - ATRASO_MAX <= t <= agora + JANELA_QUENTE for t in marcadas)
    cada = timedelta(0) if quente else AGENDA_CADA if any(l["status"] == "ao_vivo" for l in linhas) else AVULSAS_LONGE
    if _avulsas_lidas_em and agora - _avulsas_lidas_em < cada:
        return
    try:
        vigilancia.acompanhar_avulsas(con, avisar=log)
        _avulsas_lidas_em = agora
    except yt.ErroCota:
        raise
    except Exception as e:
        log(f"lives pelo link falharam ({e}), tento no próximo ciclo")


def subir_coletores(con):
    """Uma live no ar, de canal vigiado ou colada pelo link, sem coletor vivo: sobe um."""
    no_ar = con.execute(
        """SELECT l.video_id, l.titulo, l.coleta_inicio, l.coleta_fim, l.coletor_pid
           FROM live l JOIN canal c ON c.canal_id = l.canal_id
           WHERE l.status = 'ao_vivo'
             -- canal vigiado, ou live colada pelo link (canal nao vigiado)
             AND ((c.vigiado = 1 AND c.removido_em IS NULL) OR l.avulsa = 1)
             -- encerrada pela interface: a decisao de parar vale ate o fim da live
             AND l.parar_pedido_em IS NULL
             -- escolhida, ou o canal coleta todas e esta nao foi tirada
             AND (l.coletar = 1 OR (l.coletar IS NULL AND c.modo_coleta = 'todas'))""").fetchall()
    for l in no_ar:
        p = _coletores.get(l["video_id"])
        if p and p.poll() is None:
            continue
        # coletor subido por um vigia anterior (reiniciado no meio da live):
        # segue vivo, entao nao sobe outro para o mesmo video
        if l["coleta_inicio"] and not l["coleta_fim"] and l["coletor_pid"] and processo.vivo(l["coletor_pid"]):
            continue
        log(f"live no ar: {l['titulo']} — subindo coletor")
        _coletores[l["video_id"]] = subprocess.Popen(
            # "--video=": id que comeca com hifen ("-YJrkJd6ge8", 22/10) virava
            # outra opcao para o argparse, e o coletor morria ao subir
            [sys.executable, "-m", "collector.collector", f"--video={l['video_id']}"],
            cwd=str(config.RAIZ),
            # o coletor recebe o proprio Ctrl+C; o do vigia nao o derruba
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )


def fechar_orfas(con):
    """
    Coleta aberta (coleta_inicio sem coleta_fim) sem processo vivo: o
    coletor morreu sem fechar. Fecha na hora da ultima chamada registrada,
    que e o ultimo momento em que a coleta comprovadamente existia.
    """
    abertas = con.execute(
        "SELECT video_id, canal_id, coletor_pid FROM live WHERE coleta_inicio IS NOT NULL AND coleta_fim IS NULL").fetchall()
    for l in abertas:
        p = _coletores.get(l["video_id"])
        if p and p.poll() is None:
            continue
        if p is None and l["coletor_pid"] and processo.vivo(l["coletor_pid"]):
            continue  # coletor de um vigia anterior, ainda rodando
        ultima = con.execute("SELECT MAX(chamado_em) FROM coleta_log WHERE video_id=?", (l["video_id"],)).fetchone()[0]
        # coletor recem-subido ainda sem chamada: espera o proximo ciclo
        if p is None and not _velho(ultima, timedelta(minutes=3)):
            continue
        con.execute("UPDATE live SET coleta_fim=? WHERE video_id=?", (ultima or db.agora(), l["video_id"]))
        con.commit()
        log(f"coleta de {l['video_id']} estava aberta sem coletor: fechada em {ultima}")
        try:
            report.pos_coleta(con, l["video_id"])
        except Exception as e:
            log(f"momentos de {l['video_id']} falharam ({e})")
        _coletores.pop(l["video_id"], None)


def ciclo(con, iniciado_em):
    batimento(con, iniciado_em)
    ler_agendas(con)
    ler_avulsas(con)
    subir_coletores(con)
    fechar_orfas(con)
    n = publico.rodar_jobs(con)
    if n:
        log(f"{n} leitura(s) de depois da live feitas")


def main():
    p = argparse.ArgumentParser(description="Vigia dos canais: sobe coletores quando uma live entra no ar")
    p.add_argument("--ciclo", type=int, default=60, help="segundos entre ciclos")
    a = p.parse_args()
    if not config.API_KEY:
        sys.exit("YT_API_KEY nao configurada. Veja o README e crie o arquivo .env")
    signal.signal(signal.SIGINT, _sinal)

    con = db.conectar()
    iniciado = db.agora()
    # pedido de parada antigo nao vale para este processo
    con.execute("UPDATE vigia_batimento SET parar_pedido_em = NULL WHERE id = 1")
    con.commit()
    log(f"de pé. Ciclo de {a.ciclo}s. Ctrl+C para parar.")
    while not _parar:
        try:
            ciclo(con, iniciado)
        except yt.ErroCota as e:
            log(f"COTA ESGOTADA: {e}. Tento de novo em 15 min.")
            _esperar(con, 15 * 60)
            continue
        except Exception as e:
            log(f"ciclo falhou ({type(e).__name__}: {e}), sigo no próximo")
        _esperar(con, a.ciclo)
    # os coletores em andamento seguem ate o fim de cada live
    con.execute("UPDATE vigia_batimento SET encerrado_em = ?, parar_pedido_em = NULL WHERE id = 1", (db.agora(),))
    con.commit()
    con.close()
    log("parado")


if __name__ == "__main__":
    main()
