"""Modelos de datos de salida para el contrato INT-SW-01 y frontera PF-14 -> PF-15.

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
    """Clases vehiculares soportadas por el detector YOLO (whitelist OT-01)."""

    CAR = "car"
    TRUCK = "truck"
    MOTORCYCLE = "motorcycle"
    BUS = "bus"


class BoundingBoxDetection(BaseModel):
    """Detección vehicular validada dentro de la whitelist COCO (excluye personas/rostros)."""

    model_config = ConfigDict(extra="forbid")

    x1: float = Field(..., description="Coordenada X superior izquierda en píxeles.")
    y1: float = Field(..., description="Coordenada Y superior izquierda en píxeles.")
    x2: float = Field(..., description="Coordenada X inferior derecha en píxeles.")
    y2: float = Field(..., description="Coordenada Y inferior derecha en píxeles.")
    confidence: float = Field(..., ge=0.0, le=1.0)
    class_id: int = Field(..., description="Identificador numérico COCO vehicular.")
    vehicle_type: VehicleType = Field(..., description="Clase vehicular normalizada.")


class PolygonInferenceState(BaseModel):
    """Estado de inferencia individual para un polígono de estacionamiento."""

    model_config = ConfigDict(extra="forbid")

    polygon_id: str = Field(
        ...,
        min_length=1,
        description="Identificador unívoco del polígono del cajón.",
    )
    zone_id: Optional[str] = Field(
        default=None,
        min_length=1,
        description="Identificador opcional de la zona dentro del estacionamiento.",
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


class SpotInferenceResult(BaseModel):
    """Salida desacoplada por cajón del motor PF-14 para consumo directo de PF-15."""

    model_config = ConfigDict(extra="forbid")

    spot_id: str = Field(..., min_length=1)
    slot_name: str = Field(..., min_length=1)
    zone_id: Optional[str] = Field(default=None, min_length=1)
    status: SlotState
    iou: float = Field(..., ge=0.0, le=1.0)
    coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: float = Field(..., ge=0.0, le=1.0)
    vehicle_class: Optional[VehicleType] = Field(default=None)
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    frame_sequence: int = Field(default=0, ge=0)

    def to_polygon_state(self) -> PolygonInferenceState:
        """Convierte el resultado interno de PF-14 al modelo del contrato INT-SW-01."""
        return PolygonInferenceState(
            polygon_id=self.spot_id,
            zone_id=self.zone_id,
            slot_name=self.slot_name,
            state=self.status,
            confidence=round(float(self.confidence), 4),
            iou_ratio=round(float(self.iou), 4),
            vehicle_type=None if self.status == SlotState.LIBRE else self.vehicle_class,
        )

    def to_lightweight_delta(self) -> dict[str, Any]:
        """Serializa un evento delta ligero con estampa UTC ISO-8601 para métricas de latencia."""
        ts = self.detected_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        payload: dict[str, Any] = {
            "spot_id": self.spot_id,
            "slot_name": self.slot_name,
            "status": self.status.value,
            "confidence": round(float(self.confidence), 4),
            "iou_ratio": round(float(self.iou), 4),
            "vehicle_type": (
                None
                if self.status == SlotState.LIBRE or self.vehicle_class is None
                else self.vehicle_class.value
            ),
            "detected_at": ts.isoformat().replace("+00:00", "Z"),
        }
        if self.zone_id is not None:
            payload["zone_id"] = self.zone_id
        return payload


class FrameInferenceBatch(BaseModel):
    """Resultado completo de inferencia para un frame procesado en memoria RAM."""

    model_config = ConfigDict(extra="forbid")

    camera_id: UUID
    parking_lot_id: str = Field(..., min_length=1)
    zone_id: Optional[str] = Field(default=None, min_length=1)
    frame_sequence: int = Field(..., ge=0)
    detected_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    results: List[SpotInferenceResult]
    processing_ms: float = Field(default=0.0, ge=0.0)


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
        data = self.model_dump(mode="json", exclude_none=False)
        for poly in data["polygons"]:
            if poly.get("zone_id") is None:
                poly.pop("zone_id", None)
        return data
