"""Pruebas unitarias de geometría IoU, carga de polígonos, preprocesamiento y FSM (PF-14)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from src.detector.yolo_detector import FramePreprocessor
from src.models import BoundingBoxDetection, SlotState, VehicleType
from src.polygon_mapper.iou_evaluator import PolygonIoUEvaluator
from src.polygon_mapper.polygon_loader import load_polygon_calibration
from src.state_machine.temporal_fsm import SlotTemporalStateMachine


def test_polygon_loader_supports_pixel_and_normalized_coords(tmp_path: Path) -> None:
    norm_cfg = {
        "parking_lot_id": "ITM-CAMPUS1-EST-NORTE",
        "zone_id": "C1N-Z1",
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "normalized": True,
        "spots": [
            {
                "polygon_id": "poly-norm-01",
                "slot_name": "N-01",
                "polygon": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.3], [0.1, 0.3]],
            }
        ],
    }
    cfg_path = tmp_path / "norm_polygons.json"
    cfg_path.write_text(json.dumps(norm_cfg), encoding="utf-8")

    loaded = load_polygon_calibration(cfg_path)
    px = loaded.spots[0].resolve_pixels(1000, 500)
    assert px == [(100.0, 50.0), (200.0, 50.0), (200.0, 150.0), (100.0, 150.0)]

    default_cal = load_polygon_calibration()
    assert len(default_cal.spots) == 12
    assert default_cal.parking_lot_id == "ITM-CAMPUS1-EST-NORTE"


def test_iou_evaluator_edge_cases() -> None:
    # Cajón de 160x140 píxeles
    slot_vertices = [(100.0, 90.0), (260.0, 90.0), (260.0, 230.0), (100.0, 230.0)]

    # 1. Vehículo centrado -> IoU alto (>= 0.50)
    centered = BoundingBoxDetection(
        x1=108, y1=97, x2=252, y2=223, confidence=0.95, class_id=2, vehicle_type=VehicleType.CAR
    )
    res_occ = PolygonIoUEvaluator.evaluate_spot(slot_vertices, [centered])
    assert res_occ.iou_ratio >= 0.80
    assert res_occ.vehicle_type == VehicleType.CAR

    # 2. Vehículo entrando / estacionado a medias -> IoU intermedio (0.20 <= IoU < 0.50)
    entering = BoundingBoxDetection(
        x1=180, y1=98, x2=340, y2=222, confidence=0.88, class_id=7, vehicle_type=VehicleType.TRUCK
    )
    res_man = PolygonIoUEvaluator.evaluate_spot(slot_vertices, [entering])
    assert 0.20 <= res_man.iou_ratio < 0.50
    assert res_man.vehicle_type == VehicleType.TRUCK

    # 3. Vehículo en cajón adyacente sin invadir -> IoU == 0.0
    adjacent = BoundingBoxDetection(
        x1=325, y1=95, x2=475, y2=225, confidence=0.96, class_id=2, vehicle_type=VehicleType.CAR
    )
    res_free = PolygonIoUEvaluator.evaluate_spot(slot_vertices, [adjacent])
    assert res_free.iou_ratio == 0.0
    assert res_free.vehicle_type is None

    # 4. Múltiples vehículos: selecciona el de mayor IoU dentro del cajón
    res_multi = PolygonIoUEvaluator.evaluate_spot(slot_vertices, [adjacent, entering, centered])
    assert res_multi.iou_ratio == res_occ.iou_ratio


def test_fsm_hysteresis_and_maneuver_transitions() -> None:
    fsm = SlotTemporalStateMachine(
        polygon_id="poly-itm-a01",
        slot_name="A-01",
        t_free_seconds=2.0,
        t_occupied_seconds=3.0,
        min_occupied_frames=3,
        min_free_frames=2,
    )
    assert fsm.current_state == SlotState.LIBRE

    # Entrada gradual: primero entra en rango intermedio -> En maniobra
    assert fsm.evaluate(0.32, 0.0) == SlotState.EN_MANIOBRA
    # Sube a IoU alto pero aún no cumple 3 frames ni 3.0s
    assert fsm.evaluate(0.75, 1.0) == SlotState.EN_MANIOBRA
    assert fsm.evaluate(0.78, 2.5) == SlotState.EN_MANIOBRA
    # Frame 3 con >= 3.0s y baja variación de IoU -> confirma Ocupado
    assert fsm.evaluate(0.79, 4.1) == SlotState.OCUPADO

    # Salida: una sola lectura baja pasa por En maniobra antes de confirmar Libre
    assert fsm.evaluate(0.05, 5.0) == SlotState.EN_MANIOBRA
    assert fsm.evaluate(0.02, 7.1) == SlotState.LIBRE


def test_frame_preprocessor_boosts_night_brightness_in_memory() -> None:
    pre = FramePreprocessor(mode="auto", luma_night_threshold=85.0)
    dark_frame = np.full((120, 160, 3), 25, dtype=np.uint8)
    enhanced = pre.process(dark_frame)
    assert enhanced.shape == dark_frame.shape
    assert float(np.mean(enhanced)) > float(np.mean(dark_frame))
