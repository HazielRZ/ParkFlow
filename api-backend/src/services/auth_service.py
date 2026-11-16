"""Lógica de autenticación institucional: verificación de credenciales y emisión de token."""

from __future__ import annotations

from typing import Optional, Tuple

from src.models.usuario import UsuarioRecord, pwd_context, usuario_repository
from src.security.jwt_handler import jwt_handler

__all__ = ["autenticar_usuario", "emitir_token", "obtener_id_usuario"]


def autenticar_usuario(correo: str, password: str) -> Optional[UsuarioRecord]:
    """Verifica credenciales contra el repositorio de usuarios. `None` si son inválidas."""
    usuario = usuario_repository.obtener_por_correo(correo)
    if usuario is None or not pwd_context.verify(password, usuario.password_hash):
        return None
    return usuario


def obtener_id_usuario(correo: str) -> Optional[int]:
    """Id de la cuenta registrada con ese correo, o `None` si no existe."""
    usuario = usuario_repository.obtener_por_correo(correo)
    return usuario.id_usuario if usuario is not None else None


def emitir_token(usuario: UsuarioRecord) -> Tuple[str, int]:
    """Genera el JWT de acceso para un usuario ya autenticado."""
    return jwt_handler.crear_token(usuario)
