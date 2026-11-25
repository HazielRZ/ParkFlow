"""Servicio de gestión de estados de estacionamiento y cálculo de ocupación."""

from __future__ import annotations

import json
import logging
import math
import os
from collections import deque
from dataclasses import replace
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional

from src.models.entities import ParkingSlotRecord
from src.services.audit_service import AuditoriaService
from src.websocket.gateway import WebSocketBroadcastGateway

logger = logging.getLogger("api-backend.inference")


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
        self._barrier_net_flow: Dict[str, int] = {}
        self._latency_samples: Deque[float] = deque(maxlen=1000)
        self._sla_violations: int = 0
        self._last_latency_ms: float = 0.0
        self._state_history: List[dict[str, Any]] = []

    @property
    def last_latency_ms(self) -> float:
        return self._last_latency_ms

    @staticmethod
    def _sla_threshold_ms() -> float:
        return float(os.getenv("PARKFLOW_LATENCY_SLA_MS", "5000"))

    async def process_inference_event(
        self,
        validated_payload: dict[str, Any],
        *,
        received_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Registra la actualización de polígonos, mide latencia RNF-01 y difunde por WS."""
        parking_lot_id: str = validated_payload["parking_lot_id"]
        camera_id: str = validated_payload["camera_id"]
        frame_sequence: int = validated_payload["frame_sequence"]
        ts = datetime.fromisoformat(
            str(validated_payload["timestamp"]).replace("Z", "+00:00")
        )
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        received_dt = received_at or datetime.now(timezone.utc)
        if received_dt.tzinfo is None:
            received_dt = received_dt.replace(tzinfo=timezone.utc)

        latency_ms = max(0.0, round((received_dt - ts).total_seconds() * 1000.0, 3))
        sla_ms = self._sla_threshold_ms()
        self._last_latency_ms = latency_ms
        self._latency_samples.append(latency_ms)
        if latency_ms > sla_ms:
            self._sla_violations += 1
            logger.warning(
                json.dumps(
                    {
                        "event": "inference_latency_sla_exceeded",
                        "parking_lot_id": parking_lot_id,
                        "frame_sequence": frame_sequence,
                        "latency_ms": latency_ms,
                        "sla_threshold_ms": sla_ms,
                    }
                )
            )
        else:
            logger.info(
                json.dumps(
                    {
                        "event": "inference_event_processed",
                        "parking_lot_id": parking_lot_id,
                        "frame_sequence": frame_sequence,
                        "polygons_count": len(validated_payload["polygons"]),
                        "latency_ms": latency_ms,
                    }
                )
            )

        lot_slots = self._slots_by_lot.setdefault(parking_lot_id, {})
        effective_polygons = []

        for poly in validated_payload["polygons"]:
            polygon_id = poly["polygon_id"]
            existente = lot_slots.get(polygon_id)
            zone_id = poly.get("zone_id") or (existente.zone_id if existente else None)

            # RF-03: Si existe lock manual activo, ignorar inferencia automática
            if existente is not None and existente.manual_lock:
                record = replace(
                    existente,
                    camera_id=camera_id,
                    frame_sequence=frame_sequence,
                    updated_at=ts,
                    zone_id=zone_id,
                    last_latency_ms=latency_ms,
                )
                lot_slots[polygon_id] = record
                effective_polygons.append({
                    **poly,
                    "state": record.state,
                    "manual_lock": True,
                })
                continue

            record = ParkingSlotRecord(
                parking_lot_id=parking_lot_id,
                polygon_id=polygon_id,
                slot_name=poly["slot_name"],
                state=poly["state"],
                confidence=float(poly["confidence"]),
                iou_ratio=float(poly["iou_ratio"]),
                vehicle_type=poly.get("vehicle_type"),
                camera_id=camera_id,
                frame_sequence=frame_sequence,
                updated_at=ts,
                zone_id=zone_id,
                last_latency_ms=latency_ms,
                manual_lock=False,
            )
            self._auditar_cambio_de_estado(existente, record)
            if existente is None or existente.state != record.state:
                self._state_history.append(
                    {
                        "parking_lot_id": parking_lot_id,
                        "zone_id": zone_id,
                        "polygon_id": polygon_id,
                        "slot_name": record.slot_name,
                        "previous_state": existente.state if existente else None,
                        "state": record.state,
                        "confidence": record.confidence,
                        "iou_ratio": record.iou_ratio,
                        "detected_at": validated_payload["timestamp"],
                        "received_at": received_dt.isoformat().replace("+00:00", "Z"),
                        "latency_ms": latency_ms,
                    }
                )
            lot_slots[polygon_id] = record
            effective_polygons.append(poly)

        summary = self.get_lot_summary(parking_lot_id)
        await self._ws_gateway.broadcast_state_update(
            {
                "event": "parking_state_updated",
                "parking_lot_id": parking_lot_id,
                "camera_id": camera_id,
                "timestamp": validated_payload["timestamp"],
                "received_at": received_dt.isoformat().replace("+00:00", "Z"),
                "latency_ms": latency_ms,
                "frame_sequence": frame_sequence,
                "polygons": effective_polygons,
                "metrics": summary,
            }
        )
        return summary

    def get_latency_metrics(self) -> dict[str, Any]:
        """Devuelve estadísticas de latencia (p95, max, avg) para verificación RNF-01."""
        sla_ms = self._sla_threshold_ms()
        samples = sorted(self._latency_samples)
        if not samples:
            return {
                "count": 0,
                "last_ms": 0.0,
                "avg_ms": 0.0,
                "p95_ms": 0.0,
                "max_ms": 0.0,
                "sla_threshold_ms": sla_ms,
                "sla_violations": self._sla_violations,
                "within_sla": True,
            }
        p95_idx = min(len(samples) - 1, max(0, math.ceil(0.95 * len(samples)) - 1))
        p95_ms = round(samples[p95_idx], 3)
        max_ms = round(samples[-1], 3)
        avg_ms = round(sum(samples) / len(samples), 3)
        return {
            "count": len(samples),
            "last_ms": round(self._last_latency_ms, 3),
            "avg_ms": avg_ms,
            "p95_ms": p95_ms,
            "max_ms": max_ms,
            "sla_threshold_ms": sla_ms,
            "sla_violations": self._sla_violations,
            "within_sla": p95_ms <= sla_ms and max_ms <= sla_ms,
        }

    def get_state_history(self, limit: int = 100) -> List[dict[str, Any]]:
        """Historial reciente de transiciones persistidas en memoria."""
        return list(self._state_history[-max(1, limit):])

    def obtener_cajon(self, parking_lot_id: str, polygon_id: str) -> Optional[ParkingSlotRecord]:
        """Último estado conocido de un cajón, o `None` si nunca se ha reportado."""
        return self._slots_by_lot.get(parking_lot_id, {}).get(polygon_id)

    async def actualizar_estado_manual(
        self, parking_lot_id: str, polygon_id: str, estado: str, id_usuario: int
    ) -> Optional[ParkingSlotRecord]:
        """Fija el estado de un cajón desde el registro manual de accesos."""
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

    async def forzar_estado_con_lock(
        self,
        parking_lot_id: str,
        polygon_id: str,
        estado: str,
        motivo: str,
        id_usuario: int,
    ) -> Optional[ParkingSlotRecord]:
        """Fuerza el estado de un cajón y activa bloqueo temporal ante CV (RF-03)."""
        previo = self.obtener_cajon(parking_lot_id, polygon_id)
        if previo is None:
            return None

        nuevo = replace(
            previo,
            state=estado,
            vehicle_type=None if estado == "Libre" else previo.vehicle_type,
            updated_at=datetime.now(timezone.utc),
            manual_lock=True,
            lock_reason=motivo,
            locked_by=id_usuario,
        )
        self._slots_by_lot[parking_lot_id][polygon_id] = nuevo

        self._auditoria.registrar(
            id_usuario=id_usuario,
            accion=(
                f"OVERRIDE_MANUAL_LOCK:lote={parking_lot_id},"
                f"poligono={polygon_id},cajon={nuevo.slot_name},"
                f"anterior={previo.state},nuevo={estado},motivo={motivo}"
            ),
        )

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
                        "manual_lock": True,
                        "lock_reason": motivo,
                    }
                ],
                "metrics": self.get_lot_summary(parking_lot_id),
            }
        )
        return nuevo

    async def liberar_bloqueo_manual(
        self,
        parking_lot_id: str,
        polygon_id: str,
        motivo: str,
        id_usuario: int,
    ) -> Optional[ParkingSlotRecord]:
        """Desactiva el bloqueo manual de un cajón para reanudar inferencia CV."""
        previo = self.obtener_cajon(parking_lot_id, polygon_id)
        if previo is None:
            return None

        nuevo = replace(
            previo,
            updated_at=datetime.now(timezone.utc),
            manual_lock=False,
            lock_reason=None,
            locked_by=None,
        )
        self._slots_by_lot[parking_lot_id][polygon_id] = nuevo

        self._auditoria.registrar(
            id_usuario=id_usuario,
            accion=(
                f"LIBERAR_LOCK_MANUAL:lote={parking_lot_id},"
                f"poligono={polygon_id},cajon={nuevo.slot_name},motivo={motivo}"
            ),
        )
        return nuevo

    async def registrar_pulso_barrera(
        self,
        parking_lot_id: str,
        barrier_id: str,
        evento: str,
    ) -> dict[str, Any]:
        """Procesa pulso de entrada/salida de barrera física y actualiza aforo (INT-HW-02)."""
        actual = self._barrier_net_flow.get(parking_lot_id, 0)
        if evento == "ENTRADA":
            actual += 1
        else:
            actual = max(0, actual - 1)
        self._barrier_net_flow[parking_lot_id] = actual

        self._auditoria.registrar(
            id_usuario=None,
            accion=(
                f"PULSO_BARRERA:lote={parking_lot_id},"
                f"barrera={barrier_id},evento={evento},flujo_neto={actual}"
            ),
        )

        summary = self.get_lot_summary(parking_lot_id)
        await self._ws_gateway.broadcast_state_update(
            {
                "event": "barrier_pulse_updated",
                "parking_lot_id": parking_lot_id,
                "barrier_id": barrier_id,
                "pulse": evento,
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "metrics": summary,
            }
        )
        return summary

    def _auditar_cambio_de_estado(
        self,
        previo: Optional[ParkingSlotRecord],
        nuevo: ParkingSlotRecord,
        id_usuario: Optional[int] = None,
    ) -> None:
        """Registra en bitácora la transición de estado de un cajón."""
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
        """Calcula métricas de disponibilidad, flujo de barreras y alerta (> 90%, RF-04)."""
        lot_slots = self._slots_by_lot.get(parking_lot_id, {})
        total = len(lot_slots)
        free_count = sum(1 for s in lot_slots.values() if s.state == "Libre")
        occupied_count = sum(
            1 for s in lot_slots.values()
            if s.state in ("Ocupado", "Reservado", "Obras", "Emergencia")
        )
        maneuver_count = sum(1 for s in lot_slots.values() if s.state == "En maniobra")
        locked_count = sum(1 for s in lot_slots.values() if s.manual_lock)
        barrier_net = self._barrier_net_flow.get(parking_lot_id, 0)

        effective_occupied = max(occupied_count, barrier_net) if total > 0 else barrier_net
        occupancy_ratio = (effective_occupied / total) if total > 0 else 0.0

        return {
            "total_slots": total,
            "free": max(0, total - effective_occupied) if total > 0 else 0,
            "occupied": effective_occupied,
            "in_maneuver": maneuver_count,
            "locked_slots": locked_count,
            "barrier_net_vehicles": barrier_net,
            "occupancy_ratio": round(occupancy_ratio, 4),
            "high_occupancy_alert": occupancy_ratio >= self.CAPACITY_ALERT_THRESHOLD,
        }