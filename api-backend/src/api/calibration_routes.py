"""Endpoint de calibración de cajones `POST /api/calibracion/cajones` (RNF-02 — solo Administrador)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.models.usuario import RolEnum
from src.security.rbac import VerificadorRoles
from src.services.audit_service import auditoria_service
from src.validators.auth_schemas import CalibracionCajonesRequest, UsuarioOut


def build_calibration_router() -> APIRouter:
    """Construye el router de calibración de cajones."""
    router = APIRouter(prefix="/api/calibracion", tags=["Calibracion"])
    requiere_administrador = VerificadorRoles([RolEnum.ADMINISTRADOR])

    @router.post(
        "/cajones",
        summary="Calibrar umbrales de detección de un cajón",
        operation_id="calibrarCajones",
    )
    def calibrar_cajones(
        datos: CalibracionCajonesRequest,
        usuario_actual: UsuarioOut = Depends(requiere_administrador),
    ) -> dict:
        auditoria_service.registrar(
            id_usuario=usuario_actual.id_usuario,
            accion=f"CALIBRACION_CAJON:id={datos.id_cajon}",
        )
        return {
            "mensaje": "Calibración aplicada correctamente",
            "id_cajon": datos.id_cajon,
            "umbral_ocupado_cm": datos.umbral_ocupado_cm,
            "realizado_por": usuario_actual.correo,
        }

    return router
