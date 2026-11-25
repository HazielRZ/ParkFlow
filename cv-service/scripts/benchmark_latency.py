"""Benchmark de latencia end-to-end RNF-01 (< 5 s ingestión, <= 3 s WebSocket).

Cumple aislamiento RNF-05: levanta `/api-backend` como subproceso independiente
sin importar su código fuente y mide HTTP + WebSocket reales.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List
from uuid import UUID

import httpx
import websockets

CV_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = CV_ROOT.parent
if str(CV_ROOT) not in sys.path:
    sys.path.insert(0, str(CV_ROOT))

from src.client.async_publisher import AsyncDeltaPublisher, PublisherConfig  # noqa: E402
from src.models import FrameInferenceBatch, SpotInferenceResult, SlotState, VehicleType  # noqa: E402


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _percentile(values: List[float], pct: float) -> float:
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, math.ceil((pct / 100.0) * len(ordered)) - 1))
    return round(ordered[idx], 3)


async def _wait_health(base_url: str, timeout_s: float = 15.0) -> None:
    deadline = time.monotonic() + timeout_s
    async with httpx.AsyncClient(timeout=1.0) as client:
        while time.monotonic() < deadline:
            try:
                resp = await client.get(f"{base_url}/health")
                if resp.status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            await asyncio.sleep(0.15)
    raise TimeoutError(f"El backend en {base_url} no respondió /health en {timeout_s}s.")


async def run_benchmark(events: int = 40, backend_url: str | None = None) -> int:
    proc = None
    if backend_url is None:
        port = _free_port()
        backend_url = f"http://127.0.0.1:{port}"
        backend_dir = REPO_ROOT / "api-backend"
        env = dict(os.environ)
        env["PARKFLOW_INFERENCE_SCHEMA_PATH"] = str(
            REPO_ROOT / "contracts" / "json-schema" / "inference-state.schema.json"
        )
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

    ws_url = backend_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws/parking-states"
    ws_latencies_ms: List[float] = []

    try:
        await _wait_health(backend_url)
        config = PublisherConfig(
            backend_base_url=backend_url,
            schema_path=REPO_ROOT / "contracts" / "json-schema" / "inference-state.schema.json",
            debounce_frames=1,
            emit_initial=True,
            timeout_seconds=1.5,
            max_retries=2,
        )

        async with websockets.connect(ws_url) as ws:
            received_events = 0

            async def _ws_consumer() -> None:
                nonlocal received_events
                while received_events < events:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    if msg.get("event") == "parking_state_updated":
                        detected = datetime.fromisoformat(
                            str(msg["timestamp"]).replace("Z", "+00:00")
                        )
                        now = datetime.now(timezone.utc)
                        ws_latencies_ms.append(
                            max(0.0, round((now - detected).total_seconds() * 1000.0, 3))
                        )
                        received_events += 1

            consumer_task = asyncio.create_task(_ws_consumer())
            states_cycle = (SlotState.LIBRE, SlotState.EN_MANIOBRA, SlotState.OCUPADO)
            camera_uuid = UUID("e6f4776b-3122-4a0b-857e-3c22db92dcb1")

            async with AsyncDeltaPublisher(config=config) as publisher:
                for seq in range(events):
                    st = states_cycle[seq % len(states_cycle)]
                    batch = FrameInferenceBatch(
                        camera_id=camera_uuid,
                        parking_lot_id="ITM-CAMPUS1-EST-NORTE",
                        zone_id="C1N-Z1",
                        frame_sequence=seq,
                        detected_at=datetime.now(timezone.utc),
                        results=[
                            SpotInferenceResult(
                                spot_id="poly-itm-001",
                                slot_name="C-01",
                                zone_id="C1N-Z1",
                                status=st,
                                iou=0.03 if st == SlotState.LIBRE else (0.35 if st == SlotState.EN_MANIOBRA else 0.82),
                                confidence=0.94,
                                vehicle_class=None if st == SlotState.LIBRE else VehicleType.CAR,
                                detected_at=datetime.now(timezone.utc),
                                frame_sequence=seq,
                            )
                        ],
                    )
                    publisher.publish_batch_nowait(batch)
                    await asyncio.sleep(0.01)

                await publisher.drain(timeout=10.0)
                metrics = publisher.metrics

            await asyncio.wait_for(consumer_task, timeout=10.0)

        async with httpx.AsyncClient(timeout=2.0) as client:
            backend_metrics = (await client.get(f"{backend_url}/api/v1/inference/metrics")).json()

        e2e_samples = metrics.latency_samples_ms
        p95_ing = _percentile(e2e_samples, 95)
        max_ing = round(max(e2e_samples), 3)
        p50_ing = _percentile(e2e_samples, 50)
        p95_ws = _percentile(ws_latencies_ms, 95)
        max_ws = round(max(ws_latencies_ms), 3)

        print(f"[RNF-01 Benchmark] Eventos emitidos: {metrics.batches_sent}/{events} | Fallos: {metrics.batches_failed}")
        print(f"  - Ingestión CV -> Backend : p50={p50_ing} ms | p95={p95_ing} ms | max={max_ing} ms (SLA <= 5000 ms)")
        print(f"  - Propagación WS E2E      : p95={p95_ws} ms | max={max_ws} ms (Meta <= 3000 ms)")
        print(f"  - Backend /metrics        : {backend_metrics}")

        ok = (
            metrics.batches_sent == events
            and metrics.batches_failed == 0
            and p95_ing <= 5000.0
            and max_ing <= 5000.0
            and p95_ws <= 3000.0
        )
        return 0 if ok else 1
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=5.0)
            except subprocess.TimeoutExpired:
                proc.kill()


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark de latencia RNF-01 (< 5 s)")
    parser.add_argument("--events", type=int, default=40, help="Cantidad de deltas a emitir")
    parser.add_argument("--backend-url", default=None, help="URL opcional de backend ya iniciado")
    args = parser.parse_args()
    return asyncio.run(run_benchmark(events=args.events, backend_url=args.backend_url))


if __name__ == "__main__":
    raise SystemExit(main())
