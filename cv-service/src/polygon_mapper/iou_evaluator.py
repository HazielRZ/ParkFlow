"""Evaluador de intersección sobre unión (IoU) entre detecciones y polígonos de cajón."""

from __future__ import annotations

from typing import Sequence, Tuple

Point2D = Tuple[float, float]


class PolygonIoUEvaluator:
    """Calcula el grado de traslape (IoU) entre bounding boxes vehiculares y polígonos."""

    @staticmethod
    def clamp_ratio(ratio: float) -> float:
        """Garantiza que el valor de IoU se mantenga dentro del rango [0.0, 1.0]."""
        return max(0.0, min(1.0, float(ratio)))

    @staticmethod
    def validate_polygon_vertices(vertices: Sequence[Point2D]) -> bool:
        """Verifica que un polígono de cajón cuente con al menos 3 vértices."""
        return len(vertices) >= 3
