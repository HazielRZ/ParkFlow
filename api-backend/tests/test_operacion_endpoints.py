"""Pruebas de la lógica real de registro manual y calibración de cajones (PF-16, Tarea 1.4)."""

import asyncio
from typing import Any, List

import pytest
from fastapi.testclient import TestClient

from src.main import create_app
from src.services.audit_service import AuditoriaService, auditoria_service
from src.services.parking_state_service import ParkingStateService

LOTE = "ITM-CAMPUS1-EST-NORTE"
POLIGONO = "poly-itm-001"
CREDENCIALES_ADMIN = {"correo": "admin@morelia.tecnm.mx", "password": "Admin123*"}
CREDENCIALES_VIGILANCIA = {"correo": "vigilancia@morelia.tecnm.mx", "password": "Vigila123*"}
ID_VIGILANCIA = 2
ID_ADMIN = 1


def _payload_inferencia(estado: str) -> dict:
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": LOTE,
        "timestamp": "2026-10-27T18:30:00Z",
        "frame_sequence": 1,
        "polygons": [
            {
                "polygon_id": POLIGONO,
                "slot_name": "C-01",
                "state": estado,
                "confidence": 0.9,
                "iou_ratio": 0.05,
                "vehicle_type": None,
            }
        ],
    }


def _cliente_con_cajon(estado: str = "Libre") -> TestClient:
    client = TestClient(create_app())
    respuesta = client.post("/api/v1/inference/states", json=_payload_inferencia(estado))
    assert respuesta.status_code == 202, respuesta.text
    return client


def _auth_header(client: TestClient, credenciales: dict) -> dict:
    respuesta = client.post("/api/auth/login", json=credenciales)
    assert respuesta.status_code == 200, respuesta.text
    return {"Authorization": f"Bearer {respuesta.json()['access_token']}"}


def _registro_manual(estado: str, polygon_id: str = POLIGONO) -> dict:
    return {"parking_lot_id": LOTE, "polygon_id": polygon_id, "placa": "PXK-123-A", "estado": estado}


def _calibracion(libre: float, ocupado: float, polygon_id: str = POLIGONO) -> dict:
    return {
        "parking_lot_id": LOTE,
        "polygon_id": polygon_id,
        "umbral_iou_libre": libre,
        "umbral_iou_ocupado": ocupado,
    }


# --- Registro manual -------------------------------------------------------


def test_registro_manual_cambia_el_estado_del_cajon_y_lo_audita_a_nombre_del_usuario() -> None:
    client = _cliente_con_cajon("Libre")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)
    inicio = len(auditoria_service.registros)

    respuesta = client.post("/api/accesos/registro-manual", json=_registro_manual("Ocupado"), headers=headers)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["estado"] == "Ocupado"
    servicio = client.app.state.parking_state_service
    assert servicio.obtener_cajon(LOTE, POLIGONO).state == "Ocupado"
    assert servicio.get_lot_summary(LOTE)["occupied"] == 1

    nuevos = auditoria_service.registros[inicio:]
    assert [(r.id_usuario, r.accion) for r in nuevos] == [
        (ID_VIGILANCIA, f"CAMBIO_ESTADO_CAJON:lote={LOTE},poligono={POLIGONO},cajon=C-01,anterior=Libre,nuevo=Ocupado"),
        (ID_VIGILANCIA, f"REGISTRO_MANUAL_ACCESO:lote={LOTE},poligono={POLIGONO},placa=PXK-123-A,estado=Ocupado"),
    ]


def test_registro_manual_con_el_mismo_estado_no_genera_cambio_de_estado() -> None:
    client = _cliente_con_cajon("Ocupado")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)
    inicio = len(auditoria_service.registros)

    respuesta = client.post("/api/accesos/registro-manual", json=_registro_manual("Ocupado"), headers=headers)

    assert respuesta.status_code == 200
    acciones = [r.accion for r in auditoria_service.registros[inicio:]]
    assert len(acciones) == 1
    assert acciones[0].startswith("REGISTRO_MANUAL_ACCESO")


def test_registro_manual_de_cajon_inexistente_retorna_404() -> None:
    client = _cliente_con_cajon("Libre")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)
    inicio = len(auditoria_service.registros)

    respuesta = client.post(
        "/api/accesos/registro-manual", json=_registro_manual("Ocupado", polygon_id="no-existe"), headers=headers
    )

    assert respuesta.status_code == 404
    assert auditoria_service.registros[inicio:] == []


