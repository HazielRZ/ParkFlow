"""Pruebas estrictas de privacidad OT-01 (sin rostros, sin peatones y cero escritura a disco)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from src.capture.stream_reader import VideoSourceReader
from src.detector.yolo_detector import (
    ALLOWED_COCO_CLASS_IDS,
    FORBIDDEN_HUMAN_CLASS_IDS,
    YoloVehicleDetector,
)
from src.engine import PolygonInferenceEngine
from src.models import SlotState, VehicleType
from src.polygon_mapper.polygon_loader import load_polygon_calibration


def test_ot01_discards_100_percent_person_and_non_vehicle_detections() -> None:
    detector = YoloVehicleDetector(confidence_threshold=0.45)

    # 10 detecciones de persona (COCO 0) + bicicleta (1) + perro (16) + 1 coche válido (2)
    raw = [
        {"class_id": 0, "confidence": 0.99, "bbox": [110, 100, 250, 220]},
        {"class_id": 0, "confidence": 0.95, "bbox": [330, 100, 470, 220]},
        {"class_id": 1, "confidence": 0.92, "bbox": [550, 100, 680, 220]},
        {"class_id": 16, "confidence": 0.88, "bbox": [770, 100, 900, 220]},
        {"class_id": 2, "confidence": 0.91, "bbox": [110, 480, 250, 600]},
    ]

    filtered = detector.filter_raw_detections(raw)

    assert len(filtered) == 1
    assert filtered[0].class_id == 2
    assert filtered[0].vehicle_type == VehicleType.CAR
    assert detector.discarded_non_vehicle_count == 4
    assert 0 in FORBIDDEN_HUMAN_CLASS_IDS
    assert 0 not in ALLOWED_COCO_CLASS_IDS


def test_ot01_yolo_predict_enforces_vehicle_whitelist_and_no_disk_save() -> None:
    captured_kwargs: dict[str, Any] = {}

    class _FakeModel:
        def predict(self, **kwargs: Any) -> list:
            captured_kwargs.update(kwargs)
            return []

    detector = YoloVehicleDetector(confidence_threshold=0.45)
    detector._model = _FakeModel()

    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    result = detector.detect(frame)

    assert result == []
    assert captured_kwargs["classes"] == [2, 3, 5, 7]
    assert captured_kwargs["save"] is False
    assert captured_kwargs["save_txt"] is False
    assert captured_kwargs["save_crop"] is False
    assert captured_kwargs["save_conf"] is False


def test_ot01_pipeline_writes_zero_files_and_ignores_person_inside_slot(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    calibration = load_polygon_calibration()

    # Simula una persona parada justo dentro del cajón A-01 (poly-itm-a01)
    def _person_only_predictor(_frame: np.ndarray) -> list[dict[str, Any]]:
        return [
            {"class_id": 0, "confidence": 0.99, "bbox": [105, 95, 255, 225]},
        ]

    engine = PolygonInferenceEngine(
        calibration=calibration,
        detector=YoloVehicleDetector(predictor=_person_only_predictor),
    )

    frame = np.full((720, 1280, 3), 30, dtype=np.uint8)  # fuerza preprocesamiento nocturno
    batch = engine.process_frame(frame, frame_sequence=1, monotonic_ts=0.0)
    assert batch.results[0].status == SlotState.LIBRE
    assert batch.results[0].iou == 0.0

    with VideoSourceReader("synthetic:night_rain", calibration=calibration) as reader:
        for b in engine.iter_stream(reader, max_frames=5):
            assert len(b.results) == len(calibration.spots)

    # Cero archivos o imágenes creados en disco durante el pipeline
    assert list(tmp_path.rglob("*")) == []
