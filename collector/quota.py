"""
Auditoria de cota. Le coleta_log e compara consumo real com o previsto
na arquitetura v0.1. Uso: python quota.py [--dias 7]
"""
import argparse
from datetime import datetime, timedelta, timezone

try:  # instalado como pacote
    from . import db
except ImportError:  # rodando o arquivo direto
    import db

LIMITE_DIARIO = 10000


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dias", type=int, default=7)
    args = p.parse_args()
    con = db.conectar()

    corte = (datetime.now(timezone.utc) - timedelta(days=args.dias)).isoformat()
    print(f"\nConsumo por dia (ultimos {args.dias} dias)\n")
    print(f"{'dia':<12}{'chamadas':>10}{'unidades':>12}{'% cota':>10}")
    for r in con.execute(
        """SELECT substr(chamado_em,1,10) dia, COUNT(*) n, SUM(custo_unidades) u
           FROM coleta_log WHERE chamado_em >= ? GROUP BY dia ORDER BY dia""",
        (corte,),
    ):
        print(f"{r['dia']:<12}{r['n']:>10}{r['u']:>12}{100*r['u']/LIMITE_DIARIO:>9.1f}%")

    print("\nPor metodo\n")
    print(f"{'metodo':<26}{'chamadas':>10}{'unidades':>12}{'itens/chamada':>16}")
    for r in con.execute(
        """SELECT metodo, COUNT(*) n, SUM(custo_unidades) u,
                  AVG(COALESCE(itens_recebidos,0)) itens
           FROM coleta_log WHERE chamado_em >= ?
           GROUP BY metodo ORDER BY u DESC""",
        (corte,),
    ):
        print(f"{r['metodo']:<26}{r['n']:>10}{r['u']:>12}{r['itens']:>16.1f}")

    erros = con.execute(
        """SELECT http_status, COUNT(*) n FROM coleta_log
           WHERE erro IS NOT NULL AND chamado_em >= ?
           GROUP BY http_status ORDER BY n DESC""",
        (corte,),
    ).fetchall()
    if erros:
        print("\nErros\n")
        for e in erros:
            print(f"  status {e['http_status']}: {e['n']} ocorrencias")

    print("\nCusto por live\n")
    for r in con.execute(
        """SELECT c.video_id, l.titulo, l.duracao_segundos d,
                  SUM(c.custo_unidades) u, COUNT(*) n,
                  MIN(c.chamado_em) ini, MAX(c.chamado_em) fim
           FROM coleta_log c LEFT JOIN live l ON l.video_id=c.video_id
           WHERE c.video_id IS NOT NULL AND c.chamado_em >= ?
           GROUP BY c.video_id ORDER BY u DESC LIMIT 10""",
        (corte,),
    ):
        titulo = (r["titulo"] or r["video_id"])[:38]
        # Live ainda no ar nao tem duracao. A projecao honesta usa o tempo
        # que a coleta de fato durou, medido pelo proprio log.
        base = r["d"]
        origem = "live"
        if not base:
            try:
                base = (datetime.fromisoformat(r["fim"])
                        - datetime.fromisoformat(r["ini"])).total_seconds()
                origem = "coleta"
            except (TypeError, ValueError):
                base = 0
        if base and base > 60:
            proj = int(r["u"] * 10800 / base)
            pct = 100 * proj / LIMITE_DIARIO
            lives = LIMITE_DIARIO // max(1, proj)
            print(f"  {titulo:<40} {r['u']:>6} un em {int(base/60)} min "
                  f"({origem})")
            print(f"  {'':<40} projecao 3h: {proj} un = {pct:.0f}% da cota, "
                  f"cerca de {lives} live(s) de 3 h por dia")
        else:
            print(f"  {titulo:<40} {r['u']:>6} un  |  janela curta demais "
                  "para projetar")

    print("\nA janela marcada como (coleta) vai da primeira a ultima chamada do\n"
          "periodo e INCLUI o tempo em que nada rodou entre uma execucao e outra,\n"
          "entao subestima o custo de uma coleta continua. Para o numero honesto,\n"
          "use uma unica execucao longa e sem interrupcao.")
    print("\nReferencia da arquitetura v0.1: janela de 20 s prevê cerca de "
          "2.700 unidades numa live de 3 h (27% da cota).")
    con.close()


if __name__ == "__main__":
    main()
