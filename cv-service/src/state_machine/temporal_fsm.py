"""Filtro temporal de estados con histéresis por frames para polígonos de estacionamiento (INT-SW-01).

Regla 3 de AGENTS.md:
- Libre: IoU < iou_free_threshold sostenido por >= t_free_seconds y >= min_free_frames.
- Ocupado: IoU >= iou_occupied_threshold sostenido por >= t_occupied_seconds y >= min_occupied_frames.
- En maniobra: Transición obligatoria entre Libre y Ocupado o cuando
  iou_free_threshold <= IoU < iou_occupied_threshold (o desplazamiento activo de IoU),
  evitando fluctuaciones por oclusiones momentáneas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from src.models import SlotState


@dataclass
class SlotTemporalStateMachine:
    """Máquina de estados finitos con ventana temporal e histéresis de frames por polígono."""

    polygon_id: str
    slot_name: str
    iou_free_threshold: float = 0.20
    iou_occupied_threshold: float = 0.50
    t_free_seconds: float = 2.0
    t_occupied_seconds: float = 3.0
    min_occupied_frames: int = 1
    min_free_frames: int = 1
    maneuver_debounce_frames: int = 1
    iou_motion_threshold: float = 0.15
    current_state: SlotState = field(default=SlotState.LIBRE)
    _candidate_target: Optional[SlotState] = field(default=None, init=False, repr=False)
    _candidate_since: Optional[float] = field(default=None, init=False, repr=False)
    _candidate_frames: int = field(default=0, init=False, repr=False)
    _maneuver_frames: int = field(default=0, init=False, repr=False)
    _last_iou: Optional[float] = field(default=None, init=False, repr=False)

    def _reset_candidate(self) -> None:
        self._candidate_target = None
        self._candidate_since = None
        self._candidate_frames = 0

    def _enter_maneuver_if_debounced(self) -> SlotState:
        self._maneuver_frames += 1
        if self._maneuver_frames >= max(1, self.maneuver_debounce_frames):
            self.current_state = SlotState.EN_MANIOBRA
        return self.current_state

    def evaluate(self, iou_ratio: float, timestamp_sec: float) -> SlotState:
        """Actualiza y devuelve el estado del cajón según el IoU observado y el tiempo actual."""
        if not 0.0 <= iou_ratio <= 1.0:
            raise ValueError(f"iou_ratio debe estar en [0.0, 1.0], recibido: {iou_ratio}")

        iou_delta = abs(iou_ratio - self._last_iou) if self._last_iou is not None else 0.0
        self._last_iou = iou_ratio

        # Rango intermedio de IoU siempre corresponde a "En maniobra"
        if self.iou_free_threshold <= iou_ratio < self.iou_occupied_threshold:
            self._reset_candidate()
            return self._enter_maneuver_if_debounced()

        if iou_ratio >= self.iou_occupied_threshold:
            if self.current_state == SlotState.OCUPADO:
                self._reset_candidate()
                self._maneuver_frames = 0
                return self.current_state

            # Transición desde Libre o En maniobra hacia Ocupado pasa primero por En maniobra
            self._enter_maneuver_if_debounced()
            if self._candidate_target != SlotState.OCUPADO or self._candidate_since is None:
                self._candidate_target = SlotState.OCUPADO
                self._candidate_since = timestamp_sec
                self._candidate_frames = 1
            else:
                self._candidate_frames += 1

            elapsed = timestamp_sec - self._candidate_since
            # Si hay cambio fuerte de IoU mientras entra, mantenemos maniobra hasta estabilizar
            if (
                elapsed >= self.t_occupied_seconds
                and self._candidate_frames >= max(1, self.min_occupied_frames)
                and iou_delta < self.iou_motion_threshold
            ):
                self.current_state = SlotState.OCUPADO
                self._reset_candidate()
                self._maneuver_frames = 0
            return self.current_state

        # Caso: iou_ratio < iou_free_threshold
        if self.current_state == SlotState.LIBRE:
            self._reset_candidate()
            self._maneuver_frames = 0
            return self.current_state

        self._enter_maneuver_if_debounced()
        if self._candidate_target != SlotState.LIBRE or self._candidate_since is None:
            self._candidate_target = SlotState.LIBRE
            self._candidate_since = timestamp_sec
            self._candidate_frames = 1
        else:
            self._candidate_frames += 1

        elapsed = timestamp_sec - self._candidate_since
        if (
            elapsed >= self.t_free_seconds
            and self._candidate_frames >= max(1, self.min_free_frames)
        ):
            self.current_state = SlotState.LIBRE
            self._reset_candidate()
            self._maneuver_frames = 0

        return self.current_state
