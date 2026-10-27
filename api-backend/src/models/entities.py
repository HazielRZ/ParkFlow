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
