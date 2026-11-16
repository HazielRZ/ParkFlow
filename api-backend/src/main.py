"""Punto de entrada principal de `/api-backend` (FastAPI)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from src.api.access_routes import build_access_router
from src.api.auth_routes import build_auth_router
from src.api.calibration_routes import build_calibration_router
from src.api.inference_routes import build_inference_router
from src.services.audit_service import auditoria_service
from src.services.parking_state_service import ParkingStateService
from src.validators.schema_validator import InferenceSchemaValidator
from src.websocket.gateway import WebSocketBroadcastGateway


def create_app(schema_path: Optional[Path] = None) -> FastAPI:
    """Inicializa la aplicación FastAPI con validación de contratos INT-SW-01."""
    app = FastAPI(
        title="ParkFlow CV to Backend Ingestion API",
        version="1.0.0",
        description=(
            "Orquestador de negocio, validación de estados de estacionamiento y "
            "autenticación institucional con RBAC (RNF-05 / INT-SW-01 / RNF-02)."
        ),
        license_info={
            "name": "PolyForm Noncommercial License 1.0.0",
            "url": "https://polyformproject.org/licenses/noncommercial/1.0.0/",
        },
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    validator = InferenceSchemaValidator(schema_path=schema_path)
    ws_gateway = WebSocketBroadcastGateway()
    state_service = ParkingStateService(ws_gateway=ws_gateway, auditoria=auditoria_service)

    app.include_router(
        build_inference_router(validator=validator, state_service=state_service)
    )
    app.include_router(build_auth_router())
    app.include_router(build_calibration_router())
    app.include_router(build_access_router())

    @app.get("/health", tags=["System"])
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "service": "api-backend"}

    @app.websocket("/ws/parking-states")
    async def parking_states_ws(websocket: WebSocket) -> None:
        await ws_gateway.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_gateway.disconnect(websocket)

    return app


app = create_app()
