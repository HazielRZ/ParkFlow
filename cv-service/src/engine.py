"""Motor de inferencia YOLO + OpenCV por polígonos de estacionamiento (PF-14)."""

from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterator, List, Optional

import numpy as np

from src.capture.stream_reader import CapturedFrame, VideoSourceReader
from src.detector.yolo_detector import FramePreprocessor, YoloVehicleDetector
from src.models import FrameInferenceBatch, SpotInferenceResult
from src.polygon_mapper.iou_evaluator import PolygonIoUEvaluator
from src.polygon_mapper.polygon_loader import (
    ParkingZoneCalibration,
    load_polygon_calibration,
)
from src.state_machine.temporal_fsm import SlotTemporalStateMachine

logger = logging.getLogger("cv-service.engine")


class PolygonInferenceEngine:
    """Orquesta captura en RAM, preprocesamiento, detección YOLO, IoU y FSM temporal."""

    def __init__(
        self,
        calibration: ParkingZoneCalibration,
        *,
        detector: Optional[YoloVehicleDetector] = None,
        preprocessor: Optional[FramePreprocessor] = None,
        iou_free_threshold: Optional[float] = None,
        iou_occupied_threshold: Optional[float] = None,
        t_free_seconds: Optional[float] = None,
        t_occupied_seconds: Optional[float] = None,
        min_occupied_frames: Optional[int] = None,
        min_free_frames: Optional[int] = None,
        maneuver_debounce_frames: Optional[int] = None,
        on_batch: Optional[Callable[[FrameInferenceBatch], None]] = None,
    ) -> None:
        self.calibration = calibration
        self.detector = detector or YoloVehicleDetector.from_env()
        self.preprocessor = preprocessor or FramePreprocessor.from_env()
        self.on_batch = on_batch

        default_iou_free = (
            iou_free_threshold
            if iou_free_threshold is not None
            else float(os.getenv("PARKFLOW_IOU_FREE_THRESHOLD", "0.20"))
        )
        default_iou_occ = (
            iou_occupied_threshold
            if iou_occupied_threshold is not None
            else float(os.getenv("PARKFLOW_IOU_OCCUPIED_THRESHOLD", "0.50"))
        )
        default_t_free = (
            t_free_seconds
            if t_free_seconds is not None
            else float(os.getenv("PARKFLOW_T_FREE_SECONDS", "2.0"))
        )
        default_t_occ = (
            t_occupied_seconds
            if t_occupied_seconds is not None
            else float(os.getenv("PARKFLOW_T_OCCUPIED_SECONDS", "3.0"))
        )
        default_min_occ_frames = (
            min_occupied_frames
            if min_occupied_frames is not None
            else int(os.getenv("PARKFLOW_MIN_OCCUPIED_FRAMES", "2"))
        )
        default_min_free_frames = (
            min_free_frames
            if min_free_frames is not None
            else int(os.getenv("PARKFLOW_MIN_FREE_FRAMES", "2"))
        )
        default_debounce = (
            maneuver_debounce_frames
            if maneuver_debounce_frames is not None
            else int(os.getenv("PARKFLOW_MANEUVER_DEBOUNCE_FRAMES", "1"))
        )

        self._fsms: dict[str, SlotTemporalStateMachine] = {}
        for spot in calibration.spots:
            self._fsms[spot.spot_id] = SlotTemporalStateMachine(
                polygon_id=spot.spot_id,
                slot_name=spot.slot_name,
                iou_free_threshold=(
                    spot.iou_free_threshold
                    if spot.iou_free_threshold is not None
                    else default_iou_free
                ),
                iou_occupied_threshold=(
                    spot.iou_occupied_threshold
                    if spot.iou_occupied_threshold is not None
                    else default_iou_occ
                ),
                t_free_seconds=default_t_free,
                t_occupied_seconds=default_t_occ,
                min_occupied_frames=default_min_occ_frames,
                min_free_frames=default_min_free_frames,
                maneuver_debounce_frames=default_debounce,
            )

    @classmethod
    def from_env(
        cls,
        *,
        polygons_path: Optional[Path] = None,
        detector: Optional[YoloVehicleDetector] = None,
        on_batch: Optional[Callable[[FrameInferenceBatch], None]] = None,
    ) -> "PolygonInferenceEngine":
        calibration = load_polygon_calibration(polygons_path)
        return cls(calibration=calibration, detector=detector, on_batch=on_batch)

    def process_frame(
        self,
        frame: np.ndarray,
        *,
        frame_sequence: int,
        detected_at: Optional[datetime] = None,
        monotonic_ts: Optional[float] = None,
        raw_override_detections: Optional[List[dict]] = None,
    ) -> FrameInferenceBatch:
        """Procesa un frame BGR en memoria RAM y devuelve resultados tipados por cajón."""
        t0 = time.perf_counter()
        if frame is None or frame.size == 0:
            raise ValueError("El frame de entrada está vacío.")

        height, width = frame.shape[:2]
        processed_frame = self.preprocessor.process(frame)

        if raw_override_detections is not None:
            detections = self.detector.filter_raw_detections(raw_override_detections)
        else:
            detections = self.detector.detect(processed_frame)

        ts_utc = detected_at or datetime.now(timezone.utc)
        ts_mono = monotonic_ts if monotonic_ts is not None else time.monotonic()

        results: List[SpotInferenceResult] = []
        for spot in self.calibration.spots:
            vertices = spot.resolve_pixels(width, height)
            overlap = PolygonIoUEvaluator.evaluate_spot(vertices, detections)
            state = self._fsms[spot.spot_id].evaluate(overlap.iou_ratio, ts_mono)
            results.append(
                SpotInferenceResult(
                    spot_id=spot.spot_id,
                    slot_name=spot.slot_name,
                    zone_id=spot.zone_id,
                    status=state,
                    iou=overlap.iou_ratio,
                    coverage=overlap.coverage_ratio,
                    confidence=overlap.confidence,
                    vehicle_class=overlap.vehicle_type,
                    detected_at=ts_utc,
                    frame_sequence=frame_sequence,
                )
            )

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        batch = FrameInferenceBatch(
            camera_id=self.calibration.camera_id,
            parking_lot_id=self.calibration.parking_lot_id,
            zone_id=self.calibration.zone_id,
            frame_sequence=frame_sequence,
            detected_at=ts_utc,
            results=results,
            processing_ms=elapsed_ms,
        )
        if self.on_batch is not None:
            self.on_batch(batch)
        return batch

    def iter_stream(
        self,
        reader: VideoSourceReader,
        *,
        max_frames: Optional[int] = None,
    ) -> Iterator[FrameInferenceBatch]:
        """Itera sobre frames de un VideoSourceReader sin persistir imágenes en disco."""
        for captured in reader.frames(max_frames=max_frames):
            yield self.process_frame(
                captured.image,
                frame_sequence=captured.frame_sequence,
                monotonic_ts=captured.monotonic_ts,
                raw_override_detections=captured.synthetic_detections,
            )


