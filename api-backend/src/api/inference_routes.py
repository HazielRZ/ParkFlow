"""Endpoint de ingestión `POST /api/v1/inference/states` (INT-SW-01)."""

from __future__ import annotations

from datetime import datetime, timezone
from json import JSONDecodeError

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from src.services.parking_state_service import ParkingStateService
from src.validators.schema_validator import (
    ContractStructureError,
    InferenceSchemaValidator,
    UnsupportedSlotStateError,
)


def build_inference_router(
    validator: InferenceSchemaValidator,
    state_service: ParkingStateService,
) -> APIRouter:
    """Construye el router para la recepción y validación en frontera de inferencias."""
    router = APIRouter(prefix="/api/v1/inference", tags=["Inference"])

    @router.post(
        "/states",
        status_code=status.HTTP_202_ACCEPTED,
        summary="Recibir actualización de estados por polígono",
        operation_id="ingestPolygonStates",
    )
    async def ingest_polygon_states(request: Request) -> JSONResponse:
        try:
            raw_payload = await request.json()
        except (JSONDecodeError, ValueError) as exc:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "InvalidJSONPayload",
                    "detail": f"Carga útil JSON malformada: {exc}",
                },
            )

        try:
            validated_payload = validator.validate_payload(raw_payload)
        except UnsupportedSlotStateError as exc:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "error": "UnsupportedSlotStateError",
                    "detail": str(exc),
                },
            )
        except ContractStructureError as exc:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "ContractValidationError",
                    "detail": str(exc),
                },
            )

        await state_service.process_inference_event(validated_payload)
        received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={
                "status": "accepted",
                "received_at": received_at,
            },
        )

    return router
