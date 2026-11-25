"""Gestor de conexiones WebSocket segmentado por campus y zona (INT-COM-01 / RNF-01)."""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Iterable, List, Optional, Set

from fastapi import WebSocket

from src.models.campus import campus_configurados, campus_de_zona

CANAL_GLOBAL = "global"

# 1013 = "Try Again Later": el cliente (la PWA) se reconecta con su backoff.
CODIGO_CIERRE_CLIENTE_LENTO = 1013


def canal_campus(campus: str) -> str:
    return f"campus:{campus}"


def canal_zona(parking_lot_id: str) -> str:
    return f"zona:{parking_lot_id}"


class ConnectionManager:
    """Administra suscriptores por canal y difunde cada evento solo a quien le interesa.

    Canales:
    - `global`: recibe todo (compatibilidad con `/ws/parking-states` de la PWA).
    - `campus:<campus>`: eventos de todas las zonas de ese campus (paneles LED de entrada).
    - `zona:<parking_lot_id>`: eventos de una sola zona.

    El envío es **en paralelo** y con tiempo límite por cliente: un cliente lento o caído
    no retrasa a los demás (RNF-01, difusión ≤ 3 s). Si no recibe a tiempo, se le cierra
    la conexión para que se reconecte.
    """

    def __init__(
        self,
        campus_conocidos: Optional[Iterable[str]] = None,
        timeout_envio_s: float = 1.0,
    ) -> None:
        self._campus = tuple(campus_conocidos) if campus_conocidos is not None else campus_configurados()
        self._timeout_envio_s = timeout_envio_s
        self._suscriptores: Dict[str, Set[WebSocket]] = {}

    @property
    def campus_conocidos(self) -> tuple:
        return self._campus

    async def connect(
        self,
        websocket: WebSocket,
        campus: Optional[str] = None,
        zona: Optional[str] = None,
    ) -> None:
        """Acepta la conexión y la suscribe a la zona, al campus o al canal global."""
        await websocket.accept()
        if zona is not None:
            canal = canal_zona(zona)
        elif campus is not None:
            canal = canal_campus(campus)
        else:
            canal = CANAL_GLOBAL
        self._suscriptores.setdefault(canal, set()).add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        for canal in list(self._suscriptores):
            conexiones = self._suscriptores[canal]
            conexiones.discard(websocket)
            if not conexiones:
                del self._suscriptores[canal]

    def total_conexiones(self) -> int:
        return sum(len(conexiones) for conexiones in self._suscriptores.values())

    def destinatarios(self, parking_lot_id: Optional[str]) -> Set[WebSocket]:
        """Conexiones que deben recibir un evento de esa zona: global + su campus + la zona."""
        canales: List[str] = [CANAL_GLOBAL]
        if parking_lot_id:
            canales.append(canal_zona(parking_lot_id))
            campus = campus_de_zona(parking_lot_id, self._campus)
            if campus is not None:
                canales.append(canal_campus(campus))
        destinatarios: Set[WebSocket] = set()
        for canal in canales:
            destinatarios |= self._suscriptores.get(canal, set())
        return destinatarios

    async def broadcast_state_update(self, message: dict[str, Any]) -> None:
        """Difunde un evento a los suscriptores de su zona y campus (y al canal global)."""
        destinatarios = list(self.destinatarios(message.get("parking_lot_id")))
        if not destinatarios:
            return
        resultados = await asyncio.gather(
            *(self._enviar(conexion, message) for conexion in destinatarios)
        )
        for conexion, entregado in zip(destinatarios, resultados):
            if not entregado:
                self.disconnect(conexion)

    async def _enviar(self, websocket: WebSocket, message: dict[str, Any]) -> bool:
        try:
            await asyncio.wait_for(websocket.send_json(message), timeout=self._timeout_envio_s)
            return True
        except Exception:
            # Lento (timeout) o caído: se cierra para que el cliente se reconecte.
            try:
                await asyncio.wait_for(
                    websocket.close(code=CODIGO_CIERRE_CLIENTE_LENTO),
                    timeout=self._timeout_envio_s,
                )
            except Exception:
                pass
            return False


# Nombre anterior, usado por `ParkingStateService` y por PF-18.
WebSocketBroadcastGateway = ConnectionManager
