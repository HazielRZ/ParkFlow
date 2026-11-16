"""Pruebas de auditoría de cambios de estado de cajones (PF-16 DoD #3)."""

from typing import List, Tuple

from fastapi.testclient import TestClient

from src.main import create_app
from src.services.audit_service import auditoria_service

LOTE = "ITM-CAMPUS1-EST-NORTE"


def _payload(frame_sequence: int, cajones: List[Tuple[str, str, str]]) -> dict:
    """Arma un payload INT-SW-01 válido. `cajones` = [(polygon_id, slot_name, estado)]."""
    return {
        "camera_id": "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        "parking_lot_id": LOTE,
        "timestamp": "2026-10-27T18:30:00Z",
        "frame_sequence": frame_sequence,
        "polygons": [
            {
                "polygon_id": polygon_id,
                "slot_name": slot_name,
                "state": estado,
                "confidence": 0.9,
                "iou_ratio": 0.5,
                "vehicle_type": "car",
            }
            for polygon_id, slot_name, estado in cajones
        ],
    }


def _enviar(client: TestClient, frame_sequence: int, cajones: List[Tuple[str, str, str]]) -> None:
    respuesta = client.post("/api/v1/inference/states", json=_payload(frame_sequence, cajones))
    assert respuesta.status_code == 202, respuesta.text


def _cambios_de_estado_desde(indice: int) -> list:
    return [
        r for r in auditoria_service.registros[indice:]
        if r.accion.startswith("CAMBIO_ESTADO_CAJON")
    ]


def test_registra_cada_transicion_con_estado_anterior_y_nuevo() -> None:
    client = TestClient(create_app())
    _enviar(client, 1, [("poly-itm-001", "C-01", "Libre")])
    inicio = len(auditoria_service.registros)

    _enviar(client, 2, [("poly-itm-001", "C-01", "En maniobra")])
    _enviar(client, 3, [("poly-itm-001", "C-01", "Ocupado")])
    _enviar(client, 4, [("poly-itm-001", "C-01", "Libre")])

    cambios = _cambios_de_estado_desde(inicio)
    assert [c.accion for c in cambios] == [
        f"CAMBIO_ESTADO_CAJON:lote={LOTE},poligono=poly-itm-001,cajon=C-01,anterior=Libre,nuevo=En maniobra",
        f"CAMBIO_ESTADO_CAJON:lote={LOTE},poligono=poly-itm-001,cajon=C-01,anterior=En maniobra,nuevo=Ocupado",
        f"CAMBIO_ESTADO_CAJON:lote={LOTE},poligono=poly-itm-001,cajon=C-01,anterior=Ocupado,nuevo=Libre",
    ]
    assert all(c.id_usuario is None for c in cambios)


def test_primera_observacion_no_registra_cambio() -> None:
    client = TestClient(create_app())
    inicio = len(auditoria_service.registros)

    _enviar(client, 1, [("poly-itm-001", "C-01", "Ocupado")])

    assert _cambios_de_estado_desde(inicio) == []


def test_mismo_estado_repetido_no_registra_cambio() -> None:
    client = TestClient(create_app())
    _enviar(client, 1, [("poly-itm-001", "C-01", "Ocupado")])
    inicio = len(auditoria_service.registros)

    _enviar(client, 2, [("poly-itm-001", "C-01", "Ocupado")])

    assert _cambios_de_estado_desde(inicio) == []


def test_solo_registra_los_cajones_que_cambiaron() -> None:
    client = TestClient(create_app())
    _enviar(client, 1, [("poly-itm-001", "C-01", "Libre"), ("poly-itm-002", "C-02", "Libre")])
    inicio = len(auditoria_service.registros)

    _enviar(client, 2, [("poly-itm-001", "C-01", "Libre"), ("poly-itm-002", "C-02", "En maniobra")])

    cambios = _cambios_de_estado_desde(inicio)
    assert len(cambios) == 1
    assert "poligono=poly-itm-002" in cambios[0].accion
    assert cambios[0].accion.endswith("anterior=Libre,nuevo=En maniobra")
