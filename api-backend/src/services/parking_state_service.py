"""Servicio de gestión de estados de estacionamiento y cálculo de ocupación."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from src.models.entities import ParkingSlotRecord
from src.services.audit_service import AuditoriaService
from src.websocket.gateway import WebSocketBroadcastGateway


class ParkingStateService:
    """Actualiza el estado de cada polígono y difunde métricas en tiempo real."""

    CAPACITY_ALERT_THRESHOLD = 0.90

    def __init__(
        self,
        ws_gateway: WebSocketBroadcastGateway,
        auditoria: AuditoriaService,
    ) -> None:
        self._ws_gateway = ws_gateway
        self._auditoria = auditoria
        self._slots_by_lot: Dict[str, Dict[str, ParkingSlotRecord]] = {}

    async def process_inference_event(self, validated_payload: dict[str, Any]) -> dict[str, Any]:
        """Registra la actualización de polígonos y notifica a los clientes suscritos."""
        parking_lot_id: str = validated_payload["parking_lot_id"]
        camera_id: str = validated_payload["camera_id"]
        frame_sequence: int = validated_payload["frame_sequence"]
        ts = datetime.fromisoformat(
            str(validated_payload["timestamp"]).replace("Z", "+00:00")
        )

        lot_slots = self._slots_by_lot.setdefault(parking_lot_id, {})
        for poly in validated_payload["polygons"]:
            record = ParkingSlotRecord(
                parking_lot_id=parking_lot_id,
                polygon_id=poly["polygon_id"],
                slot_name=poly["slot_name"],
                state=poly["state"],
                confidence=float(poly["confidence"]),
                iou_ratio=float(poly["iou_ratio"]),
                vehicle_type=poly.get("vehicle_type"),
                camera_id=camera_id,
                frame_sequence=frame_sequence,
                updated_at=ts,
            )
            self._auditar_cambio_de_estado(lot_slots.get(record.polygon_id), record)
            lot_slots[record.polygon_id] = record

        summary = self.get_lot_summary(parking_lot_id)
        await self._ws_gateway.broadcast_state_update(
            {
                "event": "parking_state_updated",
                "parking_lot_id": parking_lot_id,
                "timestamp": validated_payload["timestamp"],
                "frame_sequence": frame_sequence,
                "polygons": validated_payload["polygons"],
                "metrics": summary,
            }
        )
        return summary

    def obtener_cajon(self, parking_lot_id: str, polygon_id: str) -> Optional[ParkingSlotRecord]:
        """Último estado conocido de un cajón, o `None` si `/cv-service` nunca lo ha reportado."""
        return self._slots_by_lot.get(parking_lot_id, {}).get(polygon_id)

    async def actualizar_estado_manual(
        self, parking_lot_id: str, polygon_id: str, estado: str, id_usuario: int
    ) -> Optional[ParkingSlotRecord]:
        """Fija el estado de un cajón desde el registro manual de accesos.

        Retorna el registro actualizado, o `None` si el cajón no existe. El cambio se
        audita a nombre de `id_usuario` y se difunde por WebSocket igual que una inferencia.
        """
        previo = self.obtener_cajon(parking_lot_id, polygon_id)
        if previo is None:
            return None

        nuevo = replace(
            previo,
            state=estado,
            vehicle_type=None if estado == "Libre" else previo.vehicle_type,
            updated_at=datetime.now(timezone.utc),
        )
        self._auditar_cambio_de_estado(previo, nuevo, id_usuario=id_usuario)
        self._slots_by_lot[parking_lot_id][polygon_id] = nuevo

        await self._ws_gateway.broadcast_state_update(
            {
                "event": "parking_state_updated",
                "parking_lot_id": parking_lot_id,
                "timestamp": nuevo.updated_at.isoformat().replace("+00:00", "Z"),
                "frame_sequence": nuevo.frame_sequence,
                "polygons": [
                    {
                        "polygon_id": nuevo.polygon_id,
                        "slot_name": nuevo.slot_name,
                        "state": nuevo.state,
                        "confidence": nuevo.confidence,
                        "iou_ratio": nuevo.iou_ratio,
                        "vehicle_type": nuevo.vehicle_type,
                    }
                ],
                "metrics": self.get_lot_summary(parking_lot_id),
            }
        )
        return nuevo

    def _auditar_cambio_de_estado(
        self,
        previo: Optional[ParkingSlotRecord],
        nuevo: ParkingSlotRecord,
        id_usuario: Optional[int] = None,
    ) -> None:
        """Registra en bitácora la transición de estado de un cajón (DoD #3 de PF-16).

        La primera observación de un cajón no se registra porque no hay estado anterior;
        tampoco se registran frames que repiten el mismo estado. `id_usuario` es `None`
        cuando el cambio lo reporta `/cv-service`, y el usuario cuando es un registro manual.
        """
        if previo is None or previo.state == nuevo.state:
            return
        self._auditoria.registrar(
            id_usuario=id_usuario,
            accion=(
                f"CAMBIO_ESTADO_CAJON:lote={nuevo.parking_lot_id},"
                f"poligono={nuevo.polygon_id},cajon={nuevo.slot_name},"
                f"anterior={previo.state},nuevo={nuevo.state}"
            ),
        )

    def get_lot_summary(self, parking_lot_id: str) -> dict[str, Any]:
        """Calcula métricas de disponibilidad y alerta de saturación (> 90%, RF-04)."""
        lot_slots = self._slots_by_lot.get(parking_lot_id, {})
        total = len(lot_slots)
        free_count = sum(1 for s in lot_slots.values() if s.state == "Libre")
        occupied_count = sum(1 for s in lot_slots.values() if s.state == "Ocupado")
        maneuver_count = sum(1 for s in lot_slots.values() if s.state == "En maniobra")
        occupancy_ratio = (occupied_count / total) if total > 0 else 0.0

        return {
            "total_slots": total,
            "free": free_count,
            "occupied": occupied_count,
            "in_maneuver": maneuver_count,
            "occupancy_ratio": round(occupancy_ratio, 4),
            "high_occupancy_alert": occupancy_ratio >= self.CAPACITY_ALERT_THRESHOLD,
        }
