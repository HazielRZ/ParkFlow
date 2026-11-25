"""Evaluador geométrico de intersección sobre unión (IoU) entre vehículos y cajones."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence, Tuple

from shapely.geometry import Polygon, box

from src.models import BoundingBoxDetection, VehicleType

Point2D = Tuple[float, float]


@dataclass(frozen=True)
class PolygonOverlapMetrics:
    """Métricas geométricas de traslape entre una detección y un polígono de cajón."""

    iou_ratio: float
    coverage_ratio: float
    intersection_area: float


@dataclass(frozen=True)
class SpotOverlapSelection:
    """Mejor coincidencia vehicular asignada a un cajón en el frame actual."""

    iou_ratio: float
    coverage_ratio: float
    confidence: float
    vehicle_type: Optional[VehicleType]


class PolygonIoUEvaluator:
    """Calcula el grado de traslape (IoU y cobertura) entre bounding boxes y polígonos."""

    EMPTY_SPOT_CONFIDENCE = 0.98

    @staticmethod
    def clamp_ratio(ratio: float) -> float:
        """Garantiza que el valor de IoU se mantenga dentro del rango [0.0, 1.0]."""
        return max(0.0, min(1.0, float(ratio)))

    @staticmethod
    def validate_polygon_vertices(vertices: Sequence[Point2D]) -> bool:
        """Verifica que un polígono de cajón cuente con al menos 3 vértices."""
        return len(vertices) >= 3

    @staticmethod
    def _build_polygon(vertices: Sequence[Point2D]) -> Polygon:
        if len(vertices) < 3:
            raise ValueError("El polígono requiere al menos 3 vértices.")
        poly = Polygon(vertices)
        if not poly.is_valid:
            poly = poly.buffer(0)
        return poly

    @classmethod
    def compute_overlap(
        cls,
        bbox: Tuple[float, float, float, float],
        vertices: Sequence[Point2D],
    ) -> PolygonOverlapMetrics:
        """Calcula IoU exacto y porcentaje de cobertura del polígono usando Shapely."""
        x1, y1, x2, y2 = bbox
        if x2 <= x1 or y2 <= y1:
            return PolygonOverlapMetrics(iou_ratio=0.0, coverage_ratio=0.0, intersection_area=0.0)

        slot_poly = cls._build_polygon(vertices)
        slot_area = slot_poly.area
        if slot_area <= 0.0:
            return PolygonOverlapMetrics(iou_ratio=0.0, coverage_ratio=0.0, intersection_area=0.0)

        det_box = box(float(x1), float(y1), float(x2), float(y2))
        inter_area = float(slot_poly.intersection(det_box).area)
        if inter_area <= 0.0:
            return PolygonOverlapMetrics(iou_ratio=0.0, coverage_ratio=0.0, intersection_area=0.0)

        union_area = float(slot_poly.union(det_box).area)
        iou = cls.clamp_ratio(inter_area / union_area) if union_area > 0.0 else 0.0
        coverage = cls.clamp_ratio(inter_area / slot_area)
        return PolygonOverlapMetrics(
            iou_ratio=round(iou, 6),
            coverage_ratio=round(coverage, 6),
            intersection_area=round(inter_area, 3),
        )

    @classmethod
    def compute_iou(
        cls,
        bbox: Tuple[float, float, float, float],
        vertices: Sequence[Point2D],
    ) -> float:
        """Devuelve únicamente el valor IoU en [0.0, 1.0]."""
        return cls.compute_overlap(bbox, vertices).iou_ratio

    @classmethod
    def evaluate_spot(
        cls,
        vertices: Sequence[Point2D],
        detections: Sequence[BoundingBoxDetection],
    ) -> SpotOverlapSelection:
        """Selecciona la detección vehicular con mayor IoU sobre el cajón."""
        best: Optional[SpotOverlapSelection] = None

        for det in detections:
            metrics = cls.compute_overlap((det.x1, det.y1, det.x2, det.y2), vertices)
            if metrics.iou_ratio <= 0.0:
                continue
            candidate = SpotOverlapSelection(
                iou_ratio=metrics.iou_ratio,
                coverage_ratio=metrics.coverage_ratio,
                confidence=float(det.confidence),
                vehicle_type=det.vehicle_type,
            )
            if best is None or (
                (candidate.iou_ratio, candidate.coverage_ratio, candidate.confidence)
                > (best.iou_ratio, best.coverage_ratio, best.confidence)
            ):
                best = candidate

        if best is not None:
            return best

        return SpotOverlapSelection(
            iou_ratio=0.0,
            coverage_ratio=0.0,
            confidence=cls.EMPTY_SPOT_CONFIDENCE,
            vehicle_type=None,
        )