def test_registro_manual_no_permite_marcar_en_maniobra() -> None:
    client = _cliente_con_cajon("Libre")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)

    respuesta = client.post("/api/accesos/registro-manual", json=_registro_manual("En maniobra"), headers=headers)

    assert respuesta.status_code == 422
    assert client.app.state.parking_state_service.obtener_cajon(LOTE, POLIGONO).state == "Libre"


def test_registro_manual_rechaza_placa_con_separadores_de_bitacora() -> None:
    client = _cliente_con_cajon("Libre")
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)
    payload = {**_registro_manual("Ocupado"), "placa": "ABC,estado=Libre"}

    respuesta = client.post("/api/accesos/registro-manual", json=payload, headers=headers)

    assert respuesta.status_code == 422


def test_registro_manual_difunde_el_cambio_por_websocket() -> None:
    class GatewayFalso:
        def __init__(self) -> None:
            self.mensajes: List[dict[str, Any]] = []

        async def broadcast_state_update(self, message: dict[str, Any]) -> None:
            self.mensajes.append(message)

    gateway = GatewayFalso()
    servicio = ParkingStateService(ws_gateway=gateway, auditoria=AuditoriaService())
    asyncio.run(servicio.process_inference_event(_payload_inferencia("Libre")))

    asyncio.run(servicio.actualizar_estado_manual(LOTE, POLIGONO, "Ocupado", id_usuario=ID_VIGILANCIA))

    mensaje = gateway.mensajes[-1]
    assert mensaje["event"] == "parking_state_updated"
    assert mensaje["polygons"][0]["polygon_id"] == POLIGONO
    assert mensaje["polygons"][0]["state"] == "Ocupado"
    assert mensaje["metrics"]["occupied"] == 1


# --- Calibración -----------------------------------------------------------


def test_calibracion_persiste_los_umbrales_y_lo_audita() -> None:
    client = _cliente_con_cajon()
    headers = _auth_header(client, CREDENCIALES_ADMIN)
    inicio = len(auditoria_service.registros)

    respuesta = client.post("/api/calibracion/cajones", json=_calibracion(0.15, 0.55), headers=headers)

    assert respuesta.status_code == 200, respuesta.text
    guardada = client.app.state.calibracion_service.obtener(LOTE, POLIGONO)
    assert (guardada.umbral_iou_libre, guardada.umbral_iou_ocupado) == (0.15, 0.55)
    assert guardada.actualizado_por == ID_ADMIN
    assert [r.accion for r in auditoria_service.registros[inicio:]] == [
        f"CALIBRACION_CAJON:lote={LOTE},poligono={POLIGONO},umbral_iou_libre=0.15,umbral_iou_ocupado=0.55"
    ]


def test_calibracion_nueva_reemplaza_la_anterior() -> None:
    client = _cliente_con_cajon()
    headers = _auth_header(client, CREDENCIALES_ADMIN)
    client.post("/api/calibracion/cajones", json=_calibracion(0.15, 0.55), headers=headers)

    respuesta = client.post("/api/calibracion/cajones", json=_calibracion(0.25, 0.6), headers=headers)

    assert respuesta.status_code == 200
    guardada = client.app.state.calibracion_service.obtener(LOTE, POLIGONO)
    assert (guardada.umbral_iou_libre, guardada.umbral_iou_ocupado) == (0.25, 0.6)


def test_calibracion_de_cajon_inexistente_retorna_404_y_no_guarda() -> None:
    client = _cliente_con_cajon()
    headers = _auth_header(client, CREDENCIALES_ADMIN)

    respuesta = client.post(
        "/api/calibracion/cajones", json=_calibracion(0.2, 0.5, polygon_id="no-existe"), headers=headers
    )

    assert respuesta.status_code == 404
    assert client.app.state.calibracion_service.obtener(LOTE, "no-existe") is None


@pytest.mark.parametrize(
    ("libre", "ocupado"),
    [(0.6, 0.4), (0.5, 0.5), (-0.1, 0.5), (0.2, 1.5)],
    ids=["invertidos", "iguales", "libre-negativo", "ocupado-mayor-a-1"],
)
def test_calibracion_rechaza_umbrales_invalidos(libre: float, ocupado: float) -> None:
    client = _cliente_con_cajon()
    headers = _auth_header(client, CREDENCIALES_ADMIN)

    respuesta = client.post("/api/calibracion/cajones", json=_calibracion(libre, ocupado), headers=headers)

    assert respuesta.status_code == 422
    assert client.app.state.calibracion_service.obtener(LOTE, POLIGONO) is None
