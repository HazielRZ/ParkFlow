"""Pruebas unitarias del ConnectionManager segmentado por campus y zona (INT-COM-01 / RNF-01)."""

import asyncio
import time
from typing import List, Optional

from src.models.campus import campus_de_zona
from src.websocket.gateway import CODIGO_CIERRE_CLIENTE_LENTO, ConnectionManager

CAMPUS = ("ITM-CAMPUS1", "ITM-CAMPUS2")
NORTE = "ITM-CAMPUS1-EST-NORTE"
SUR = "ITM-CAMPUS1-EST-SUR"
CENTRAL = "ITM-CAMPUS2-EST-CENTRAL"


class SocketFalso:
    """Doble de `WebSocket`: guarda lo que recibe y puede simular un cliente lento o caído."""

    def __init__(self, retraso_s: float = 0.0, falla: bool = False) -> None:
        self.mensajes: List[dict] = []
        self.cerrado_con: Optional[int] = None
        self._retraso_s = retraso_s
        self._falla = falla

    async def accept(self) -> None:
        return None

    async def send_json(self, message: dict) -> None:
        if self._falla:
            raise RuntimeError("conexión caída")
        if self._retraso_s:
            await asyncio.sleep(self._retraso_s)
        self.mensajes.append(message)

    async def close(self, code: int = 1000) -> None:
        self.cerrado_con = code


def _evento(parking_lot_id: Optional[str]) -> dict:
    evento = {"event": "parking_state_updated"}
    if parking_lot_id is not None:
        evento["parking_lot_id"] = parking_lot_id
    return evento


def test_evento_llega_al_global_a_su_campus_y_a_su_zona_pero_no_a_otros() -> None:
    clientes = {
        "global": SocketFalso(),
        "campus1": SocketFalso(),
        "campus2": SocketFalso(),
        "zona_norte": SocketFalso(),
        "zona_sur": SocketFalso(),
    }

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS)
        await manager.connect(clientes["global"])
        await manager.connect(clientes["campus1"], campus="ITM-CAMPUS1")
        await manager.connect(clientes["campus2"], campus="ITM-CAMPUS2")
        await manager.connect(clientes["zona_norte"], zona=NORTE)
        await manager.connect(clientes["zona_sur"], zona=SUR)
        await manager.broadcast_state_update(_evento(NORTE))

    asyncio.run(escenario())

    recibieron = {nombre for nombre, socket in clientes.items() if socket.mensajes}
    assert recibieron == {"global", "campus1", "zona_norte"}


def test_zona_de_un_campus_desconocido_solo_llega_al_global_y_a_esa_zona() -> None:
    global_, campus1, zona = SocketFalso(), SocketFalso(), SocketFalso()

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS)
        await manager.connect(global_)
        await manager.connect(campus1, campus="ITM-CAMPUS1")
        await manager.connect(zona, zona="OTRO-LOTE")
        await manager.broadcast_state_update(_evento("OTRO-LOTE"))

    asyncio.run(escenario())

    assert (len(global_.mensajes), len(campus1.mensajes), len(zona.mensajes)) == (1, 0, 1)


def test_evento_sin_parking_lot_id_solo_llega_al_canal_global() -> None:
    global_, campus1 = SocketFalso(), SocketFalso()

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS)
        await manager.connect(global_)
        await manager.connect(campus1, campus="ITM-CAMPUS1")
        await manager.broadcast_state_update(_evento(None))

    asyncio.run(escenario())

    assert (len(global_.mensajes), len(campus1.mensajes)) == (1, 0)


def test_cliente_lento_no_retrasa_a_los_demas_y_se_le_cierra_la_conexion() -> None:
    rapidos = [SocketFalso() for _ in range(5)]
    lento = SocketFalso(retraso_s=10)
    resultado = {}

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS, timeout_envio_s=0.2)
        for socket in [*rapidos, lento]:
            await manager.connect(socket, campus="ITM-CAMPUS1")
        inicio = time.perf_counter()
        await manager.broadcast_state_update(_evento(NORTE))
        resultado["duracion_s"] = time.perf_counter() - inicio
        resultado["conexiones"] = manager.total_conexiones()

    asyncio.run(escenario())

    assert all(len(socket.mensajes) == 1 for socket in rapidos)
    assert lento.mensajes == []
    assert lento.cerrado_con == CODIGO_CIERRE_CLIENTE_LENTO
    assert resultado["conexiones"] == 5
    # Sin envío en paralelo esto tardaría 10 s; con tiempo límite tarda ~0.2 s.
    assert resultado["duracion_s"] < 1.0


def test_cliente_caido_se_elimina_y_los_demas_reciben() -> None:
    sano, caido = SocketFalso(), SocketFalso(falla=True)
    resultado = {}

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS)
        await manager.connect(sano, zona=NORTE)
        await manager.connect(caido, zona=NORTE)
        await manager.broadcast_state_update(_evento(NORTE))
        resultado["conexiones"] = manager.total_conexiones()

    asyncio.run(escenario())

    assert len(sano.mensajes) == 1
    assert caido.cerrado_con == CODIGO_CIERRE_CLIENTE_LENTO
    assert resultado["conexiones"] == 1


def test_disconnect_quita_la_conexion_y_limpia_canales_vacios() -> None:
    socket = SocketFalso()
    resultado = {}

    async def escenario() -> None:
        manager = ConnectionManager(campus_conocidos=CAMPUS)
        await manager.connect(socket, campus="ITM-CAMPUS2")
        manager.disconnect(socket)
        resultado["conexiones"] = manager.total_conexiones()
        await manager.broadcast_state_update(_evento(CENTRAL))

    asyncio.run(escenario())

    assert resultado["conexiones"] == 0
    assert socket.mensajes == []


def test_campus_de_zona_no_confunde_campus_con_prefijo_parecido() -> None:
    campus = ("ITM-CAMPUS1", "ITM-CAMPUS10")

    assert campus_de_zona("ITM-CAMPUS1-EST-NORTE", campus) == "ITM-CAMPUS1"
    assert campus_de_zona("ITM-CAMPUS10-EST-NORTE", campus) == "ITM-CAMPUS10"
    assert campus_de_zona("ITM-CAMPUS1", campus) is None
    assert campus_de_zona("OTRO-LOTE", campus) is None
