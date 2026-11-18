"""Pruebas unitarias para pulsos de barreras (INT-HW-02) y sobrescritura con lock (RF-03)."""

import pytest
from fastapi.testclient import TestClient

from src.main import create_app
from src.security.jwt_handler import crear_token_acceso
from src.models.usuario import RolEnum


@pytest.fixture
def client():
    app = create_app()
    return TestClient(app)


def _auth_header(rol: str = RolEnum.VIGILANCIA.value, user_id: int = 10) -> dict:
    token = crear_token_acceso(
        id_usuario=user_id,
        correo="vigilancia@morelia.tecnm.mx",
        rol=rol,
    )
    return {"Authorization": f"Bearer {token}"}


def _seed_slot(client: TestClient) -> None:
    payload = {
        "parking_lot_id": "ITM-CAMPUS1",
        "camera_id": "cam-01",
        "frame_sequence": 1,
        "timestamp": "2026-11-18T12:00:00Z",
        "polygons": [
            {
                "polygon_id": "P-01",
                "slot_name": "A-01",
                "state": "Libre",
                "confidence": 0.95,
                "iou_ratio": 0.05,
                "vehicle_type": None,
            }
        ],
    }
    res = client.post("/api/inference/state", json=payload)
    assert res.status_code in (200, 201)


def test_pulso_barrera_actualiza_conteo(client: TestClient):
    r_in = client.post(
        "/api/accesos/barreras/pulso",
        json={"parking_lot_id": "ITM-CAMPUS1", "barrier_id": "PLUMA-NORTE", "evento": "ENTRADA"},
    )
    assert r_in.status_code == 200
    assert r_in.json()["metrics"]["barrier_net_vehicles"] == 1

    r_out = client.post(
        "/api/accesos/barreras/pulso",
        json={"parking_lot_id": "ITM-CAMPUS1", "barrier_id": "PLUMA-SUR", "evento": "SALIDA"},
    )
    assert r_out.status_code == 200
    assert r_out.json()["metrics"]["barrier_net_vehicles"] == 0


def test_sobrescritura_manual_bloquea_inferencia_hasta_liberacion(client: TestClient):
    _seed_slot(client)
    headers = _auth_header(RolEnum.VIGILANCIA.value, user_id=22)

    # 1. Forzar cajón por Obras con lock
    r_override = client.post(
        "/api/accesos/sobrescritura-manual",
        headers=headers,
        json={
            "parking_lot_id": "ITM-CAMPUS1",
            "polygon_id": "P-01",
            "estado": "Obras",
            "motivo": "Reparación de luminaria",
        },
    )
    assert r_override.status_code == 200
    assert r_override.json()["manual_lock"] is True
    assert r_override.json()["estado"] == "Obras"

    # 2. Cámara intenta reportarlo como Libre -> debe mantenerse en Obras
    r_cv = client.post(
        "/api/inference/state",
        json={
            "parking_lot_id": "ITM-CAMPUS1",
            "camera_id": "cam-01",
            "frame_sequence": 2,
            "timestamp": "2026-11-18T12:01:00Z",
            "polygons": [
                {
                    "polygon_id": "P-01",
                    "slot_name": "A-01",
                    "state": "Libre",
                    "confidence": 0.99,
                    "iou_ratio": 0.01,
                    "vehicle_type": None,
                }
            ],
        },
    )
    assert r_cv.status_code in (200, 201)
    assert r_cv.json()["locked_slots"] == 1
    assert r_cv.json()["occupied"] == 1

    # 3. Liberar bloqueo manual
    r_unlock = client.post(
        "/api/accesos/liberar-bloqueo",
        headers=headers,
        json={
            "parking_lot_id": "ITM-CAMPUS1",
            "polygon_id": "P-01",
            "motivo": "Obra terminada",
        },
    )
    assert r_unlock.status_code == 200
    assert r_unlock.json()["manual_lock"] is False