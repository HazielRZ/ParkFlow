"""Cargador modular de polígonos calibrados para ParkFlow (/cv-service)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, List, Mapping, Optional, Tuple, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from shapely.geometry import Polygon

Point2D = Tuple[float, float]


def default_polygons_config_path() -> Path:
    """Resuelve la ruta predeterminada de calibración de polígonos."""
    env_path = os.getenv("PARKFLOW_POLYGONS_PATH")
    if env_path:
        return Path(env_path)
    return Path(__file__).resolve().parents[2] / "config" / "polygons_itm_campus1.json"


class CalibratedSpotPolygon(BaseModel):
    """Definición de polígono calibrado para un cajón de estacionamiento."""

    model_config = ConfigDict(extra="ignore")

    spot_id: str = Field(..., min_length=1, alias="spot_id")
    slot_name: str = Field(..., min_length=1)
    zone_id: Optional[str] = Field(default=None, min_length=1)
    vertices: List[Point2D] = Field(..., min_length=3)
    normalized: bool = Field(default=False)
    iou_free_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    iou_occupied_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def _accept_polygon_aliases(cls, data: Any) -> Any:
        if isinstance(data, Mapping):
            mutable = dict(data)
            if "spot_id" not in mutable:
                if "polygon_id" in mutable:
                    mutable["spot_id"] = mutable["polygon_id"]
                elif "polygon_key" in mutable:
                    mutable["spot_id"] = mutable["polygon_key"]
            if "vertices" not in mutable and "polygon" in mutable:
                mutable["vertices"] = mutable["polygon"]
            return mutable
        return data

    @field_validator("vertices")
    @classmethod
    def _validate_geometry(cls, vertices: List[Point2D]) -> List[Point2D]:
        if len(vertices) < 3:
            raise ValueError("Un polígono calibrado requiere al menos 3 vértices.")
        poly = Polygon(vertices)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.area <= 0.0:
            raise ValueError("El polígono calibrado debe tener área positiva.")
        return [(float(x), float(y)) for x, y in vertices]

    @model_validator(mode="after")
    def _validate_normalized_and_thresholds(self) -> "CalibratedSpotPolygon":
        if self.normalized:
            for x, y in self.vertices:
                if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                    raise ValueError(
                        f"Polígono '{self.spot_id}' marcado como normalizado con coordenadas fuera de [0, 1]."
                    )
        if (
            self.iou_free_threshold is not None
            and self.iou_occupied_threshold is not None
            and self.iou_free_threshold >= self.iou_occupied_threshold
        ):
            raise ValueError("iou_free_threshold debe ser menor que iou_occupied_threshold.")
        return self

    def resolve_pixels(self, frame_width: int, frame_height: int) -> List[Point2D]:
        """Convierte vértices a coordenadas en píxeles para la resolución del frame actual."""
        if frame_width <= 0 or frame_height <= 0:
            raise ValueError("Las dimensiones del frame deben ser positivas.")
        if self.normalized:
            return [
                (x * float(frame_width), y * float(frame_height))
                for x, y in self.vertices
            ]
        return list(self.vertices)


class ParkingZoneCalibration(BaseModel):
    """Configuración completa de cámara, zona y cajones calibrados."""

    model_config = ConfigDict(extra="ignore")

    parking_lot_id: str = Field(..., min_length=1)
    camera_id: UUID
    zone_id: Optional[str] = Field(default=None, min_length=1)
    reference_width: int = Field(default=1280, gt=0)
    reference_height: int = Field(default=720, gt=0)
    normalized: bool = Field(default=False)
    spots: List[CalibratedSpotPolygon] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _propagate_zone_and_normalization(self) -> "ParkingZoneCalibration":
        seen_ids: set[str] = set()
        for spot in self.spots:
            if spot.spot_id in seen_ids:
                raise ValueError(f"spot_id duplicado en calibración: '{spot.spot_id}'")
            seen_ids.add(spot.spot_id)
            if spot.zone_id is None and self.zone_id is not None:
                spot.zone_id = self.zone_id
            if self.normalized and not spot.normalized:
                spot.normalized = True
        return self


def load_polygon_calibration(
    source: Union[str, Path, Mapping[str, Any], None] = None,
) -> ParkingZoneCalibration:
    """Carga y valida la calibración de polígonos desde archivo JSON o diccionario."""
    if isinstance(source, Mapping):
        return ParkingZoneCalibration.model_validate(dict(source))

    path = Path(source) if source is not None else default_polygons_config_path()
    if not path.is_file():
        raise FileNotFoundError(f"No se encontró el archivo de polígonos calibrados: {path}")

    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    return ParkingZoneCalibration.model_validate(payload)
