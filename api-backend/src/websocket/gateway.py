"""Gestor de conexiones WebSocket para transmitir estados de estacionamiento en vivo."""

from __future__ import annotations

from typing import Any, List
from fastapi import WebSocket


class WebSocketBroadcastGateway:
    """Administra suscriptores WebSocket y difunde eventos validados hacia `/client-app`."""

    def __init__(self) -> None:
        self._connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)

    async def broadcast_state_update(self, message: dict[str, Any]) -> None:
        stale: List[WebSocket] = []
        for connection in self._connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for dead in stale:
            self.disconnect(dead)
