"""Pruebas unitarias para pulsos de barreras (INT-HW-02) y sobrescritura con lock (RF-03)."""

from fastapi.testclient import TestClient

from src.main import create_app
from src.services.audit_service import auditoria_service

LOTE = "ITM-CAMPUS1-EST-NORTE"
POLIGONO = "poly-itm-001"
CREDENCIALES_VIGILANCIA = {"correo": "vigilancia@morelia.tecnm.mx", "password": "Vigila123*"}
ID_VIGILANCIA = 2


def _payload_inferencia(estado: str, frame_sequence: int = 1) -> dict:
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": LOTE,
        "timestamp": "2026-11-18T12:00:00Z",
        "frame_sequence": frame_sequence,
        "polygons": [
            {
                "polygon_id": POLIGONO,
                "slot_name": "C-01",
                "state": estado,
                "confidence": 0.95,
                "iou_ratio": 0.05,
                "vehicle_type": None,
            }
        ],
    }


def _cliente_con_cajon(estado: str = "Libre") -> TestClient:
    client = TestClient(create_app())
    resp = client.post("/api/v1/inference/states", json=_payload_inferencia(estado))
    assert resp.status_code == 202, resp.text
    return client


def _auth_header(client: TestClient, credenciales: dict) -> dict:
    resp = client.post("/api/auth/login", json=credenciales)
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_pulso_barrera_actualiza_conteo() -> None:
    client = TestClient(create_app())

    r_in = client.post(
        "/api/accesos/barreras/pulso",
        json={"parking_lot_id": LOTE, "barrier_id": "PLUMA-NORTE", "evento": "ENTRADA"},
    )
    assert r_in.status_code == 200
    assert r_in.json()["metrics"]["barrier_net_vehicles"] == 1

    r_out = client.post(
        "/api/accesos/barreras/pulso",
        json={"parking_lot_id": LOTE, "barrier_id": "PLUMA-SUR", "evento": "SALIDA"},
    )
    assert r_out.status_code == 200
    assert r_out.json()["metrics"]["barrier_net_vehicles"] == 0


def test_sobrescritura_manual_bloquea_inferencia_hasta_liberacion() -> None:
    client = _cliente_con_cajon("Libre")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)
    inicio = len(auditoria_service.registros)

    # 1. Forzar cajón por Obras con lock
    r_override = client.post(
        "/api/accesos/sobrescritura-manual",
        headers=headers,
        json={
            "parking_lot_id": LOTE,
            "polygon_id": POLIGONO,
            "estado": "Obras",
            "motivo": "Reparación de luminaria",
        },
    )
    assert r_override.status_code == 200, r_override.text
    assert r_override.json()["manual_lock"] is True
    assert r_override.json()["estado"] == "Obras"

    # Verificar trazabilidad en bitácora con usuario y motivo
    nuevos = auditoria_service.registros[inicio:]
    assert any(
        r.id_usuario == ID_VIGILANCIA and "motivo=Reparación de luminaria" in r.accion
        for r in nuevos
    )

    # 2. Cámara intenta reportarlo como Libre -> debe mantenerse en Obras
    r_cv = client.post(
        "/api/v1/inference/states",
        json=_payload_inferencia("Libre", frame_sequence=2),
    )
    assert r_cv.status_code == 202, r_cv.text
    servicio = client.app.state.parking_state_service
    assert servicio.obtener_cajon(LOTE, POLIGONO).state == "Obras"
    resumen = servicio.get_lot_summary(LOTE)
    assert resumen["locked_slots"] == 1
    assert resumen["occupied"] == 1

    # 3. Liberar bloqueo manual
    r_unlock = client.post(
        "/api/accesos/liberar-bloqueo",
        headers=headers,
        json={
            "parking_lot_id": LOTE,
            "polygon_id": POLIGONO,
            "motivo": "Obra terminada",
        },
    )
    assert r_unlock.status_code == 200, r_unlock.text
    assert r_unlock.json()["manual_lock"] is False