def _run_cli(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="ParkFlow Motor de Inferencia YOLO + OpenCV por Polígonos (PF-14)"
    )
    parser.add_argument(
        "--source",
        default=os.getenv("PARKFLOW_VIDEO_SOURCE", "synthetic:day"),
        help="Fuente de video: rtsp://..., ruta .mp4, índice de cámara o synthetic:day|synthetic:night_rain",
    )
    parser.add_argument("--polygons", type=Path, default=None, help="Ruta a JSON de polígonos")
    parser.add_argument("--frames", type=int, default=10, help="Número máximo de frames a procesar")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Ejecuta en consola sin enviar eventos HTTP al backend",
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Publica deltas JSON asíncronos hacia /api-backend (PF-15)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    calibration = load_polygon_calibration(args.polygons)
    engine = PolygonInferenceEngine(
        calibration=calibration,
        t_free_seconds=0.5 if args.source.startswith("synthetic") else None,
        t_occupied_seconds=0.5 if args.source.startswith("synthetic") else None,
        min_occupied_frames=2 if args.source.startswith("synthetic") else None,
        min_free_frames=2 if args.source.startswith("synthetic") else None,
    )

    publisher_runner = None
    if args.publish and not args.dry_run:
        from src.client.async_publisher import ThreadedAsyncPublisherRunner

        publisher_runner = ThreadedAsyncPublisherRunner.from_env()
        publisher_runner.start()

    try:
        with VideoSourceReader(args.source, calibration=calibration) as reader:
            for batch in engine.iter_stream(reader, max_frames=args.frames):
                if publisher_runner is not None:
                    publisher_runner.submit(batch)
                summary = ", ".join(
                    f"{r.slot_name}={r.status.value}(iou={r.iou:.2f})"
                    for r in batch.results[:4]
                )
                print(
                    f"[frame={batch.frame_sequence:03d}] {batch.parking_lot_id} "
                    f"({batch.processing_ms:.2f} ms) | {summary} ..."
                )
    finally:
        if publisher_runner is not None:
            metrics = publisher_runner.stop(drain_timeout=5.0)
            print(
                f"[PF-15] Publicados={metrics.batches_sent} | "
                f"Fallos={metrics.batches_failed} | "
                f"Reintentos={metrics.retries}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(_run_cli())
