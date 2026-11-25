"""Pruebas de latencia RNF-01 (<= 5 s), métricas, WebSocket y API Key interna en `/api-backend`."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from src.main import create_app


def _payload(state: str = "Ocupado", delta_seconds: float = 0.05) -> dict:
    detected_at = (datetime.now(timezone.utc) - timedelta(seconds=delta_seconds)).isoformat().replace("+00:00", "Z")
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": "ITM-CAMPUS1-EST-NORTE",
        "timestamp": detected_at,
        "frame_sequence": 42,
        "polygons": [
            {
                "polygon_id": "poly-itm-001",
                "zone_id": "C1N-Z1",
                "slot_name": "C-01",
                "state": state,
                "confidence": 0.93,
                "iou_ratio": 0.81,
                "vehicle_type": "car" if state != "Libre" else None,
            }
        ],
    }


def test_inference_endpoint_measures_latency_and_propagates_websocket() -> None:
    app = create_app()
    client = TestClient(app)

    with client.websocket_connect("/ws/parking-states") as ws:
        resp = client.post("/api/v1/inference/states", json=_payload("Ocupado", delta_seconds=0.05))
        assert resp.status_code == 202
        body = resp.json()
        assert body["status"] == "accepted"
        assert body["processed_polygons"] == 1
        assert 0.0 <= body["latency_ms"] <= 5000.0

        ws_event = ws.receive_json()
        assert ws_event["event"] == "parking_state_updated"
        assert ws_event["polygons"][0]["zone_id"] == "C1N-Z1"
        assert ws_event["latency_ms"] == body["latency_ms"]

    metrics = client.get("/api/v1/inference/metrics").json()
    assert metrics["count"] == 1
    assert metrics["within_sla"] is True
    assert metrics["sla_violations"] == 0
    assert app.state.parking_state_service.obtener_cajon("ITM-CAMPUS1-EST-NORTE", "poly-itm-001").zone_id == "C1N-Z1"


def test_internal_api_key_enforced_when_configured(monkeypatch) -> None:
    monkeypatch.setenv("PARKFLOW_INTERNAL_API_KEY", "itm-pf15-secret")
    client = TestClient(create_app())

    r_no_key = client.post("/api/v1/inference/states", json=_payload())
    assert r_no_key.status_code == 401

    r_bad_key = client.post(
        "/api/v1/inference/states",
        json=_payload(),
        headers={"X-Internal-API-Key": "wrong"},
    )
    assert r_bad_key.status_code == 401

    r_ok = client.post(
        "/api/v1/inference/states",
        json=_payload(),
        headers={"X-Internal-API-Key": "itm-pf15-secret"},
    )
    assert r_ok.status_code == 202
