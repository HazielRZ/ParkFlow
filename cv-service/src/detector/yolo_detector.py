"""Envoltura para el modelo de detección vehicular YOLO."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Tuple


@dataclass
class YoloVehicleDetector:
    """Configuración del detector vehicular basado en YOLO."""

    model_weights: str = "yolov8n.pt"
    confidence_threshold: float = 0.45
    allowed_classes: Tuple[str, ...] = field(
        default_factory=lambda: ("car", "truck", "motorcycle", "bus")
    )
