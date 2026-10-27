"""Validador en runtime para `contracts/json-schema/inference-state.schema.json` (INT-SW-01).

Regla 2 de AGENTS.md:
- Todo endpoint en `/api-backend` que reciba inferencias debe validar el cuerpo
  de la petición contra `inference-state.schema.json` antes de procesar o propagar el estado.
- Cualquier valor fuera de `Libre`, `Ocupado` o `En maniobra` debe ser rechazado
  inmediatamente con código HTTP 422.
"""

from __future__ import annotations

from datetime import datetime
import json
import os
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from jsonschema import Draft202012Validator, FormatChecker, ValidationError

ALLOWED_STATES = ("Libre", "Ocupado", "En maniobra")


class ContractStructureError(ValueError):
    """Error estructural en el contrato JSON (HTTP 400)."""


class UnsupportedSlotStateError(ValueError):
    """Violación semántica o de máquina de estados en el payload (HTTP 422)."""


class InferenceSchemaValidator:
    """Ejecuta validación estricta Draft 2020-12 sobre eventos de inferencia."""

    def __init__(self, schema_path: Optional[Path] = None) -> None:
        resolved_path = schema_path or self._resolve_schema_path()
        if not resolved_path.is_file():
            raise FileNotFoundError(
                f"No se encontró el contrato JSON Schema en: {resolved_path}"
            )
        with resolved_path.open("r", encoding="utf-8") as file_obj:
            self.schema: dict[str, Any] = json.load(file_obj)

        Draft202012Validator.check_schema(self.schema)
        self.format_checker = FormatChecker()
        self.validator = Draft202012Validator(
            self.schema, format_checker=self.format_checker
        )

    @staticmethod
    def _resolve_schema_path() -> Path:
        env_path = os.getenv("PARKFLOW_INFERENCE_SCHEMA_PATH")
        if env_path:
            return Path(env_path)
        return (
            Path(__file__).resolve().parents[3]
            / "contracts"
            / "json-schema"
            / "inference-state.schema.json"
        )

    def validate_payload(self, payload: Any) -> dict[str, Any]:
        """Valida el cuerpo contra `inference-state.schema.json`.

        Lanza `UnsupportedSlotStateError` (HTTP 422) cuando el estado de un polígono
        no pertenece a `["Libre", "Ocupado", "En maniobra"]` o cuando existen violaciones
        de rango/formato semántico (`confidence`, `iou_ratio`, `camera_id`, `timestamp`),
        y `ContractStructureError` (HTTP 400) cuando la estructura JSON es incompatible.
        """
        if not isinstance(payload, dict):
            raise ContractStructureError("El cuerpo de la petición debe ser un objeto JSON.")

        polygons = payload.get("polygons")
        if isinstance(polygons, list):
            for idx, item in enumerate(polygons):
                if isinstance(item, dict) and "state" in item:
                    state_val = item["state"]
                    if state_val not in ALLOWED_STATES:
                        raise UnsupportedSlotStateError(
                            f"polygons[{idx}].state='{state_val}' no es válido. "
                            f"Estados permitidos: {list(ALLOWED_STATES)}."
                        )

        try:
            self.validator.validate(payload)
        except ValidationError as exc:
            path_tokens = [str(p) for p in exc.absolute_path]
            if any(
                token in ("state", "confidence", "iou_ratio", "vehicle_type", "camera_id", "timestamp")
                for token in path_tokens
            ) or exc.validator in ("enum", "minimum", "maximum", "format"):
                raise UnsupportedSlotStateError(exc.message) from exc
            raise ContractStructureError(exc.message) from exc

        # Verificación explícita de formato UUID e ISO-8601 (independiente de extras opcionales)
        try:
            UUID(str(payload["camera_id"]))
        except (ValueError, KeyError, TypeError) as exc:
            raise UnsupportedSlotStateError(
                "camera_id debe tener formato UUID válido."
            ) from exc

        try:
            ts_raw = str(payload["timestamp"])
            datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        except (ValueError, KeyError, TypeError) as exc:
            raise UnsupportedSlotStateError(
                "timestamp debe tener formato ISO-8601 date-time válido."
            ) from exc

        return payload
