"""Modelos de datos de salida para el contrato INT-SW-01.

Define la representación tipada en `/cv-service` del esquema declarativo
`contracts/json-schema/inference-state.schema.json` sin acoplamiento de código
con `/api-backend`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class SlotState(str, Enum):
    """Estados discretos permitidos por la máquina de estados del cajón (INT-SW-01)."""

    LIBRE = "Libre"
    OCUPADO = "Ocupado"
    EN_MANIOBRA = "En maniobra"


class VehicleType(str, Enum):
    """Clases vehiculares soportadas por el detector YOLO."""

    CAR = "car"
    TRUCK = "truck"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"


class PolygonInferenceState(BaseModel):
    """Estado de inferencia individual para un polígono de estacionamiento."""

    model_config = ConfigDict(extra="forbid")

    polygon_id: str = Field(
        ...,
        min_length=1,
        description="Identificador unívoco del polígono del cajón.",
    )
    slot_name: str = Field(
        ...,
        min_length=1,
        description="Etiqueta visual del cajón (ej. A-01, B-14).",
    )
    state: SlotState = Field(
        ...,
        description="Estado calculado tras filtro temporal (Libre, Ocupado, En maniobra).",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Nivel de confianza de la detección vehicular [0.0, 1.0].",
    )
    iou_ratio: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Grado de intersección sobre unión con el cajón [0.0, 1.0].",
    )
    vehicle_type: Optional[VehicleType] = Field(
        default=None,
        description="Clase vehicular detectada por el modelo.",
    )


class ParkFlowPolygonInferencePayload(BaseModel):
    """Carga útil del contrato INT-SW-01 emitida hacia `/api-backend`."""

    model_config = ConfigDict(extra="forbid")

    camera_id: UUID = Field(
        ...,
        description="Identificador único (UUID) de la cámara emisora.",
    )
    parking_lot_id: str = Field(
        ...,
        min_length=1,
        description="Clave del área o estacionamiento monitoreado.",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Estampa de tiempo ISO-8601 del frame procesado.",
    )
    frame_sequence: int = Field(
        ...,
        ge=0,
        description="Número de secuencia incremental del frame.",
    )
    polygons: List[PolygonInferenceState] = Field(
        ...,
        min_length=1,
        description="Lista no vacía de estados por polígono.",
    )

    @field_serializer("camera_id")
    def _serialize_uuid(self, value: UUID) -> str:
        return str(value)

    @field_serializer("timestamp")
    def _serialize_timestamp(self, value: datetime) -> str:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace("+00:00", "Z")

    def to_contract_dict(self) -> dict[str, Any]:
        """Serializa el modelo al diccionario JSON exacto requerido por INT-SW-01."""
        return self.model_dump(mode="json", exclude_none=False)
