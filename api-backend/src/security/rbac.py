"""Dependencia de usuario autenticado y guardias RBAC (RNF-02)."""

from __future__ import annotations

from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from src.models.usuario import RolEnum, usuario_repository
from src.security.jwt_handler import JWTError, jwt_handler
from src.services.audit_service import auditoria_service
from src.validators.auth_schemas import UsuarioOut, es_correo_institucional

__all__ = ["VerificadorRoles", "get_current_user", "oauth2_scheme"]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> UsuarioOut:
    """Decodifica el JWT de la cabecera `Authorization` y retorna el usuario actual.

    Aunque la firma sea válida, los claims se revalidan (defensa en profundidad, RNF-02):
    si el `SECRET_KEY` se filtra o se queda el valor dummy, un token forjado no basta.
    """
    credenciales_invalidas = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt_handler.decodificar(token)
    except JWTError as exc:
        raise credenciales_invalidas from exc

    correo = payload.get("sub")
    id_usuario = payload.get("id_usuario")
    if not isinstance(correo, str) or not es_correo_institucional(correo):
        raise credenciales_invalidas
    # `bool` se excluye a propósito: en Python `True == 1`, y un token con
    # `"id_usuario": true` pasaría la comparación contra el usuario 1.
    if not isinstance(id_usuario, int) or isinstance(id_usuario, bool):
        raise credenciales_invalidas

    # Se re-consulta el repositorio por correo (no se confía ciegamente en el
    # rol embebido en el token) para reflejar de inmediato bajas o cambios de rol.
    usuario = usuario_repository.obtener_por_correo(correo)
    # El id del token debe ser el de la cuenta dueña del correo. Si no coincide, el
    # token es de otra cuenta (p. ej. el correo se reasignó) o fue forjado.
    if usuario is None or usuario.id_usuario != id_usuario:
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
