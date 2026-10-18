"""Processo vivo nesta maquina? Usado pelo vigia e pela API (so stdlib)."""
import os
import sys


def vivo(pid) -> bool:
    """Na duvida (sem pid, sem permissao), responde que sim."""
    if not pid:
        return True
    if sys.platform == "win32":
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, int(pid))  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        codigo = ctypes.c_ulong()
        ok = k.GetExitCodeProcess(h, ctypes.byref(codigo))
        k.CloseHandle(h)
        return not ok or codigo.value == 259  # STILL_ACTIVE
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        pass
    return True
