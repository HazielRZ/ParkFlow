"""Entidades de autenticación y control de acceso (RNF-02)."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RolEnum(str, enum.Enum):
    """Espejo de `rol_enum` en PostgreSQL."""

    ADMINISTRADOR = "Administrador"
    VIGILANCIA = "Vigilancia"
    ESTUDIANTE = "Estudiante"
    TECH_LEAD = "Tech Lead"
    DESARROLLADOR = "Desarrollador"


@dataclass
class UsuarioRecord:
    """Representación en memoria/persistencia de la tabla `Usuario`."""

    id_usuario: int
    correo: str
    password_hash: str
    rol: RolEnum


@dataclass
class LogAccesoEventoRecord:
    """Representación en memoria/persistencia de la tabla `Log_Acceso_Evento`."""

    id_log: int
    id_usuario: int
    accion: str
    fecha_hora: datetime


@dataclass
class UsuarioRepository:
    """Repositorio en memoria de usuarios institucionales (mock de Supabase/PostgreSQL)."""

    usuarios: List[UsuarioRecord] = field(default_factory=list)

    def obtener_por_correo(self, correo: str) -> UsuarioRecord | None:
        correo_normalizado = correo.lower()
        for usuario in self.usuarios:
            if usuario.correo.lower() == correo_normalizado:
                return usuario
        return None


def _construir_repositorio_demo() -> UsuarioRepository:
    """Semilla de usuarios institucionales para demo/desarrollo local.

    Sustituir por una sesión de SQLAlchemy / cliente Supabase contra la
    tabla `Usuario` real en producción.
    """
    return UsuarioRepository(
        usuarios=[
            UsuarioRecord(
                id_usuario=1,
                correo="admin@morelia.tecnm.mx",
                password_hash=pwd_context.hash("Admin123*"),
                rol=RolEnum.ADMINISTRADOR,
            ),
            UsuarioRecord(
                id_usuario=2,
                correo="vigilancia@morelia.tecnm.mx",
                password_hash=pwd_context.hash("Vigila123*"),
                rol=RolEnum.VIGILANCIA,
            ),
            UsuarioRecord(
                id_usuario=3,
                correo="l23121070@morelia.tecnm.mx",
                password_hash=pwd_context.hash("Dev123*"),
                rol=RolEnum.DESARROLLADOR,
            ),
        ]
    )


usuario_repository = _construir_repositorio_demo()
