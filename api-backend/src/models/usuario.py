"""Entidades de autenticación y control de acceso (RNF-02)."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RolEnum(str, enum.Enum):
    """Roles del sistema (PF-16). Deben coincidir con el catálogo de roles en PostgreSQL.

    `Administrador` es el rol único de Administrador/Product Owner: el PO no tiene
    un rol aparte, opera con los permisos de Administrador.
    """

    ADMINISTRADOR = "Administrador"
    VIGILANCIA = "Vigilancia"
    ESTUDIANTE = "Estudiante"
    TECH_LEAD = "Tech Lead"
    DEVOPS_QA = "DevOps/QA"
    DESARROLLADOR = "Desarrollador"
    INVITADO = "Invitado"


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
    """Semilla de usuarios institucionales para demo/desarrollo local (uno por rol).

    Sustituir por una sesión de SQLAlchemy / cliente Supabase contra la
    tabla `Usuario` real en producción.
    """
    semilla = [
        (1, "admin@morelia.tecnm.mx", "Admin123*", RolEnum.ADMINISTRADOR),
        (2, "vigilancia@morelia.tecnm.mx", "Vigila123*", RolEnum.VIGILANCIA),
        (3, "l23121070@morelia.tecnm.mx", "Dev123*", RolEnum.DESARROLLADOR),
        (4, "techlead@morelia.tecnm.mx", "TechLead123*", RolEnum.TECH_LEAD),
        (5, "devops.qa@morelia.tecnm.mx", "DevOpsQA123*", RolEnum.DEVOPS_QA),
        (6, "estudiante@morelia.tecnm.mx", "Estudiante123*", RolEnum.ESTUDIANTE),
        (7, "invitado@morelia.tecnm.mx", "Invitado123*", RolEnum.INVITADO),
    ]
    return UsuarioRepository(
        usuarios=[
            UsuarioRecord(
                id_usuario=id_usuario,
                correo=correo,
                password_hash=pwd_context.hash(password),
                rol=rol,
            )
            for id_usuario, correo, password, rol in semilla
        ]
    )


usuario_repository = _construir_repositorio_demo()
