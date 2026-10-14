"""
Gera uma live sintetica no banco para testar todo o pipeline de analise
sem gastar cota e sem esperar uma transmissao acontecer.

NAO usar para apresentar resultado a cliente: e dado inventado.
Serve so para validar que agregacao, deteccao de picos e relatorio funcionam.

Uso: python seed_demo.py
"""
import random
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import db
except ImportError:  # rodando o arquivo direto
    import db

VIDEO = "DEMO_SINTETICO"
CANAL = "UCdemo000000000000000000"
DUR = 3 * 3600

FRASES = [
    "vamos time", "que golaco", "nao acredito nisso", "arbitro pessimo",
    "melhor live do ano", "alguem sabe o placar", "ta travando aqui",
    "primeira vez assistindo", "manda salve caze", "esse cara e monstro",
]


def main():
    con = db.conectar()
    inicio = datetime.now(timezone.utc) - timedelta(seconds=DUR)
    con.execute("DELETE FROM mensagem WHERE video_id=?", (VIDEO,))
    con.execute("DELETE FROM snapshot_audiencia WHERE video_id=?", (VIDEO,))
    db.upsert_canal(con, CANAL, "Canal Demo")
    db.upsert_live(
        con, VIDEO, CANAL, titulo="Live sintetica de teste",
        inicio_real=inicio.isoformat(), fim_real=(inicio + timedelta(seconds=DUR)).isoformat(),
        duracao_segundos=DUR, status="encerrada", cobertura_pct=98.4,
    )

    picos = [1200, 4500, 7800]
    autores = [f"UCfake{i:018d}" for i in range(400)]
    n = 0
    for seg in range(0, DUR, 1):
        base = 3
        for p in picos:
            if abs(seg - p) < 90:
                base += 40 * (1 - abs(seg - p) / 90)
        if random.random() > base / 60:
            continue
        canal_autor = random.choice(autores)
        pid = db.registrar_autor(
            con, canal_autor, f"user{autores.index(canal_autor)}", None, VIDEO,
            {"moderador": random.random() < 0.02, "membro": random.random() < 0.1},
        )
        doacao = random.random() < 0.004
        db.inserir_mensagem(con, {
            "msg_id": f"demo{n}", "video_id": VIDEO, "autor_pid": pid,
            "publicado_em": (inicio + timedelta(seconds=seg)).isoformat(),
            "offset_segundos": seg,
            "tipo": "superChatEvent" if doacao else "textMessageEvent",
            "texto": random.choice(FRASES) + (" 🔥" if random.random() < 0.3 else ""),
            "moeda": "BRL" if doacao else None,
            "valor_micros": random.choice([5, 10, 20, 50, 100]) * 1_000_000 if doacao else None,
            "tier": random.randint(1, 5) if doacao else None,
        })
        n += 1

    for seg in range(0, DUR, 60):
        esp = 8000 + int(3000 * random.random())
        for p in picos:
            if abs(seg - p) < 300:
                esp += 6000
        db.inserir_snapshot(con, VIDEO, seg, esp, 120000 + seg * 3, 9000)

    for i in range(50):
        con.execute(
            """INSERT INTO coleta_log (video_id, metodo, chamado_em, custo_unidades,
                                       http_status, itens_recebidos)
               VALUES (?,?,?,?,200,?)""",
            (VIDEO, "liveChatMessages.list", db.agora(), 5, random.randint(20, 300)),
        )
    con.commit()
    db.consolidar_autores(con, VIDEO)
    con.commit()
    print(f"live sintetica criada: {n} mensagens")
    print(f"agora rode: lives-report --video {VIDEO}")
    con.close()


if __name__ == "__main__":
    main()
