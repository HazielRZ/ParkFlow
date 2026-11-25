"""Cliente HTTP asíncrono no bloqueante para emisión de deltas JSON (< 5 s, PF-15).

Trazabilidad ERS:
- INT-SW-01: Envía eventos validados contra `contracts/json-schema/inference-state.schema.json`.
- RNF-01: Cola asíncrona en segundo plano para no bloquear el loop YOLO/OpenCV, con timeouts
  cortos, reintentos con backoff acotado y logging estructurado de latencia end-to-end.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Tuple

import httpx
from jsonschema import Draft202012Validator

from src.client.delta_detector import SlotDeltaDetector
from src.models import FrameInferenceBatch, ParkFlowPolygonInferencePayload

logger = logging.getLogger("cv-service.publisher")


def _parse_bool(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def _resolve_schema_path(explicit: Optional[Path] = None) -> Optional[Path]:
    if explicit is not None:
        return explicit
    env_path = os.getenv("PARKFLOW_INFERENCE_SCHEMA_PATH")
    if env_path:
        return Path(env_path)
    candidate = (
        Path(__file__).resolve().parents[3]
        / "contracts"
        / "json-schema"
        / "inference-state.schema.json"
    )
    return candidate if candidate.exists() else None


@dataclass(frozen=True)
class PublisherConfig:
    """Parámetros configurables del emisor asíncrono vía variables de entorno."""

    backend_base_url: str = "http://api-backend:8000"
    internal_api_key: str = ""
    schema_path: Optional[Path] = None
    debounce_frames: int = 2
    emit_initial: bool = True
    timeout_seconds: float = 1.5
    max_retries: int = 3
    backoff_base_seconds: float = 0.15
    backoff_max_seconds: float = 1.0
    queue_maxsize: int = 256

    @classmethod
    def from_env(cls) -> "PublisherConfig":
        return cls(
            backend_base_url=os.getenv("PARKFLOW_BACKEND_URL", "http://api-backend:8000").rstrip("/"),
            internal_api_key=os.getenv("PARKFLOW_INTERNAL_API_KEY", "").strip(),
            schema_path=_resolve_schema_path(),
            debounce_frames=max(1, int(os.getenv("PARKFLOW_DELTA_DEBOUNCE_FRAMES", "2"))),
            emit_initial=_parse_bool(os.getenv("PARKFLOW_DELTA_EMIT_INITIAL"), True),
            timeout_seconds=float(os.getenv("PARKFLOW_HTTP_TIMEOUT_SECONDS", "1.5")),
            max_retries=max(0, int(os.getenv("PARKFLOW_HTTP_MAX_RETRIES", "3"))),
            backoff_base_seconds=float(os.getenv("PARKFLOW_HTTP_BACKOFF_BASE_SECONDS", "0.15")),
            backoff_max_seconds=float(os.getenv("PARKFLOW_HTTP_BACKOFF_MAX_SECONDS", "1.0")),
            queue_maxsize=max(8, int(os.getenv("PARKFLOW_PUBLISHER_QUEUE_SIZE", "256"))),
        )


@dataclass
class PublisherMetrics:
    """Métricas operativas y de latencia acumuladas por el emisor."""

    batches_enqueued: int = 0
    batches_sent: int = 0
    deltas_sent: int = 0
    batches_failed: int = 0
    dropped_batches: int = 0
    retries: int = 0
    last_http_rtt_ms: float = 0.0
    last_e2e_latency_ms: float = 0.0
    latency_samples_ms: List[float] = field(default_factory=list)


@dataclass(frozen=True)
class _QueuedDispatch:
    body: dict[str, Any]
    detected_at: datetime
    frame_sequence: int
    deltas_count: int


class AsyncDeltaPublisher:
    """Publicador HTTP asíncrono con cola acotada, reintentos y validación de contrato."""

    INGESTION_PATH = "/api/v1/inference/states"

    def __init__(
        self,
        config: Optional[PublisherConfig] = None,
        *,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        delta_detector: Optional[SlotDeltaDetector] = None,
    ) -> None:
        self.config = config or PublisherConfig.from_env()
        self._transport = transport
        self.delta_detector = delta_detector or SlotDeltaDetector(
            debounce_frames=self.config.debounce_frames,
            emit_initial=self.config.emit_initial,
        )
        self.metrics = PublisherMetrics()

        self._validator: Optional[Draft202012Validator] = None
        resolved_schema = _resolve_schema_path(self.config.schema_path)
        if resolved_schema is not None and resolved_schema.is_file():
            with resolved_schema.open("r", encoding="utf-8") as fh:
                schema_data = json.load(fh)
            Draft202012Validator.check_schema(schema_data)
            self._validator = Draft202012Validator(schema_data)

        self._queue: Optional[asyncio.Queue[Optional[_QueuedDispatch]]] = None
        self._client: Optional[httpx.AsyncClient] = None
        self._worker_task: Optional[asyncio.Task[None]] = None
        self._running = False

    @property
    def endpoint_url(self) -> str:
        return f"{self.config.backend_base_url.rstrip('/')}{self.INGESTION_PATH}"

    async def start(self) -> "AsyncDeltaPublisher":
        """Inicia la sesión httpx persistente y el worker en segundo plano."""
        if self._running:
            return self
        self._queue = asyncio.Queue(maxsize=self.config.queue_maxsize)
        headers = {"Content-Type": "application/json"}
        if self.config.internal_api_key:
            headers["X-Internal-API-Key"] = self.config.internal_api_key

        client_kwargs: dict[str, Any] = {
            "timeout": httpx.Timeout(self.config.timeout_seconds),
            "headers": headers,
        }
        if self._transport is not None:
            client_kwargs["transport"] = self._transport

        self._client = httpx.AsyncClient(**client_kwargs)
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop(), name="pf15-delta-publisher")
        return self

    async def __aenter__(self) -> "AsyncDeltaPublisher":
        return await self.start()

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.stop()

    def build_delta_payload(
        self, batch: FrameInferenceBatch
    ) -> Optional[Tuple[dict[str, Any], int]]:
        """Extrae deltas estabilizados del batch y valida el JSON contra INT-SW-01."""
        deltas = self.delta_detector.extract_deltas(batch.results)
        if not deltas:
            return None

        payload = ParkFlowPolygonInferencePayload(
            camera_id=batch.camera_id,
            parking_lot_id=batch.parking_lot_id,
            timestamp=batch.detected_at,
            frame_sequence=batch.frame_sequence,
            polygons=[item.to_polygon_state() for item in deltas],
        )
        body = payload.to_contract_dict()
        if self._validator is not None:
            self._validator.validate(body)
        return body, len(deltas)

    def publish_batch_nowait(self, batch: FrameInferenceBatch) -> int:
        """Encola deltas del frame sin bloquear el loop de inferencia YOLO/OpenCV."""
        built = self.build_delta_payload(batch)
        if built is None:
            return 0

        if not self._running or self._queue is None:
            raise RuntimeError("AsyncDeltaPublisher debe iniciarse con `await start()` antes de encolar.")

        body, count = built
        item = _QueuedDispatch(
            body=body,
            detected_at=batch.detected_at,
            frame_sequence=batch.frame_sequence,
            deltas_count=count,
        )

        if self._queue.full():
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                self.metrics.dropped_batches += 1
            except asyncio.QueueEmpty:
                pass

        self._queue.put_nowait(item)
        self.metrics.batches_enqueued += 1
        return count

    async def drain(self, timeout: Optional[float] = 5.0) -> None:
        """Espera a que la cola actual se procese por completo."""
        if self._queue is None:
            return
        if timeout is None:
            await self._queue.join()
        else:
            await asyncio.wait_for(self._queue.join(), timeout=timeout)

    async def stop(self, drain_timeout: float = 5.0) -> PublisherMetrics:
        """Drena pendientes, detiene el worker y cierra conexiones HTTP limpiamente."""
        if not self._running:
            return self.metrics

        try:
            await self.drain(timeout=drain_timeout)
        except asyncio.TimeoutError:
            logger.warning(
                json.dumps({"event": "publisher_drain_timeout", "timeout_s": drain_timeout})
            )

        self._running = False
        if self._queue is not None:
            # Si sigue llena tras timeout, libera un espacio para la señal de paro
            if self._queue.full():
                try:
                    self._queue.get_nowait()
                    self._queue.task_done()
                    self.metrics.dropped_batches += 1
                except asyncio.QueueEmpty:
                    pass
            await self._queue.put(None)

        if self._worker_task is not None:
            await self._worker_task
            self._worker_task = None

        if self._client is not None:
            await self._client.aclose()
            self._client = None

        return self.metrics

    async def _worker_loop(self) -> None:
        assert self._queue is not None
        while True:
            item = await self._queue.get()
            if item is None:
                self._queue.task_done()
                break
            try:
                await self._send_with_retries(item)
            except Exception as exc:  # noqa: BLE001 - el worker nunca debe caer
                self.metrics.batches_failed += 1
                logger.error(
                    json.dumps(
                        {
                            "event": "publisher_unexpected_error",
                            "frame_sequence": item.frame_sequence,
                            "error": str(exc),
                        }
                    )
                )
            finally:
                self._queue.task_done()

    async def _send_with_retries(self, item: _QueuedDispatch) -> None:
        assert self._client is not None
        total_attempts = 1 + self.config.max_retries
        last_error = ""

        for attempt in range(total_attempts):
            req_start = time.perf_counter()
            try:
                response = await self._client.post(self.endpoint_url, json=item.body)
                rtt_ms = round((time.perf_counter() - req_start) * 1000.0, 3)

                if response.status_code in (200, 202):
                    now_utc = datetime.now(timezone.utc)
                    detected = (
                        item.detected_at
                        if item.detected_at.tzinfo is not None
                        else item.detected_at.replace(tzinfo=timezone.utc)
                    )
                    e2e_ms = max(0.0, round((now_utc - detected).total_seconds() * 1000.0, 3))
                    try:
                        resp_json = response.json()
                        if isinstance(resp_json, dict) and "latency_ms" in resp_json:
                            e2e_ms = float(resp_json["latency_ms"])
                    except ValueError:
                        pass

                    self.metrics.batches_sent += 1
                    self.metrics.deltas_sent += item.deltas_count
                    self.metrics.last_http_rtt_ms = rtt_ms
                    self.metrics.last_e2e_latency_ms = e2e_ms
                    self.metrics.latency_samples_ms.append(e2e_ms)

                    logger.info(
                        json.dumps(
                            {
                                "event": "delta_published",
                                "frame_sequence": item.frame_sequence,
                                "deltas_count": item.deltas_count,
                                "status_code": response.status_code,
                                "http_rtt_ms": rtt_ms,
                                "end_to_end_latency_ms": e2e_ms,
                                "attempt": attempt + 1,
                            }
                        )
                    )
                    return

                # Errores 4xx de contrato/auth no se reintentan
                if 400 <= response.status_code < 500:
                    self.metrics.batches_failed += 1
                    logger.error(
                        json.dumps(
                            {
                                "event": "delta_rejected_client_error",
                                "frame_sequence": item.frame_sequence,
                                "status_code": response.status_code,
                                "detail": response.text[:256],
                            }
                        )
                    )
                    return

                last_error = f"HTTP {response.status_code}"
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = f"{type(exc).__name__}: {exc}"

            if attempt < total_attempts - 1:
                self.metrics.retries += 1
                backoff = min(
                    self.config.backoff_max_seconds,
                    self.config.backoff_base_seconds * (2**attempt),
                )
                logger.warning(
                    json.dumps(
                        {
                            "event": "delta_publish_retry",
                            "frame_sequence": item.frame_sequence,
                            "attempt": attempt + 1,
                            "backoff_s": round(backoff, 3),
                            "error": last_error,
                        }
                    )
                )
                await asyncio.sleep(backoff)

        self.metrics.batches_failed += 1
        logger.error(
            json.dumps(
                {
                    "event": "delta_publish_failed",
                    "frame_sequence": item.frame_sequence,
                    "attempts": total_attempts,
                    "error": last_error,
                }
            )
        )


class ThreadedAsyncPublisherRunner:
    """Ejecuta `AsyncDeltaPublisher` en un hilo dedicado para loops síncronos OpenCV."""

    def __init__(self, config: Optional[PublisherConfig] = None) -> None:
        self.config = config or PublisherConfig.from_env()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._publisher: Optional[AsyncDeltaPublisher] = None
        self._ready = threading.Event()

    @classmethod
    def from_env(cls) -> "ThreadedAsyncPublisherRunner":
        return cls(config=PublisherConfig.from_env())

    def start(self) -> "ThreadedAsyncPublisherRunner":
        if self._thread is not None and self._thread.is_alive():
            return self
        self._ready.clear()
        self._thread = threading.Thread(
            target=self._thread_main,
            name="pf15-async-publisher-loop",
            daemon=True,
        )
        self._thread.start()
        self._ready.wait(timeout=5.0)
        return self

    def _thread_main(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        self._publisher = AsyncDeltaPublisher(config=self.config)
        loop.run_until_complete(self._publisher.start())
        self._ready.set()
        try:
            loop.run_forever()
        finally:
            loop.run_until_complete(self._publisher.stop(drain_timeout=3.0))
            loop.close()

    def submit(self, batch: FrameInferenceBatch) -> None:
        """Envía un batch de forma no bloqueante al hilo asyncio del publicador."""
        if self._loop is None or self._publisher is None or not self._loop.is_running():
            raise RuntimeError("ThreadedAsyncPublisherRunner no está iniciado.")
        self._loop.call_soon_threadsafe(self._publisher.publish_batch_nowait, batch)

    def stop(self, drain_timeout: float = 5.0) -> PublisherMetrics:
        if self._loop is None or self._publisher is None:
            return PublisherMetrics()
        fut = asyncio.run_coroutine_threadsafe(
            self._publisher.drain(timeout=drain_timeout),
            self._loop,
        )
        try:
            fut.result(timeout=drain_timeout + 1.0)
        except Exception:
            pass
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=drain_timeout + 1.0)
        metrics = self._publisher.metrics
        self._thread = None
        self._loop = None
        return metrics


def _run_cli(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Emisor asíncrono de deltas JSON ParkFlow (PF-15)"
    )
    parser.add_argument(
        "--source",
        default=os.getenv("PARKFLOW_VIDEO_SOURCE", "synthetic:day"),
        help="Fuente de video para el motor de inferencia",
    )
    parser.add_argument("--frames", type=int, default=20, help="Frames a procesar")
    parser.add_argument("--demo", action="store_true", help="Ejecuta demostración con fuente sintética")
    args = parser.parse_args(argv)

    from src.engine import _run_cli as run_engine_cli

    engine_args = ["--source", args.source, "--frames", str(args.frames), "--publish"]
    return run_engine_cli(engine_args)


if __name__ == "__main__":
    raise SystemExit(_run_cli())
