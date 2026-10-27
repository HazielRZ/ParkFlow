"""Pruebas de integración del endpoint `POST /api/v1/inference/states` (INT-SW-01)."""

from fastapi.testclient import TestClient

from src.main import create_app


def _valid_payload() -> dict:
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": "ITM-CAMPUS1-EST-NORTE",
        "timestamp": "2026-10-27T18:30:00Z",
        "frame_sequence": 1042,
        "polygons": [
            {
                "polygon_id": "poly-itm-001",
                "slot_name": "C-01",
                "state": "En maniobra",
                "confidence": 0.89,
                "iou_ratio": 0.38,
                "vehicle_type": "car",
            },
            {
                "polygon_id": "poly-itm-002",
                "slot_name": "C-02",
                "state": "Libre",
                "confidence": 0.96,
                "iou_ratio": 0.04,
                "vehicle_type": None,
            },
        ],
    }


def test_post_inference_states_returns_202_on_valid_contract() -> None:
    client = TestClient(create_app())
    response = client.post("/api/v1/inference/states", json=_valid_payload())
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "accepted"
    assert "received_at" in data


def test_post_inference_states_returns_422_on_invalid_state() -> None:
    client = TestClient(create_app())
    invalid = _valid_payload()
    invalid["polygons"][0]["state"] = "Bloqueado"
    response = client.post("/api/v1/inference/states", json=invalid)
    assert response.status_code == 422
    assert response.json()["error"] == "UnsupportedSlotStateError"


def test_post_inference_states_returns_400_on_missing_required_fields() -> None:
    client = TestClient(create_app())
    malformed = {"camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1"}
    response = client.post("/api/v1/inference/states", json=malformed)
    assert response.status_code == 400
