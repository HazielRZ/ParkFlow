"""Entidades de estado de cajones de estacionamiento."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ParkingSlotRecord:
    """Representación en memoria/persistencia del último estado confirmado de un cajón."""

    parking_lot_id: str
    polygon_id: str
    slot_name: str
    state: str
    confidence: float
    iou_ratio: float
    vehicle_type: Optional[str]
    camera_id: str
    frame_sequence: int
    updated_at: datetime
    zone_id: Optional[str] = None
    last_latency_ms: Optional[float] = None
    manual_lock: bool = False
    lock_reason: Optional[str] = None
    locked_by: Optional[int] = None


@dataclass
class CalibracionCajonRecord:
    """Umbrales de IoU de un cajón para la máquina de estados (AGENTS.md §5.1).

    IoU < `umbral_iou_libre` → `Libre`; IoU ≥ `umbral_iou_ocupado` → `Ocupado`;
    en medio → `En maniobra`.
    """

    parking_lot_id: str
    polygon_id: str
    umbral_iou_libre: float
    umbral_iou_ocupado: float
    actualizado_por: int
    actualizado_en: datetime
