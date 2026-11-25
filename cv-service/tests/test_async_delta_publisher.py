"""Pruebas del detector de deltas y emisor HTTP asíncrono no bloqueante (PF-15)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import UUID

import httpx
import pytest

from src.client.async_publisher import AsyncDeltaPublisher, PublisherConfig
from src.client.delta_detector import SlotDeltaDetector
from src.models import FrameInferenceBatch, SpotInferenceResult, SlotState, VehicleType


def _make_batch(seq: int, status: SlotState, iou: float = 0.8) -> FrameInferenceBatch:
    now = datetime.now(timezone.utc)
    return FrameInferenceBatch(
        camera_id=UUID("e6f4776b-3122-4a0b-857e-3c22db92dcb1"),
        parking_lot_id="ITM-CAMPUS1-EST-NORTE",
        zone_id="C1N-Z1",
        frame_sequence=seq,
        detected_at=now,
        results=[
            SpotInferenceResult(
                spot_id="poly-itm-001",
                slot_name="C-01",
                zone_id="C1N-Z1",
                status=status,
                iou=iou,
                confidence=0.92,
                vehicle_class=None if status == SlotState.LIBRE else VehicleType.CAR,
                detected_at=now,
                frame_sequence=seq,
            )
        ],
    )


def test_delta_detector_filters_unchanged_and_flicker() -> None:
    detector = SlotDeltaDetector(debounce_frames=2, emit_initial=True)

    # Frame 0: emisión inicial Libre
    assert len(detector.extract_deltas(_make_batch(0, SlotState.LIBRE, 0.02).results)) == 1
    # Frame 1: sin cambios -> suprimido
    assert detector.extract_deltas(_make_batch(1, SlotState.LIBRE, 0.02).results) == []
    # Frame 2: parpadeo de 1 frame a En maniobra y regresa a Libre -> suprimido
    assert detector.extract_deltas(_make_batch(2, SlotState.EN_MANIOBRA, 0.35).results) == []
    assert detector.extract_deltas(_make_batch(3, SlotState.LIBRE, 0.03).results) == []

    # Cambio estable durante 2 frames -> emite delta
    assert detector.extract_deltas(_make_batch(4, SlotState.EN_MANIOBRA, 0.36).results) == []
    emitted = detector.extract_deltas(_make_batch(5, SlotState.EN_MANIOBRA, 0.38).results)
    assert len(emitted) == 1
    assert emitted[0].status == SlotState.EN_MANIOBRA


@pytest.mark.asyncio
async def test_async_publisher_retries_and_remains_non_blocking() -> None:
    attempts = 0
    received_bodies: list[dict] = []

    async def _handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        assert request.headers.get("X-Internal-API-Key") == "secret-key-pf15"
        if attempts == 1:
            return httpx.Response(503, json={"error": "TransientUnavailable"})
        await asyncio.sleep(0.02)
        body = json.loads(request.content.decode("utf-8"))
        received_bodies.append(body)
        return httpx.Response(
            202,
            json={"status": "accepted", "received_at": datetime.now(timezone.utc).isoformat(), "latency_ms": 21.5},
        )

    transport = httpx.MockTransport(_handler)
    config = PublisherConfig(
        backend_base_url="http://mock-backend:8000",
        internal_api_key="secret-key-pf15",
        debounce_frames=1,
        timeout_seconds=1.0,
        max_retries=2,
        backoff_base_seconds=0.01,
        backoff_max_seconds=0.05,
    )

    async with AsyncDeltaPublisher(config=config, transport=transport) as pub:
        # Encolado no bloqueante (< 5 ms aunque el backend tarde 20 ms + retry)
        count1 = pub.publish_batch_nowait(_make_batch(1, SlotState.LIBRE, 0.01))
        count2 = pub.publish_batch_nowait(_make_batch(1, SlotState.LIBRE, 0.01))  # sin cambio
        count3 = pub.publish_batch_nowait(_make_batch(2, SlotState.EN_MANIOBRA, 0.35))
        assert count1 == 1
        assert count2 == 0
        assert count3 == 1
        await pub.drain(timeout=3.0)

    assert attempts == 3  # 1 fallo 503 + 2 envíos exitosos
    assert pub.metrics.batches_sent == 2
    assert pub.metrics.retries == 1
    assert pub.metrics.batches_failed == 0
    assert len(received_bodies) == 2
    assert received_bodies[1]["polygons"][0]["zone_id"] == "C1N-Z1"


@pytest.mark.asyncio
async def test_async_publisher_survives_total_backend_outage() -> None:
    async def _down_handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Backend caído")

    config = PublisherConfig(
        backend_base_url="http://mock-backend:8000",
        debounce_frames=1,
        timeout_seconds=0.2,
        max_retries=1,
        backoff_base_seconds=0.01,
        backoff_max_seconds=0.02,
    )

    async with AsyncDeltaPublisher(config=config, transport=httpx.MockTransport(_down_handler)) as pub:
        pub.publish_batch_nowait(_make_batch(1, SlotState.OCUPADO, 0.8))
        await pub.drain(timeout=2.0)

    assert pub.metrics.batches_sent == 0
    assert pub.metrics.batches_failed == 1
    assert pub.metrics.retries == 1
