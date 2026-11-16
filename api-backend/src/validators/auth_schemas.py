"""Esquemas Pydantic de autenticación institucional (RNF-02)."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator
from pydantic_core import PydanticCustomError

from src.models.usuario import RolEnum

DOMINIO_INSTITUCIONAL = "@morelia.tecnm.mx"

# Tipo de error propio para distinguir el rechazo por dominio de un correo mal
# formado; `auth_routes` lo usa para auditar el intento.
ERROR_DOMINIO_NO_INSTITUCIONAL = "dominio_no_institucional"


class UsuarioLogin(BaseModel):
    """Credenciales de acceso. Rechaza en frontera cualquier correo no institucional."""

    correo: EmailStr
    password: str

    @field_validator("correo")
    @classmethod
    def validar_dominio_institucional(cls, v: EmailStr) -> EmailStr:
        if not str(v).lower().endswith(DOMINIO_INSTITUCIONAL):
            raise PydanticCustomError(
                ERROR_DOMINIO_NO_INSTITUCIONAL,
                f"Acceso denegado: solo se permite correo institucional "
                f"'{DOMINIO_INSTITUCIONAL}' (RNF-02)",
            )
        return v


class Token(BaseModel):
    """Esquema de respuesta del endpoint de login."""

    access_token: str
    token_type: str = "bearer"
    rol: RolEnum
    expira_en: int


class UsuarioOut(BaseModel):
    """Usuario autenticado, derivado del contenido verificado del JWT."""

    id_usuario: int
    correo: EmailStr
    rol: RolEnum


class CalibracionCajonesRequest(BaseModel):
    id_cajon: int
    umbral_ocupado_cm: float


class AccesoManualRequest(BaseModel):
    placa: str
    id_cajon: int
