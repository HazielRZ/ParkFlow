"""Endpoints de registro manual de accesos, pulsos de barreras y sobrescritura con lock."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.models.usuario import RolEnum
from src.security.rbac import VerificadorRoles
from src.services.audit_service import auditoria_service
from src.services.parking_state_service import ParkingStateService
from src.validators.auth_schemas import UsuarioOut
from src.validators.operacion_schemas import (
    AccesoManualRequest,
    LiberarBloqueoRequest,
    PulsoBarreraRequest,
    SobrescrituraManualRequest,
)


def build_access_router(state_service: ParkingStateService) -> APIRouter:
    """Construye el router de accesos, barreras físicas y sobrescritura manual."""
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

    @router.post(
        "/barreras/pulso",
        summary="Recibir pulso de entrada/salida desde sensores o plumas físicas (INT-HW-02)",
        operation_id="registrarPulsoBarrera",
    )
    async def pulso_barrera(datos: PulsoBarreraRequest) -> dict:
        metricas = await state_service.registrar_pulso_barrera(
            parking_lot_id=datos.parking_lot_id,
            barrier_id=datos.barrier_id,
            evento=datos.evento,
        )
        return {
            "mensaje": "Pulso de barrera procesado",
            "parking_lot_id": datos.parking_lot_id,
            "barrier_id": datos.barrier_id,
            "evento": datos.evento,
            "metrics": metricas,
        }

    @router.post(
        "/sobrescritura-manual",
        summary="Forzar estado de un cajón con bloqueo temporal ante inferencia CV (RF-03)",
        operation_id="sobrescrituraManualCajon",
    )
    async def sobrescritura_manual(
        datos: SobrescrituraManualRequest,
        usuario_actual: UsuarioOut = Depends(requiere_admin_o_vigilancia),
    ) -> dict:
        cajon = await state_service.forzar_estado_con_lock(
            parking_lot_id=datos.parking_lot_id,
            polygon_id=datos.polygon_id,
            estado=datos.estado,
            motivo=datos.motivo,
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
        return {
            "mensaje": "Sobrescritura manual aplicada con bloqueo activo",
            "parking_lot_id": cajon.parking_lot_id,
            "polygon_id": cajon.polygon_id,
            "slot_name": cajon.slot_name,
            "estado": cajon.state,
            "manual_lock": cajon.manual_lock,
            "motivo": cajon.lock_reason,
            "registrado_por": usuario_actual.correo,
        }

    @router.post(
        "/liberar-bloqueo",
        summary="Liberar el bloqueo manual de un cajón para devolver control a visión artificial",
        operation_id="liberarBloqueoManualCajon",
    )
    async def liberar_bloqueo(
        datos: LiberarBloqueoRequest,
        usuario_actual: UsuarioOut = Depends(requiere_admin_o_vigilancia),
    ) -> dict:
        cajon = await state_service.liberar_bloqueo_manual(
            parking_lot_id=datos.parking_lot_id,
            polygon_id=datos.polygon_id,
            motivo=datos.motivo,
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
        return {
            "mensaje": "Bloqueo manual liberado",
            "parking_lot_id": cajon.parking_lot_id,
            "polygon_id": cajon.polygon_id,
            "slot_name": cajon.slot_name,
            "manual_lock": cajon.manual_lock,
            "liberado_por": usuario_actual.correo,
        }

    return router