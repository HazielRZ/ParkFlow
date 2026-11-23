"""Prueba de estrés de latencia de la difusión WebSocket (RNF-01 / INT-COM-01, criterio ≤ 3 s).

Levanta un servidor uvicorn real en un hilo, conecta muchos clientes WebSocket reales
repartidos por campus, zona y canal global, publica inferencias como lo haría
`/cv-service` y mide cuánto tarda cada cliente en recibir cada evento.

Para una corrida más pesada se puede subir la carga sin cambiar el código:

    PARKFLOW_STRESS_CLIENTES=1000 PARKFLOW_STRESS_EVENTOS=50 python -m pytest tests/test_latencia_websocket.py -s
"""

import asyncio
import json
import math
import os
import statistics
import threading
import time
from typing import Dict, List

import httpx
import pytest
import uvicorn
from websockets.asyncio.client import connect

from src.main import create_app

LIMITE_LATENCIA_S = 3.0
CLIENTES = int(os.getenv("PARKFLOW_STRESS_CLIENTES", "200"))
EVENTOS = int(os.getenv("PARKFLOW_STRESS_EVENTOS", "20"))
NORTE = "ITM-CAMPUS1-EST-NORTE"


@pytest.fixture(scope="module")
def servidor():
    app = create_app()
    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", ws="websockets")
    server = uvicorn.Server(config)
    hilo = threading.Thread(target=server.run, daemon=True)
    hilo.start()
    limite = time.monotonic() + 15
    while not server.started:
        if time.monotonic() > limite:
            raise RuntimeError("uvicorn no arrancó a tiempo")
        time.sleep(0.02)
    puerto = server.servers[0].sockets[0].getsockname()[1]
    yield f"127.0.0.1:{puerto}", app
    server.should_exit = True
    hilo.join(timeout=15)


def _payload(frame: int) -> dict:
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": NORTE,
        "timestamp": "2026-11-23T18:30:00Z",
        "frame_sequence": frame,
        "polygons": [
            {
                "polygon_id": "poly-n-01",
                "slot_name": "A-01",
                "state": "Ocupado" if frame % 2 else "Libre",
                "confidence": 0.9,
                "iou_ratio": 0.6 if frame % 2 else 0.05,
                "vehicle_type": "car" if frame % 2 else None,
            }
        ],
    }


async def _hora_de_llegada(conexion, frame: int) -> float:
    """Espera el evento de ese frame y regresa en qué momento llegó (`inf` si nunca llegó)."""
    limite = time.perf_counter() + 2 * LIMITE_LATENCIA_S
    while True:
        restante = limite - time.perf_counter()
        if restante <= 0:
            return math.inf
        try:
            mensaje = json.loads(await asyncio.wait_for(conexion.recv(), timeout=restante))
        except asyncio.TimeoutError:
            return math.inf
        if mensaje.get("frame_sequence") == frame:
            return time.perf_counter()


async def _medir(host: str, app) -> Dict[str, object]:
    n_campus = CLIENTES * 6 // 10
    n_zona = CLIENTES * 2 // 10
    n_global = CLIENTES // 10
    n_ajenos = CLIENTES - n_campus - n_zona - n_global

    rutas_destino = (
        [f"ws://{host}/ws/campus/ITM-CAMPUS1"] * n_campus
        + [f"ws://{host}/ws/campus/ITM-CAMPUS1/zonas/{NORTE}"] * n_zona
        + [f"ws://{host}/ws/parking-states"] * n_global
    )
    rutas_ajenas = [f"ws://{host}/ws/campus/ITM-CAMPUS2"] * n_ajenos

    destinos = await asyncio.gather(*(connect(ruta, open_timeout=20) for ruta in rutas_destino))
    ajenos = await asyncio.gather(*(connect(ruta, open_timeout=20) for ruta in rutas_ajenas))

    # Espera a que el servidor registre todas las suscripciones antes de publicar.
    manager = app.state.connection_manager
    limite = time.monotonic() + 10
    while manager.total_conexiones() < CLIENTES and time.monotonic() < limite:
        await asyncio.sleep(0.02)

    latencias: List[float] = []
    try:
        async with httpx.AsyncClient(base_url=f"http://{host}", timeout=10) as http:
            for frame in range(EVENTOS):
                receptores = [asyncio.create_task(_hora_de_llegada(c, frame)) for c in destinos]
                inicio = time.perf_counter()
                respuesta = await http.post("/api/v1/inference/states", json=_payload(frame))
                assert respuesta.status_code == 202, respuesta.text
                llegadas = await asyncio.gather(*receptores)
                latencias.extend(llegada - inicio for llegada in llegadas)

        async def recibio_algo(conexion) -> bool:
            try:
                await asyncio.wait_for(conexion.recv(), timeout=0.3)
                return True
            except asyncio.TimeoutError:
                return False

        ajenos_con_mensajes = sum(await asyncio.gather(*(recibio_algo(c) for c in ajenos)))
    finally:
        await asyncio.gather(*(c.close() for c in [*destinos, *ajenos]), return_exceptions=True)

    ordenadas = sorted(latencias)
    return {
        "entregas": len(latencias),
        "perdidas": sum(1 for latencia in latencias if math.isinf(latencia)),
        "p50": statistics.median(ordenadas),
        "p95": ordenadas[int(len(ordenadas) * 0.95) - 1],
        "maxima": ordenadas[-1],
        "ajenos_con_mensajes": ajenos_con_mensajes,
        "destinos": len(destinos),
        "ajenos": len(ajenos),
    }


def test_difusion_a_cientos_de_clientes_en_3_segundos_o_menos(servidor) -> None:
    host, app = servidor

    r = asyncio.run(_medir(host, app))

    print(
        f"\n[estrés WS] {r['destinos']} clientes destino + {r['ajenos']} de otro campus, "
        f"{EVENTOS} eventos, {r['entregas']} entregas | "
        f"p50={r['p50'] * 1000:.1f} ms  p95={r['p95'] * 1000:.1f} ms  máx={r['maxima'] * 1000:.1f} ms"
    )
    assert r["perdidas"] == 0, f"{r['perdidas']} entregas nunca llegaron"
    assert r["maxima"] <= LIMITE_LATENCIA_S, f"latencia máxima {r['maxima']:.3f} s > {LIMITE_LATENCIA_S} s"
    assert r["ajenos_con_mensajes"] == 0, "clientes de ITM-CAMPUS2 recibieron eventos de ITM-CAMPUS1"
