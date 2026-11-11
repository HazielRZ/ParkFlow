"""Entidades de dominio y persistencia de `/api-backend`."""

from .entities import ParkingSlotRecord
from .usuario import LogAccesoEventoRecord, RolEnum, UsuarioRecord, UsuarioRepository

__all__ = [
    "ParkingSlotRecord",
    "LogAccesoEventoRecord",
    "RolEnum",
    "UsuarioRecord",
    "UsuarioRepository",
]
