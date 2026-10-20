"""
Sobe o vigia solto e sai na hora (python -m collector.lancar <log>).

A API chama este intermediario em vez de subir o vigia direto: ele abre o
vigia, escreve o pid na saida e termina. Sem um pai vivo, o vigia deixa de
fazer parte da arvore de processos da API, e reiniciar ou fechar a API
(que no Windows costuma matar a arvore inteira) nao leva junto o vigia e
as coletas em andamento.
"""
import os
import subprocess
import sys


def main():
    log = sys.argv[1]
    # sem janela: o python do .venv e um lancador que abre o python de
    # verdade como filho, e com DETACHED_PROCESS esse filho ganhava uma
    # janela de console propria (fechar a janela matava o vigia).
    # CREATE_NO_WINDOW da um console escondido, herdado pelos coletores.
    # Grupo proprio: o Ctrl+C do terminal da API nao derruba o vigia.
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with open(log, "a", encoding="utf-8") as saida:
        p = subprocess.Popen(
            [sys.executable, "-m", "collector.vigia"],
            stdout=saida, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            # saida em arquivo: sem isso o Windows grava em cp1252 e um titulo
            # com emoji derruba o vigia (e os coletores, que herdam o ambiente)
            env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"},
            creationflags=flags,
            start_new_session=sys.platform != "win32",
        )
    print(p.pid, flush=True)


if __name__ == "__main__":
    main()
