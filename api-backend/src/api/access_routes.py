"""Endpoint de registro manual de accesos `POST /api/accesos/registro-manual` (Administrador/Vigilancia)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.models.usuario import RolEnum
from src.security.rbac import VerificadorRoles
from src.services.audit_service import auditoria_service
from src.validators.auth_schemas import AccesoManualRequest, UsuarioOut


def build_access_router() -> APIRouter:
    """Construye el router de registro manual de accesos."""
    router = APIRouter(prefix="/api/accesos", tags=["Accesos"])
    requiere_admin_o_vigilancia = VerificadorRoles([RolEnum.ADMINISTRADOR, RolEnum.VIGILANCIA])

    @router.post(
        "/registro-manual",
        summary="Registrar manualmente el acceso de un vehículo",
        operation_id="registrarAccesoManual",
    )
    def registro_manual(
        datos: AccesoManualRequest,
        usuario_actual: UsuarioOut = Depends(requiere_admin_o_vigilancia),
    ) -> dict:
        auditoria_service.registrar(
            id_usuario=usuario_actual.id_usuario,
            accion=f"REGISTRO_MANUAL_ACCESO:placa={datos.placa},cajon={datos.id_cajon}",
        )
        return {
            "mensaje": "Acceso manual registrado",
            "placa": datos.placa,
            "id_cajon": datos.id_cajon,
            "registrado_por": usuario_actual.correo,
        }

    return router
