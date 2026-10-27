"""Pruebas unitarias de contrato y máquina de estados en `/cv-service`."""

from datetime import datetime, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from src.models import ParkFlowPolygonInferencePayload, PolygonInferenceState, SlotState, VehicleType
from src.state_machine.temporal_fsm import SlotTemporalStateMachine


def test_valid_inference_payload_serialization() -> None:
    payload = ParkFlowPolygonInferencePayload(
        camera_id=UUID("e6f4776b-3122-4a0b-857e-3c22db92dcb1"),
        parking_lot_id="ITM-CAMPUS1-EST-NORTE",
        timestamp=datetime(2026, 10, 27, 18, 30, 0, tzinfo=timezone.utc),
        frame_sequence=1042,
        polygons=[
            PolygonInferenceState(
                polygon_id="poly-itm-001",
                slot_name="C-01",
                state=SlotState.EN_MANIOBRA,
                confidence=0.89,
                iou_ratio=0.38,
                vehicle_type=VehicleType.CAR,
            )
        ],
    )
    data = payload.to_contract_dict()
    assert data["camera_id"] == "e6f4776b-3122-4a0b-857e-3c22db92dcb1"
    assert data["polygons"][0]["state"] == "En maniobra"


def test_invalid_slot_state_rejected() -> None:
    with pytest.raises(ValidationError):
        PolygonInferenceState(
            polygon_id="poly-itm-001",
            slot_name="C-01",
            state="Reservado",  # type: ignore[arg-type]
            confidence=0.89,
            iou_ratio=0.38,
        )


def test_temporal_fsm_requires_maneuver_transition() -> None:
    fsm = SlotTemporalStateMachine(polygon_id="poly-itm-001", slot_name="A-01", t_occupied_seconds=3.0)
    assert fsm.current_state == SlotState.LIBRE
    # Al detectar IoU >= 0.50 por primera vez pasa a "En maniobra", no directo a "Ocupado"
    assert fsm.evaluate(iou_ratio=0.72, timestamp_sec=10.0) == SlotState.EN_MANIOBRA
    assert fsm.evaluate(iou_ratio=0.75, timestamp_sec=12.0) == SlotState.EN_MANIOBRA
    # Tras cumplir la ventana temporal (>= 3.0s), confirma "Ocupado"
    assert fsm.evaluate(iou_ratio=0.78, timestamp_sec=13.1) == SlotState.OCUPADO
