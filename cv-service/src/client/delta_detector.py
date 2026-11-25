"""Detector de deltas con estabilización por frames para emisión ligera JSON (PF-15)."""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence, Tuple

from src.models import SpotInferenceResult, SlotState


class SlotDeltaDetector:
    """Filtra resultados por cajón para emitir únicamente cambios estabilizados de estado."""

    def __init__(
        self,
        debounce_frames: int = 2,
        *,
        emit_initial: bool = True,
    ) -> None:
        if debounce_frames < 1:
            raise ValueError("debounce_frames debe ser >= 1.")
        self.debounce_frames = debounce_frames
        self.emit_initial = emit_initial
        self._last_emitted: Dict[str, SlotState] = {}
        self._pending: Dict[str, Tuple[SlotState, int]] = {}

    def evaluate_spot(self, result: SpotInferenceResult) -> Optional[SpotInferenceResult]:
        """Devuelve el resultado si representa un cambio de estado confirmado; si no, `None`."""
        spot_id = result.spot_id

        if spot_id not in self._last_emitted:
            self._last_emitted[spot_id] = result.status
            self._pending.pop(spot_id, None)
            return result if self.emit_initial else None

        previous = self._last_emitted[spot_id]
        if result.status == previous:
            self._pending.pop(spot_id, None)
            return None

        pending_entry = self._pending.get(spot_id)
        if pending_entry is not None and pending_entry[0] == result.status:
            consecutive = pending_entry[1] + 1
        else:
            consecutive = 1

        if consecutive >= self.debounce_frames:
            self._last_emitted[spot_id] = result.status
            self._pending.pop(spot_id, None)
            return result

        self._pending[spot_id] = (result.status, consecutive)
        return None

    def extract_deltas(self, results: Sequence[SpotInferenceResult]) -> List[SpotInferenceResult]:
        """Devuelve únicamente los cajones cuyo estado cambió tras el filtro de debounce."""
        deltas: List[SpotInferenceResult] = []
        for item in results:
            changed = self.evaluate_spot(item)
            if changed is not None:
                deltas.append(changed)
        return deltas

    def last_known_states(self) -> Dict[str, SlotState]:
        """Devuelve una copia de los últimos estados emitidos por `spot_id`."""
        return dict(self._last_emitted)

    def reset(self, spot_id: Optional[str] = None) -> None:
        """Reinicia el estado interno de uno o todos los cajones."""
        if spot_id is None:
            self._last_emitted.clear()
            self._pending.clear()
        else:
            self._last_emitted.pop(spot_id, None)
            self._pending.pop(spot_id, None)
