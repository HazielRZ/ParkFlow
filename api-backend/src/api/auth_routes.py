"""Endpoint de autenticación institucional `POST /api/auth/login` (RNF-02)."""

from __future__ import annotations

from typing import Any, Callable, Coroutine

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute

from src.services.audit_service import auditoria_service
from src.services.auth_service import autenticar_usuario, emitir_token, obtener_id_usuario
from src.validators.auth_schemas import ERROR_DOMINIO_NO_INSTITUCIONAL, Token, UsuarioLogin


class RutaConAuditoriaDeDominio(APIRoute):
    """Audita los logins rechazados por correo no institucional.

    Ese rechazo lo hace el validador de `UsuarioLogin` antes de que se ejecute el
    endpoint, así que se intercepta aquí. La respuesta 422 sigue siendo la estándar.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler_original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            try:
                return await handler_original(request)
            except RequestValidationError as exc:
                rechazo = next(
                    (e for e in exc.errors() if e.get("type") == ERROR_DOMINIO_NO_INSTITUCIONAL),
                    None,
                )
                if rechazo is not None:
                    auditoria_service.registrar(
                        id_usuario=None,
                        accion=f"LOGIN_RECHAZADO_DOMINIO:correo={rechazo.get('input')}",
                    )
                raise

        return handler


def build_auth_router() -> APIRouter:
    """Construye el router de autenticación."""
    router = APIRouter(
        prefix="/api/auth", tags=["Auth"], route_class=RutaConAuditoriaDeDominio
    )

    @router.post(
        "/login",
        response_model=Token,
        summary="Iniciar sesión con correo institucional",
        operation_id="loginUsuario",
    )
    def login(credenciales: UsuarioLogin) -> Token:
        usuario = autenticar_usuario(credenciales.correo, credenciales.password)
        if usuario is None:
            # `id_usuario` apunta a la cuenta atacada si el correo existe (contraseña
            # incorrecta); es `None` si el correo no está registrado. Al cliente se le
            # responde lo mismo en ambos casos para no revelar qué cuentas existen.
            auditoria_service.registrar(
                id_usuario=obtener_id_usuario(credenciales.correo),
                accion=f"LOGIN_FALLIDO:correo={credenciales.correo}",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Correo o contraseña incorrectos",
            )

        access_token, expira_en = emitir_token(usuario)
        auditoria_service.registrar(id_usuario=usuario.id_usuario, accion="LOGIN_EXITOSO")

        return Token(access_token=access_token, rol=usuario.rol, expira_en=expira_en)

    return router
