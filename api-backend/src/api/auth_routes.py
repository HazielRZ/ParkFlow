"""Endpoint de autenticación institucional `POST /api/auth/login` (RNF-02)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from src.services.auth_service import autenticar_usuario, emitir_token
from src.services.audit_service import auditoria_service
from src.validators.auth_schemas import Token, UsuarioLogin


def build_auth_router() -> APIRouter:
    """Construye el router de autenticación."""
    router = APIRouter(prefix="/api/auth", tags=["Auth"])

    @router.post(
        "/login",
        response_model=Token,
        summary="Iniciar sesión con correo institucional",
        operation_id="loginUsuario",
    )
    def login(credenciales: UsuarioLogin) -> Token:
        usuario = autenticar_usuario(credenciales.correo, credenciales.password)
        if usuario is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Correo o contraseña incorrectos",
            )

        access_token, expira_en = emitir_token(usuario)
        auditoria_service.registrar(id_usuario=usuario.id_usuario, accion="LOGIN_EXITOSO")

        return Token(access_token=access_token, rol=usuario.rol, expira_en=expira_en)

    return router
