"""Esquemas de entrada de los endpoints operativos: registro manual y calibración (PF-16)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class AccesoManualRequest(BaseModel):
    """Registro manual de un vehículo en un cajón (p. ej. cuando la cámara falla).

    El cajón se identifica igual que en el contrato INT-SW-01. Desde caseta solo se
    marca `Ocupado` (entrada) o `Libre` (salida); `En maniobra` lo detecta la cámara.
    """

    parking_lot_id: str = Field(min_length=1)
    polygon_id: str = Field(min_length=1)
    # Solo letras, números y guiones: la placa se escribe en la bitácora y no debe
    # poder inyectar separadores (`,` `=`) en el registro.
    placa: str = Field(min_length=1, max_length=20, pattern=r"^[A-Za-z0-9-]+$")
    estado: Literal["Libre", "Ocupado"]


class CalibracionCajonesRequest(BaseModel):
    """Umbrales de IoU de un cajón para la máquina de estados (AGENTS.md §5.1)."""

    parking_lot_id: str = Field(min_length=1)
    polygon_id: str = Field(min_length=1)
    umbral_iou_libre: float = Field(ge=0.0, le=1.0)
    umbral_iou_ocupado: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validar_orden_de_umbrales(self) -> "CalibracionCajonesRequest":
        if self.umbral_iou_libre >= self.umbral_iou_ocupado:
            raise ValueError(
                "umbral_iou_libre debe ser menor que umbral_iou_ocupado "
                "(el rango intermedio corresponde a 'En maniobra')"
            )
        return self

class PulsoBarreraRequest(BaseModel):
    """Evento físico de entrada/salida desde sensores o plumas vehiculares (INT-HW-02)."""

    parking_lot_id: str = Field(min_length=1)
    barrier_id: str = Field(min_length=1, max_length=64)
    evento: Literal["ENTRADA", "SALIDA"]
    timestamp: Optional[str] = None


class SobrescrituraManualRequest(BaseModel):
    """Forzado manual de estado con bloqueo ante inferencia CV (RF-03)."""

    parking_lot_id: str = Field(min_length=1)
    polygon_id: str = Field(min_length=1)
    estado: Literal["Libre", "Ocupado", "Reservado", "Obras", "Emergencia"]
    motivo: str = Field(min_length=3, max_length=255)


class LiberarBloqueoRequest(BaseModel):
    """Libera el bloqueo manual de un cajón para devolver el control a /cv-service."""

    parking_lot_id: str = Field(min_length=1)
    polygon_id: str = Field(min_length=1)
    motivo: str = Field(default="Liberación manual", min_length=3, max_length=255)