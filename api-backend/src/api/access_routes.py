"""Endpoint de registro manual de accesos `POST /api/accesos/registro-manual` (Administrador/Vigilancia)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.models.usuario import RolEnum
from src.security.rbac import VerificadorRoles
from src.services.audit_service import auditoria_service
from src.services.parking_state_service import ParkingStateService
from src.validators.auth_schemas import UsuarioOut
from src.validators.operacion_schemas import AccesoManualRequest


def build_access_router(state_service: ParkingStateService) -> APIRouter:
    """Construye el router de registro manual de accesos."""
    router = APIRouter(prefix="/api/accesos", tags=["Accesos"])
    requiere_admin_o_vigilancia = VerificadorRoles([RolEnum.ADMINISTRADOR, RolEnum.VIGILANCIA])

    @router.post(
        "/registro-manual",
        summary="Registrar manualmente la entrada o salida de un vehículo en un cajón",
        operation_id="registrarAccesoManual",
    )
    async def registro_manual(
        datos: AccesoManualRequest,
        usuario_actual: UsuarioOut = Depends(requiere_admin_o_vigilancia),
    ) -> dict:
        cajon = await state_service.actualizar_estado_manual(
            parking_lot_id=datos.parking_lot_id,
            polygon_id=datos.polygon_id,
            estado=datos.estado,
            id_usuario=usuario_actual.id_usuario,
        )
        if cajon is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Cajón '{datos.polygon_id}' no encontrado en el estacionamiento "
                    f"'{datos.parking_lot_id}'"
                ),
            )

        auditoria_service.registrar(
            id_usuario=usuario_actual.id_usuario,
            accion=(
                f"REGISTRO_MANUAL_ACCESO:lote={cajon.parking_lot_id},"
                f"poligono={cajon.polygon_id},placa={datos.placa},estado={cajon.state}"
            ),
        )
        return {
            "mensaje": "Acceso manual registrado",
            "parking_lot_id": cajon.parking_lot_id,
            "polygon_id": cajon.polygon_id,
            "slot_name": cajon.slot_name,
            "estado": cajon.state,
            "placa": datos.placa,
            "registrado_por": usuario_actual.correo,
        }

    return router
