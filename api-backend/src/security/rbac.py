"""Dependencia de usuario autenticado y guardias RBAC (RNF-02)."""

from __future__ import annotations

from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from src.models.usuario import RolEnum, usuario_repository
from src.security.jwt_handler import JWTError, jwt_handler
from src.services.audit_service import auditoria_service
from src.validators.auth_schemas import UsuarioOut

__all__ = ["VerificadorRoles", "get_current_user", "oauth2_scheme"]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UsuarioOut:
    """Decodifica el JWT de la cabecera `Authorization` y retorna el usuario actual."""
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt_handler.decodificar(token)
        correo = payload.get("sub")
        id_usuario = payload.get("id_usuario")
        if correo is None or id_usuario is None:
            raise credenciales_invalidas
    except JWTError as exc:
        raise credenciales_invalidas from exc

    # Se re-consulta el repositorio por correo (no se confía ciegamente en el
    # rol embebido en el token) para reflejar de inmediato bajas o cambios de rol.
    usuario = usuario_repository.obtener_por_correo(correo)
    if usuario is None:
        raise credenciales_invalidas

    return UsuarioOut(id_usuario=usuario.id_usuario, correo=usuario.correo, rol=usuario.rol)


class VerificadorRoles:
    """Guardia RBAC inyectable: exige que el usuario autenticado tenga un rol permitido."""

    def __init__(self, roles_permitidos: List[RolEnum]) -> None:
        self.roles_permitidos = roles_permitidos

    def __call__(self, usuario_actual: UsuarioOut = Depends(get_current_user)) -> UsuarioOut:
        if usuario_actual.rol not in self.roles_permitidos:
            auditoria_service.registrar(
                id_usuario=usuario_actual.id_usuario,
                accion=f"ACCESO_DENEGADO:rol={usuario_actual.rol.value}",
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Rol '{usuario_actual.rol.value}' sin permisos para este recurso. "
                    f"Roles permitidos: {[r.value for r in self.roles_permitidos]}"
                ),
            )
        return usuario_actual
