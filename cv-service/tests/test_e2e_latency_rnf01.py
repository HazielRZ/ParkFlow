"""Prueba de integración end-to-end de latencia RNF-01 (<= 5 s) respetando aislamiento RNF-05."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import numpy as np
import pytest
import websockets

from src.client.async_publisher import AsyncDeltaPublisher, PublisherConfig
from src.detector.yolo_detector import YoloVehicleDetector
from src.engine import PolygonInferenceEngine
from src.polygon_mapper.polygon_loader import load_polygon_calibration


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.mark.asyncio
async def test_e2e_cv_deltas_to_backend_and_ws_within_5s() -> None:
    cv_root = Path(__file__).resolve().parents[1]
    repo_root = cv_root.parent
    backend_dir = repo_root / "api-backend"
    schema_path = repo_root / "contracts" / "json-schema" / "inference-state.schema.json"

    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"
    ws_url = f"ws://127.0.0.1:{port}/ws/parking-states"

    env = dict(os.environ)
    env["PARKFLOW_INFERENCE_SCHEMA_PATH"] = str(schema_path)

    proc = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "src.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=str(backend_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    try:
        # Esperar a que /api-backend responda /health
        async with httpx.AsyncClient(timeout=1.0) as client:
            for _ in range(60):
                try:
                    resp = await client.get(f"{base_url}/health")
                    if resp.status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                await asyncio.sleep(0.15)
            else:
                pytest.fail("api-backend no arrancó a tiempo")

        calibration = load_polygon_calibration()
        engine = PolygonInferenceEngine(
            calibration=calibration,
            detector=YoloVehicleDetector(),
            t_free_seconds=1.0,
            t_occupied_seconds=1.0,
            min_occupied_frames=1,
            min_free_frames=1,
        )
        config = PublisherConfig(
            backend_base_url=base_url,
            schema_path=schema_path,
            debounce_frames=1,
            emit_initial=True,
            timeout_seconds=1.5,
            max_retries=2,
        )

        # Secuencia con transiciones reales + frames redundantes que deben suprimirse:
        # frame 0: inicial todos Libre (emite #1)
        # frame 1: A-01 -> En maniobra (emite #2)
        # frame 2: A-01 sigue en En maniobra mientras espera confirmación temporal (suprimido)
        # frame 3: A-01 -> Ocupado (emite #3)
        # frame 4: A-01 -> En maniobra al salir (emite #4)
        # frame 5: A-01 sigue en En maniobra mientras espera t_free_seconds (suprimido)
        # frame 6: A-01 -> Libre (emite #5)
        frame_buf = np.full((720, 1280, 3), 160, dtype=np.uint8)
        a01_occ = [{"class_id": 2, "confidence": 0.94, "bbox": [108, 96, 252, 224]}]
        a01_man = [{"class_id": 2, "confidence": 0.90, "bbox": [180, 96, 340, 224]}]
        step_dets = [
            ([], 0.0),          # frame 0 -> delta 1
            (a01_man, 0.5),     # frame 1 -> delta 2
            (a01_occ, 1.0),     # frame 2 -> sin cambio (En maniobra)
            (a01_occ, 2.2),     # frame 3 -> delta 3 (Ocupado)
            (a01_man, 3.0),     # frame 4 -> delta 4 (En maniobra)
            ([], 4.2),          # frame 5 -> sin cambio (En maniobra)
            ([], 5.5),          # frame 6 -> delta 5 (Libre)
        ]
        expected_deltas = 5

        ws_messages: list[dict] = []
        ws_latencies_ms: list[float] = []

        async with websockets.connect(ws_url) as ws:
            async def _read_ws() -> None:
                while len(ws_messages) < expected_deltas:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    if msg.get("event") == "parking_state_updated":
                        ts = datetime.fromisoformat(str(msg["timestamp"]).replace("Z", "+00:00"))
                        ws_latencies_ms.append(
                            max(0.0, (datetime.now(timezone.utc) - ts).total_seconds() * 1000.0)
                        )
                        ws_messages.append(msg)

            reader_task = asyncio.create_task(_read_ws())

            async with AsyncDeltaPublisher(config=config) as pub:
                for seq, (dets, mono_ts) in enumerate(step_dets):
                    batch = engine.process_frame(
                        frame_buf,
                        frame_sequence=seq,
                        detected_at=datetime.now(timezone.utc),
                        monotonic_ts=mono_ts,
                        raw_override_detections=dets,
                    )
                    pub.publish_batch_nowait(batch)
                    await asyncio.sleep(0.02)
                await pub.drain(timeout=5.0)
                pub_metrics = pub.metrics

            await asyncio.wait_for(reader_task, timeout=5.0)

        async with httpx.AsyncClient(timeout=2.0) as client:
            backend_metrics = (await client.get(f"{base_url}/api/v1/inference/metrics")).json()

        assert pub_metrics.batches_sent == expected_deltas
        assert pub_metrics.batches_failed == 0
        assert max(pub_metrics.latency_samples_ms) <= 5000.0
        assert max(ws_latencies_ms) <= 3000.0
        assert backend_metrics["within_sla"] is True
        assert backend_metrics["max_ms"] <= 5000.0
        assert backend_metrics["sla_violations"] == 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            proc.kill()
