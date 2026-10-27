"""Filtro temporal de estados para polígonos de estacionamiento (INT-SW-01).

Regla 3 de AGENTS.md:
- Libre: IoU < 0.20 sostenido por más de `t_free_seconds`.
- Ocupado: IoU >= 0.50 sostenido por más de `t_occupied_seconds`.
- En maniobra: Transición obligatoria entre Libre y Ocupado o cuando 0.20 <= IoU < 0.50,
  evitando fluctuaciones por oclusiones momentáneas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from src.models import SlotState


@dataclass
class SlotTemporalStateMachine:
    """Máquina de estados finitos con ventana de confirmación temporal por polígono."""

    polygon_id: str
    slot_name: str
    iou_free_threshold: float = 0.20
    iou_occupied_threshold: float = 0.50
    t_free_seconds: float = 2.0
    t_occupied_seconds: float = 3.0
    current_state: SlotState = field(default=SlotState.LIBRE)
    _candidate_target: Optional[SlotState] = field(default=None, init=False, repr=False)
    _candidate_since: Optional[float] = field(default=None, init=False, repr=False)

    def evaluate(self, iou_ratio: float, timestamp_sec: float) -> SlotState:
        """Actualiza y devuelve el estado del cajón según el IoU observado y el tiempo actual."""
        if not 0.0 <= iou_ratio <= 1.0:
            raise ValueError(f"iou_ratio debe estar en [0.0, 1.0], recibido: {iou_ratio}")

        # Rango intermedio de IoU siempre corresponde a "En maniobra"
        if self.iou_free_threshold <= iou_ratio < self.iou_occupied_threshold:
            self._candidate_target = None
            self._candidate_since = None
            self.current_state = SlotState.EN_MANIOBRA
            return self.current_state

        if iou_ratio >= self.iou_occupied_threshold:
            if self.current_state == SlotState.OCUPADO:
                self._candidate_target = None
                self._candidate_since = None
                return self.current_state

            # Transición desde Libre o En maniobra hacia Ocupado pasa primero por En maniobra
            self.current_state = SlotState.EN_MANIOBRA
            if self._candidate_target != SlotState.OCUPADO or self._candidate_since is None:
                self._candidate_target = SlotState.OCUPADO
                self._candidate_since = timestamp_sec
            elif (timestamp_sec - self._candidate_since) >= self.t_occupied_seconds:
                self.current_state = SlotState.OCUPADO
                self._candidate_target = None
                self._candidate_since = None
            return self.current_state

        # Caso: iou_ratio < iou_free_threshold
        if self.current_state == SlotState.LIBRE:
            self._candidate_target = None
            self._candidate_since = None
            return self.current_state

        self.current_state = SlotState.EN_MANIOBRA
        if self._candidate_target != SlotState.LIBRE or self._candidate_since is None:
            self._candidate_target = SlotState.LIBRE
            self._candidate_since = timestamp_sec
        elif (timestamp_sec - self._candidate_since) >= self.t_free_seconds:
            self.current_state = SlotState.LIBRE
            self._candidate_target = None
            self._candidate_since = None

        return self.current_state
