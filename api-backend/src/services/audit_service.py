"""Servicio de bitácora de auditoría (tabla `Log_Acceso_Evento`)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from src.models.usuario import LogAccesoEventoRecord

__all__ = ["AuditoriaService", "auditoria_service"]


class AuditoriaService:
    """Registra eventos de acceso. Mock en memoria; sustituir por INSERT a PostgreSQL/Supabase."""

    def __init__(self) -> None:
        self._registros: List[LogAccesoEventoRecord] = []
        self._contador = 0

    def registrar(self, id_usuario: int, accion: str) -> LogAccesoEventoRecord:
        self._contador += 1
        registro = LogAccesoEventoRecord(
            id_log=self._contador,
            id_usuario=id_usuario,
            accion=accion,
            fecha_hora=datetime.now(timezone.utc),
        )
        # Simulación de:
        # INSERT INTO Log_Acceso_Evento (id_usuario, accion, fecha_hora)
        # VALUES (%s, %s, %s)
        self._registros.append(registro)
        return registro

    @property
    def registros(self) -> List[LogAccesoEventoRecord]:
        return list(self._registros)


auditoria_service = AuditoriaService()
