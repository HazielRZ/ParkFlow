"""Emisor HTTP que envía estados de inferencia por polígono hacia `/api-backend` (INT-SW-01)."""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx
from jsonschema import Draft202012Validator

from src.models import ParkFlowPolygonInferencePayload

logger = logging.getLogger(__name__)


class InferenceHttpDispatcher:
    """Cliente HTTP desacoplado que emite eventos validados según `inference-state.schema.json`."""

    INGESTION_PATH = "/api/v1/inference/states"

    def __init__(
        self,
        backend_base_url: Optional[str] = None,
        schema_path: Optional[Path] = None,
        timeout_seconds: float = 5.0,
    ) -> None:
        self.backend_base_url = (
            backend_base_url or os.getenv("PARKFLOW_BACKEND_URL", "http://api-backend:8000")
        ).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._validator: Optional[Draft202012Validator] = None

        resolved_schema_path = schema_path or self._resolve_default_schema_path()
        if resolved_schema_path and resolved_schema_path.is_file():
            with resolved_schema_path.open("r", encoding="utf-8") as schema_file:
                schema_data = json.load(schema_file)
            Draft202012Validator.check_schema(schema_data)
            self._validator = Draft202012Validator(schema_data)

    @staticmethod
    def _resolve_default_schema_path() -> Optional[Path]:
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

    def build_and_validate_payload(
        self, payload: ParkFlowPolygonInferencePayload
    ) -> dict[str, Any]:
        """Serializa el modelo Pydantic y valida contra el JSON Schema Draft 2020-12 si está presente."""
        serialized = payload.to_contract_dict()
        if self._validator is not None:
            self._validator.validate(serialized)
        return serialized

    def dispatch(
        self,
        payload: ParkFlowPolygonInferencePayload,
        client: Optional[httpx.Client] = None,
    ) -> httpx.Response:
        """Envía el payload mediante POST `/api/v1/inference/states` hacia `/api-backend`."""
        body = self.build_and_validate_payload(payload)
        endpoint = f"{self.backend_base_url}{self.INGESTION_PATH}"

        if client is not None:
            response = client.post(endpoint, json=body, timeout=self.timeout_seconds)
            response.raise_for_status()
            return response

        with httpx.Client(timeout=self.timeout_seconds) as session:
            response = session.post(endpoint, json=body)
            response.raise_for_status()
            return response


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("ParkFlow CV Service HTTP Dispatcher inicializado (INT-SW-01).")
