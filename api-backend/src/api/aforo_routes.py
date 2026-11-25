"""Aforo en tiempo real: snapshot REST y suscripción WebSocket por campus y zona (INT-COM-01 / RNF-01).

La lectura es pública: es disponibilidad de cajones, no gestión (RNF-02 exige login
solo para gestión), y los paneles LED no pueden iniciar sesión.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response, WebSocket, WebSocketDisconnect, status

from src.models.campus import campus_de_zona
from src.services.aforo_service import AforoService
from src.websocket.gateway import ConnectionManager


def build_aforo_router(aforo_service: AforoService, manager: ConnectionManager) -> APIRouter:
    """Construye las rutas de snapshot REST y los canales WebSocket por campus y zona."""
    router = APIRouter(tags=["Aforo"])

    def _sin_cache(response: Response) -> None:
        # La PWA tiene service worker: el aforo nunca debe servirse desde caché.
        response.headers["Cache-Control"] = "no-store"

    @router.get(
        "/api/aforo",
        summary="Snapshot de aforo de todos los campus",
        operation_id="obtenerAforoGeneral",
    )
    def aforo_general(response: Response) -> dict:
        _sin_cache(response)
        return aforo_service.snapshot_general()

    @router.get(
        "/api/aforo/campus/{campus_id}",
        summary="Snapshot de aforo de un campus (carga inicial de la PWA o del panel LED)",
        operation_id="obtenerAforoCampus",
    )
    def aforo_campus(campus_id: str, response: Response) -> dict:
        snapshot = aforo_service.snapshot_campus(campus_id)
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"El campus '{campus_id}' no existe",
            )
        _sin_cache(response)
        return snapshot

    @router.get(
        "/api/aforo/campus/{campus_id}/zonas/{zona_id}",
        summary="Snapshot de aforo de una zona",
        operation_id="obtenerAforoZona",
    )
    def aforo_zona(campus_id: str, zona_id: str, response: Response) -> dict:
        snapshot = aforo_service.snapshot_zona(campus_id, zona_id)
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"La zona '{zona_id}' no pertenece al campus '{campus_id}' o todavía no tiene datos",
            )
        _sin_cache(response)
        return snapshot

    @router.websocket("/ws/campus/{campus_id}")
    async def ws_campus(websocket: WebSocket, campus_id: str) -> None:
        if campus_id not in manager.campus_conocidos:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await manager.connect(websocket, campus=campus_id)
        await _escuchar_hasta_cierre(websocket, manager)

    @router.websocket("/ws/campus/{campus_id}/zonas/{zona_id}")
    async def ws_zona(websocket: WebSocket, campus_id: str, zona_id: str) -> None:
        # Se permite suscribirse a una zona que aún no reporta, pero debe ser de ese campus.
        if campus_de_zona(zona_id, manager.campus_conocidos) != campus_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        await manager.connect(websocket, zona=zona_id)
        await _escuchar_hasta_cierre(websocket, manager)

    return router


async def _escuchar_hasta_cierre(websocket: WebSocket, manager: ConnectionManager) -> None:
    """Mantiene la conexión abierta; los mensajes del cliente (p. ej. pings) se ignoran."""
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, RuntimeError):
        # RuntimeError: el gestor ya cerró la conexión por ser un cliente lento.
        pass
    finally:
        manager.disconnect(websocket)
