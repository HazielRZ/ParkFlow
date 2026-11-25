"""Snapshot de aforo por campus y zona para la carga inicial de la PWA y los paneles LED (INT-COM-01)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from src.models.campus import campus_de_zona
from src.models.entities import ParkingSlotRecord
from src.services.parking_state_service import ParkingStateService

__all__ = ["AforoService"]

_CAMPOS_SUMABLES = ("total_slots", "free", "occupied", "in_maneuver")


def _iso(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _poligono(cajon: ParkingSlotRecord) -> Dict[str, Any]:
    """Mismos campos que `polygons` en el evento WebSocket `parking_state_updated`."""
    return {
        "polygon_id": cajon.polygon_id,
        "slot_name": cajon.slot_name,
        "state": cajon.state,
        "confidence": cajon.confidence,
        "iou_ratio": cajon.iou_ratio,
        "vehicle_type": cajon.vehicle_type,
        "manual_lock": cajon.manual_lock,
        "updated_at": _iso(cajon.updated_at),
    }


class AforoService:
    """Arma el estado actual a partir de `ParkingStateService` (en memoria, sin consultas lentas)."""

    def __init__(self, state_service: ParkingStateService, campus_conocidos: Iterable[str]) -> None:
        self._estado = state_service
        self._campus = tuple(campus_conocidos)

    def snapshot_general(self) -> Dict[str, Any]:
        return {
            "generado_en": _iso(datetime.now(timezone.utc)),
            "campus": [self._resumen_campus(campus) for campus in self._campus],
        }

    def snapshot_campus(self, campus: str) -> Optional[Dict[str, Any]]:
        """Snapshot de un campus, o `None` si el campus no existe."""
        if campus not in self._campus:
            return None
        return {"generado_en": _iso(datetime.now(timezone.utc)), **self._resumen_campus(campus)}

    def snapshot_zona(self, campus: str, parking_lot_id: str) -> Optional[Dict[str, Any]]:
        """Snapshot de una zona, o `None` si no es de ese campus o todavía no tiene datos."""
        if campus not in self._campus or campus_de_zona(parking_lot_id, self._campus) != campus:
            return None
        if parking_lot_id not in self._estado.zonas_con_datos():
            return None
        return {
            "generado_en": _iso(datetime.now(timezone.utc)),
            "campus": campus,
            **self._zona(parking_lot_id),
        }

    def _resumen_campus(self, campus: str) -> Dict[str, Any]:
        zonas = [
            self._zona(parking_lot_id)
            for parking_lot_id in self._estado.zonas_con_datos()
            if campus_de_zona(parking_lot_id, self._campus) == campus
        ]
        totales: Dict[str, Any] = {
            campo: sum(zona["metrics"][campo] for zona in zonas) for campo in _CAMPOS_SUMABLES
        }
        totales["occupancy_ratio"] = (
            round(totales["occupied"] / totales["total_slots"], 4) if totales["total_slots"] else 0.0
        )
        return {"campus": campus, "totales": totales, "zonas": zonas}

    def _zona(self, parking_lot_id: str) -> Dict[str, Any]:
        return {
            "parking_lot_id": parking_lot_id,
            "metrics": self._estado.get_lot_summary(parking_lot_id),
            "polygons": [_poligono(cajon) for cajon in self._estado.cajones_de_zona(parking_lot_id)],
        }
