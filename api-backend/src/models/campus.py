"""Catálogo de campus y relación zona → campus (INT-COM-01).

Una **zona** es el `parking_lot_id` del contrato INT-SW-01 (igual que `Zone.code` en
el esquema de PF-12), y su código empieza con el del campus al que pertenece:
`ITM-CAMPUS1-EST-NORTE` pertenece a `ITM-CAMPUS1`.
"""

from __future__ import annotations

import os
from typing import Iterable, Optional, Tuple

# Mismos códigos que siembra la migración `92020a218810_seed_roles_y_campus`.
CAMPUS_POR_DEFECTO: Tuple[str, ...] = ("ITM-CAMPUS1", "ITM-CAMPUS2")


def campus_configurados() -> Tuple[str, ...]:
    """Códigos de campus activos: `PARKFLOW_CAMPUS_CODES` (separados por coma) o la semilla."""
    valor = os.getenv("PARKFLOW_CAMPUS_CODES", "")
    codigos = tuple(codigo.strip() for codigo in valor.split(",") if codigo.strip())
    return codigos or CAMPUS_POR_DEFECTO


def campus_de_zona(parking_lot_id: str, campus: Iterable[str]) -> Optional[str]:
    """Campus al que pertenece una zona, o `None` si no coincide con ninguno.

    Se compara contra `<campus>-` para que `ITM-CAMPUS1` no capture zonas de `ITM-CAMPUS10`.
    """
    for codigo in campus:
        if parking_lot_id.startswith(f"{codigo}-"):
            return codigo
    return None
