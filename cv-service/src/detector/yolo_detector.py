"""Detector vehicular YOLO y preprocesamiento nocturno/lluvia con privacidad estricta OT-01.

Reglas OT-01:
- Solo se procesan e infieren clases vehiculares COCO: car (2), motorcycle (3), bus (5), truck (7).
- La clase person (0) y cualquier otro objeto no vehicular se ignoran en tiempo de inferencia
  y se descartan defensivamente en el filtro posterior sin almacenar coordenadas ni recortes.
- Todo el procesamiento ocurre en memoria RAM; nunca se escriben frames ni evidencias a disco.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Callable, Iterable, List, Literal, Mapping, Optional, Sequence, Tuple

import cv2
import numpy as np

from src.models import BoundingBoxDetection, VehicleType

logger = logging.getLogger("cv-service.detector")

# Whitelist inmutable de clases COCO permitidas (OT-01).
ALLOWED_COCO_VEHICLE_CLASSES: Mapping[int, VehicleType] = MappingProxyType(
    {
        2: VehicleType.CAR,
        3: VehicleType.MOTORCYCLE,
        5: VehicleType.BUS,
        7: VehicleType.TRUCK,
    }
)
ALLOWED_COCO_CLASS_IDS: Tuple[int, ...] = tuple(ALLOWED_COCO_VEHICLE_CLASSES.keys())
FORBIDDEN_HUMAN_CLASS_IDS = frozenset({0})


@dataclass
class FramePreprocessor:
    """Mejora adaptativa de contraste (gamma + CLAHE + mediana) en RAM para noche/lluvia (RNF-07)."""

    mode: Literal["auto", "always", "off"] = "auto"
    luma_night_threshold: float = 85.0
    gamma: float = 1.35
    clahe_clip_limit: float = 2.5
    clahe_tile_grid: Tuple[int, int] = (8, 8)
    denoise_kernel: int = 3
    _gamma_lut: np.ndarray = field(init=False, repr=False)

    def __post_init__(self) -> None:
        inv_gamma = 1.0 / max(0.1, float(self.gamma))
        table = np.array(
            [((idx / 255.0) ** inv_gamma) * 255.0 for idx in range(256)],
            dtype=np.uint8,
        )
        self._gamma_lut = table

    @classmethod
    def from_env(cls) -> "FramePreprocessor":
        raw_mode = os.getenv("PARKFLOW_PREPROCESS_MODE", "auto").strip().lower()
        mode: Literal["auto", "always", "off"]
        if raw_mode in ("auto", "always", "off"):
            mode = raw_mode  # type: ignore[assignment]
        else:
            mode = "auto"
        return cls(
            mode=mode,
            luma_night_threshold=float(os.getenv("PARKFLOW_NIGHT_LUMA_THRESHOLD", "85.0")),
            gamma=float(os.getenv("PARKFLOW_NIGHT_GAMMA", "1.35")),
            clahe_clip_limit=float(os.getenv("PARKFLOW_CLAHE_CLIP_LIMIT", "2.5")),
        )

    def should_enhance(self, frame: np.ndarray) -> bool:
        """Determina si conviene aplicar realce nocturno según la luminancia media."""
        if self.mode == "off":
            return False
        if self.mode == "always":
            return True
        if frame.ndim == 2:
            mean_luma = float(np.mean(frame))
        else:
            mean_luma = float(np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)))
        return mean_luma < self.luma_night_threshold

    def process(self, frame: np.ndarray) -> np.ndarray:
        """Aplica preprocesamiento en memoria RAM sin alterar el buffer de entrada."""
        if frame is None or frame.size == 0 or self.mode == "off":
            return frame
        if not self.should_enhance(frame):
            return frame

        gamma_corrected = cv2.LUT(frame, self._gamma_lut)
        if gamma_corrected.ndim == 2:
            clahe = cv2.createCLAHE(
                clipLimit=self.clahe_clip_limit,
                tileGridSize=self.clahe_tile_grid,
            )
            enhanced = clahe.apply(gamma_corrected)
        else:
            lab = cv2.cvtColor(gamma_corrected, cv2.COLOR_BGR2LAB)
            l_chan, a_chan, b_chan = cv2.split(lab)
            clahe = cv2.createCLAHE(
                clipLimit=self.clahe_clip_limit,
                tileGridSize=self.clahe_tile_grid,
            )
            l_eq = clahe.apply(l_chan)
            enhanced = cv2.cvtColor(cv2.merge((l_eq, a_chan, b_chan)), cv2.COLOR_LAB2BGR)

        if self.denoise_kernel >= 3 and self.denoise_kernel % 2 == 1:
            enhanced = cv2.medianBlur(enhanced, self.denoise_kernel)
        return enhanced


@dataclass
class YoloVehicleDetector:
    """Motor de inferencia vehicular YOLO con filtrado estricto OT-01 sin captura facial."""

    model_weights: str = "yolov8n.pt"
    confidence_threshold: float = 0.45
    allowed_classes: Tuple[str, ...] = field(
        default_factory=lambda: ("car", "truck", "motorcycle", "bus")
    )
    imgsz: int = 640
    device: Optional[str] = None
    predictor: Optional[Callable[[np.ndarray], Iterable[Mapping[str, Any]]]] = field(
        default=None, repr=False
    )
    _model: Any = field(default=None, init=False, repr=False)
    discarded_non_vehicle_count: int = field(default=0, init=False)

    @classmethod
    def from_env(
        cls,
        predictor: Optional[Callable[[np.ndarray], Iterable[Mapping[str, Any]]]] = None,
    ) -> "YoloVehicleDetector":
        return cls(
            model_weights=os.getenv("PARKFLOW_YOLO_MODEL", "yolov8n.pt"),
            confidence_threshold=float(os.getenv("PARKFLOW_YOLO_CONFIDENCE", "0.45")),
            imgsz=int(os.getenv("PARKFLOW_YOLO_IMGSZ", "640")),
            device=os.getenv("PARKFLOW_YOLO_DEVICE") or None,
            predictor=predictor,
        )

    def _ensure_model(self) -> Any:
        if self._model is None:
            from ultralytics import YOLO  # importación perezosa para tests offline

            self._model = YOLO(self.model_weights)
        return self._model

    def filter_raw_detections(
        self,
        raw_items: Iterable[Mapping[str, Any]],
    ) -> List[BoundingBoxDetection]:
        """Descarta al 100% la clase person (0) y cualquier clase no vehicular (OT-01)."""
        accepted: List[BoundingBoxDetection] = []
        allowed_names = set(self.allowed_classes)

        for item in raw_items:
            raw_cls = item.get("class_id")
            if raw_cls is None:
                self.discarded_non_vehicle_count += 1
                continue
            try:
                class_id = int(raw_cls)
            except (TypeError, ValueError):
                self.discarded_non_vehicle_count += 1
                continue

            if class_id in FORBIDDEN_HUMAN_CLASS_IDS or class_id not in ALLOWED_COCO_VEHICLE_CLASSES:
                self.discarded_non_vehicle_count += 1
                continue

            vehicle_type = ALLOWED_COCO_VEHICLE_CLASSES[class_id]
            if vehicle_type.value not in allowed_names:
                self.discarded_non_vehicle_count += 1
                continue

            conf = float(item.get("confidence", 0.0))
            if conf < self.confidence_threshold:
                continue

            bbox = item.get("bbox")
            if bbox is None or len(bbox) != 4:
                continue
            x1, y1, x2, y2 = (float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3]))
            if x2 <= x1 or y2 <= y1:
                continue

            accepted.append(
                BoundingBoxDetection(
                    x1=x1,
                    y1=y1,
                    x2=x2,
                    y2=y2,
                    confidence=min(1.0, max(0.0, conf)),
                    class_id=class_id,
                    vehicle_type=vehicle_type,
                )
            )

        return accepted

    def detect(self, frame: np.ndarray) -> List[BoundingBoxDetection]:
        """Ejecuta detección vehicular en memoria RAM con filtro de clases COCO [2, 3, 5, 7]."""
        if frame is None or frame.size == 0:
            return []

        if self.predictor is not None:
            return self.filter_raw_detections(self.predictor(frame))

        model = self._ensure_model()
        predict_kwargs: dict[str, Any] = {
            "source": frame,
            "classes": list(ALLOWED_COCO_CLASS_IDS),
            "conf": self.confidence_threshold,
            "imgsz": self.imgsz,
            "save": False,
            "save_txt": False,
            "save_crop": False,
            "save_conf": False,
            "verbose": False,
        }
        if self.device is not None:
            predict_kwargs["device"] = self.device

        results = model.predict(**predict_kwargs)
        raw_items: List[dict[str, Any]] = []
        for res in results:
            boxes = getattr(res, "boxes", None)
            if boxes is None:
                continue
            xyxy_list = boxes.xyxy.tolist() if hasattr(boxes.xyxy, "tolist") else list(boxes.xyxy)
            cls_list = boxes.cls.tolist() if hasattr(boxes.cls, "tolist") else list(boxes.cls)
            conf_list = boxes.conf.tolist() if hasattr(boxes.conf, "tolist") else list(boxes.conf)
            for coords, cls_id, conf in zip(xyxy_list, cls_list, conf_list):
                raw_items.append(
                    {
                        "class_id": int(cls_id),
                        "confidence": float(conf),
                        "bbox": coords,
                    }
                )
        return self.filter_raw_detections(raw_items)
