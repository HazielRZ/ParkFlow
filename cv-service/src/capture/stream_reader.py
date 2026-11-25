"""Ingestión en memoria RAM de streams RTSP, cámaras locales, video y secuencias sintéticas (OT-01)."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Iterator, List, Optional, Tuple

import cv2
import numpy as np

from src.polygon_mapper.polygon_loader import ParkingZoneCalibration
from src.rtsp_stream_reader import RTSPStreamReader

logger = logging.getLogger("cv-service.capture")


@dataclass
class RtspFrameGrabber:
    """Configuración base del lector de frames RTSP."""

    camera_id: str
    stream_url: str
    target_fps: int = 5


@dataclass
class CapturedFrame:
    """Contenedor en memoria de un frame capturado y anotaciones sintéticas opcionales."""

    frame_sequence: int
    image: np.ndarray
    monotonic_ts: float
    synthetic_detections: Optional[List[dict]] = None


class VideoSourceReader:
    """Lector unificado de video (RTSP, webcam, archivo local o modo sintético) sin disco."""

    def __init__(
        self,
        source: Optional[str] = None,
        *,
        calibration: Optional[ParkingZoneCalibration] = None,
        target_fps: Optional[float] = None,
    ) -> None:
        self.source = source or os.getenv("PARKFLOW_VIDEO_SOURCE", "synthetic:day")
        self.calibration = calibration
        self.target_fps = target_fps or float(os.getenv("PARKFLOW_TARGET_FPS", "5.0"))
        self._rtsp_reader: Optional[RTSPStreamReader] = None
        self._cap: Optional[cv2.VideoCapture] = None
        self._frame_seq = 0

    def __enter__(self) -> "VideoSourceReader":
        if self.source.startswith("rtsp://") or self.source.startswith("rtsps://"):
            self._rtsp_reader = RTSPStreamReader(self.source).start()
        elif not self.source.startswith("synthetic"):
            cap_source: object = int(self.source) if self.source.isdigit() else self.source
            self._cap = cv2.VideoCapture(cap_source)
            if not self._cap.isOpened():
                self._cap.release()
                self._cap = None
                raise RuntimeError(f"No se pudo abrir la fuente de video: {self.source}")
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def close(self) -> None:
        if self._rtsp_reader is not None:
            self._rtsp_reader.stop()
            self._rtsp_reader = None
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def _build_synthetic_frame(self, seq: int) -> CapturedFrame:
        night_mode = "night" in self.source or "rain" in self.source
        width = self.calibration.reference_width if self.calibration else 1280
        height = self.calibration.reference_height if self.calibration else 720

        base_val = 28 if night_mode else 165
        frame = np.full((height, width, 3), base_val, dtype=np.uint8)

        detections: List[dict] = []
        if self.calibration is not None:
            for idx, spot in enumerate(self.calibration.spots):
                pts = np.array(spot.resolve_pixels(width, height), dtype=np.int32)
                cv2.polylines(frame, [pts], isClosed=True, color=(220, 220, 220), thickness=2)
                x_min, y_min = np.min(pts, axis=0)
                x_max, y_max = np.max(pts, axis=0)

                # Simulación determinista:
                # - Cajones pares ocupados de forma estable
                # - Primer cajón transita Libre -> En maniobra -> Ocupado durante la secuencia
                occupied = False
                maneuvering = False
                if idx == 0:
                    phase = seq % 10
                    if 2 <= phase <= 4:
                        maneuvering = True
                    elif phase >= 5:
                        occupied = True
                elif idx % 2 == 1:
                    occupied = True

                if occupied:
                    pad_x = max(4, int((x_max - x_min) * 0.06))
                    pad_y = max(4, int((y_max - y_min) * 0.06))
                    bx1, by1 = int(x_min + pad_x), int(y_min + pad_y)
                    bx2, by2 = int(x_max - pad_x), int(y_max - pad_y)
                    cv2.rectangle(frame, (bx1, by1), (bx2, by2), (55, 85, 195), -1)
                    detections.append(
                        {"class_id": 2, "confidence": 0.93, "bbox": [bx1, by1, bx2, by2]}
                    )
                elif maneuvering:
                    # Traslape parcial (~35% IoU) para probar "En maniobra"
                    w = x_max - x_min
                    h = y_max - y_min
                    bx1, by1 = int(x_min + w * 0.45), int(y_min + h * 0.1)
                    bx2, by2 = int(x_max + w * 0.45), int(y_max - h * 0.1)
                    cv2.rectangle(frame, (bx1, by1), (bx2, by2), (65, 150, 210), -1)
                    detections.append(
                        {"class_id": 2, "confidence": 0.89, "bbox": [bx1, by1, bx2, by2]}
                    )

        if night_mode:
            # Simular trazas leves de lluvia en RAM sin tocar disco
            rng = np.random.default_rng(seed=seq + 42)
            for _ in range(45):
                rx = int(rng.integers(0, width))
                ry = int(rng.integers(0, height))
                cv2.line(frame, (rx, ry), (min(width - 1, rx + 3), min(height - 1, ry + 12)), (110, 120, 130), 1)

        return CapturedFrame(
            frame_sequence=seq,
            image=frame,
            monotonic_ts=float(seq) / max(0.5, self.target_fps),
            synthetic_detections=detections,
        )

    def frames(self, max_frames: Optional[int] = None) -> Iterator[CapturedFrame]:
        """Genera frames en memoria RAM hasta `max_frames` o fin del stream."""
        emitted = 0
        while max_frames is None or emitted < max_frames:
            seq = self._frame_seq
            self._frame_seq += 1

            if self.source.startswith("synthetic"):
                yield self._build_synthetic_frame(seq)
                emitted += 1
                continue

            if self._rtsp_reader is not None:
                ok, frame, ts = self._rtsp_reader.read(timeout=2.0)
                if not ok or frame is None:
                    continue
                yield CapturedFrame(frame_sequence=seq, image=frame, monotonic_ts=ts)
                emitted += 1
                continue

            if self._cap is not None:
                ok, frame = self._cap.read()
                if not ok or frame is None:
                    break
                yield CapturedFrame(
                    frame_sequence=seq,
                    image=frame,
                    monotonic_ts=time.monotonic(),
                )
                emitted += 1
                continue

            break
