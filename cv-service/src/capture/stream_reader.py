"""Ingestión de streams de video RTSP / archivos locales para ParkFlow."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RtspFrameGrabber:
    """Configuración base del lector de frames RTSP."""

    camera_id: str
    stream_url: str
    target_fps: int = 5
