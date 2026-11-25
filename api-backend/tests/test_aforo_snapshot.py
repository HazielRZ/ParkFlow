"""Pruebas del snapshot REST de aforo y de los canales WebSocket por campus y zona (INT-COM-01)."""

from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.main import create_app

NORTE = "ITM-CAMPUS1-EST-NORTE"
SUR = "ITM-CAMPUS1-EST-SUR"
CENTRAL = "ITM-CAMPUS2-EST-CENTRAL"


def _publicar(client: TestClient, parking_lot_id: str, cajones: List[Tuple[str, str, str]]) -> None:
    """Simula a `/cv-service`. `cajones` = [(polygon_id, slot_name, estado)]."""
    respuesta = client.post(
        "/api/v1/inference/states",
        json={
            "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
            "parking_lot_id": parking_lot_id,
            "timestamp": "2026-11-23T18:30:00Z",
            "frame_sequence": 1,
            "polygons": [
                {
                    "polygon_id": polygon_id,
                    "slot_name": slot_name,
                    "state": estado,
                    "confidence": 0.9,
                    "iou_ratio": 0.5,
                    "vehicle_type": None,
                }
                for polygon_id, slot_name, estado in cajones
            ],
        },
    )
    assert respuesta.status_code == 202, respuesta.text


def _cliente_con_datos() -> TestClient:
    client = TestClient(create_app())
    _publicar(client, NORTE, [("poly-n-01", "A-01", "Libre"), ("poly-n-02", "A-02", "Ocupado")])
    _publicar(client, SUR, [("poly-s-01", "B-01", "En maniobra")])
    _publicar(client, CENTRAL, [("poly-c-01", "C-01", "Libre")])
    return client


# --- Snapshot REST -----------------------------------------------------------


def test_snapshot_de_campus_sin_datos_regresa_zonas_vacias_y_sin_cache() -> None:
    client = TestClient(create_app())

    respuesta = client.get("/api/aforo/campus/ITM-CAMPUS1")

    assert respuesta.status_code == 200
    assert respuesta.headers["cache-control"] == "no-store"
    cuerpo = respuesta.json()
    assert cuerpo["campus"] == "ITM-CAMPUS1"
    assert cuerpo["zonas"] == []
    assert cuerpo["totales"]["total_slots"] == 0
    assert cuerpo["generado_en"].endswith("Z")


def test_snapshot_de_campus_inexistente_retorna_404() -> None:
    client = TestClient(create_app())

    assert client.get("/api/aforo/campus/ITM-CAMPUS9").status_code == 404


def test_snapshot_de_campus_agrupa_solo_sus_zonas_y_suma_los_totales() -> None:
    client = _cliente_con_datos()

    cuerpo = client.get("/api/aforo/campus/ITM-CAMPUS1").json()

    assert [zona["parking_lot_id"] for zona in cuerpo["zonas"]] == [NORTE, SUR]
    totales = cuerpo["totales"]
    assert totales["total_slots"] == 3
    assert totales["occupied"] == 1
    assert totales["in_maneuver"] == 1
    assert totales["free"] == sum(zona["metrics"]["free"] for zona in cuerpo["zonas"])
    assert totales["occupancy_ratio"] == round(1 / 3, 4)

    norte = cuerpo["zonas"][0]
    assert [p["slot_name"] for p in norte["polygons"]] == ["A-01", "A-02"]
    assert set(norte["polygons"][0]) == {
        "polygon_id", "slot_name", "state", "confidence", "iou_ratio",
        "vehicle_type", "manual_lock", "updated_at",
    }
    assert norte["polygons"][1]["state"] == "Ocupado"


def test_snapshot_general_incluye_todos_los_campus_en_orden() -> None:
    client = _cliente_con_datos()

    cuerpo = client.get("/api/aforo").json()

    assert [campus["campus"] for campus in cuerpo["campus"]] == ["ITM-CAMPUS1", "ITM-CAMPUS2"]
    assert [zona["parking_lot_id"] for zona in cuerpo["campus"][1]["zonas"]] == [CENTRAL]


def test_snapshot_de_zona_regresa_sus_cajones() -> None:
    client = _cliente_con_datos()

    respuesta = client.get(f"/api/aforo/campus/ITM-CAMPUS1/zonas/{NORTE}")

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert (cuerpo["campus"], cuerpo["parking_lot_id"]) == ("ITM-CAMPUS1", NORTE)
    assert cuerpo["metrics"]["total_slots"] == 2
    assert len(cuerpo["polygons"]) == 2


@pytest.mark.parametrize(
    "ruta",
    [
        f"/api/aforo/campus/ITM-CAMPUS1/zonas/{CENTRAL}",
        "/api/aforo/campus/ITM-CAMPUS1/zonas/ITM-CAMPUS1-EST-SIN-DATOS",
        f"/api/aforo/campus/ITM-CAMPUS9/zonas/{NORTE}",
    ],
    ids=["zona-de-otro-campus", "zona-sin-datos", "campus-inexistente"],
)
def test_snapshot_de_zona_invalida_retorna_404(ruta: str) -> None:
    client = _cliente_con_datos()

    assert client.get(ruta).status_code == 404


def test_snapshot_refleja_la_sobrescritura_manual_con_bloqueo() -> None:
    client = _cliente_con_datos()
    login = client.post(
        "/api/auth/login", json={"correo": "admin@morelia.tecnm.mx", "password": "Admin123*"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    respuesta = client.post(
        "/api/accesos/sobrescritura-manual",
        json={"parking_lot_id": NORTE, "polygon_id": "poly-n-01", "estado": "Reservado", "motivo": "Evento"},
        headers=headers,
    )
    assert respuesta.status_code == 200, respuesta.text

    zona = client.get(f"/api/aforo/campus/ITM-CAMPUS1/zonas/{NORTE}").json()

    cajon = next(p for p in zona["polygons"] if p["polygon_id"] == "poly-n-01")
    assert (cajon["state"], cajon["manual_lock"]) == ("Reservado", True)


def test_snapshot_es_publico_no_requiere_token() -> None:
    client = _cliente_con_datos()

    for ruta in ("/api/aforo", "/api/aforo/campus/ITM-CAMPUS2", f"/api/aforo/campus/ITM-CAMPUS2/zonas/{CENTRAL}"):
        assert client.get(ruta).status_code == 200


# --- Canales WebSocket -------------------------------------------------------


@pytest.mark.parametrize(
    "ruta",
    ["/ws/campus/ITM-CAMPUS9", f"/ws/campus/ITM-CAMPUS1/zonas/{CENTRAL}"],
    ids=["campus-inexistente", "zona-de-otro-campus"],
)
def test_websocket_rechaza_suscripciones_invalidas(ruta: str) -> None:
    client = TestClient(create_app())

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect(ruta):
            pass

    assert exc.value.code == 1008
