"""Persistencia de umbrales de calibración por cajón (PF-16)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from src.models.entities import CalibracionCajonRecord

__all__ = ["CalibracionService"]


class CalibracionService:
    """Guarda la última calibración de cada cajón. Mock en memoria; sustituir por una tabla en PostgreSQL."""

    def __init__(self) -> None:
        self._por_cajon: Dict[Tuple[str, str], CalibracionCajonRecord] = {}

    def guardar(
        self,
        parking_lot_id: str,
        polygon_id: str,
        umbral_iou_libre: float,
        umbral_iou_ocupado: float,
        actualizado_por: int,
    ) -> CalibracionCajonRecord:
        registro = CalibracionCajonRecord(
            parking_lot_id=parking_lot_id,
            polygon_id=polygon_id,
            umbral_iou_libre=umbral_iou_libre,
            umbral_iou_ocupado=umbral_iou_ocupado,
            actualizado_por=actualizado_por,
            actualizado_en=datetime.now(timezone.utc),
        )
        self._por_cajon[(parking_lot_id, polygon_id)] = registro
        return registro

    def obtener(self, parking_lot_id: str, polygon_id: str) -> Optional[CalibracionCajonRecord]:
        return self._por_cajon.get((parking_lot_id, polygon_id))
