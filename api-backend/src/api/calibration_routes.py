"""Endpoint de calibración de cajones `POST /api/calibracion/cajones` (RNF-02 — solo Administrador)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.models.usuario import RolEnum
from src.security.rbac import VerificadorRoles
from src.services.audit_service import auditoria_service
from src.services.calibracion_service import CalibracionService
from src.services.parking_state_service import ParkingStateService
from src.validators.auth_schemas import UsuarioOut
from src.validators.operacion_schemas import CalibracionCajonesRequest


def build_calibration_router(
    state_service: ParkingStateService,
    calibracion_service: CalibracionService,
) -> APIRouter:
    """Construye el router de calibración de cajones."""
    router = APIRouter(prefix="/api/calibracion", tags=["Calibracion"])
    requiere_administrador = VerificadorRoles([RolEnum.ADMINISTRADOR])

    @router.post(
        "/cajones",
        summary="Guardar los umbrales de IoU de un cajón",
        operation_id="calibrarCajones",
    )
    def calibrar_cajones(
        datos: CalibracionCajonesRequest,
        usuario_actual: UsuarioOut = Depends(requiere_administrador),
    ) -> dict:
        if state_service.obtener_cajon(datos.parking_lot_id, datos.polygon_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    f"Cajón '{datos.polygon_id}' no encontrado en el estacionamiento "
                    f"'{datos.parking_lot_id}'"
                ),
            )

        calibracion = calibracion_service.guardar(
            parking_lot_id=datos.parking_lot_id,
            polygon_id=datos.polygon_id,
            umbral_iou_libre=datos.umbral_iou_libre,
            umbral_iou_ocupado=datos.umbral_iou_ocupado,
            actualizado_por=usuario_actual.id_usuario,
        )
        auditoria_service.registrar(
            id_usuario=usuario_actual.id_usuario,
            accion=(
                f"CALIBRACION_CAJON:lote={calibracion.parking_lot_id},"
                f"poligono={calibracion.polygon_id},"
                f"umbral_iou_libre={calibracion.umbral_iou_libre},"
                f"umbral_iou_ocupado={calibracion.umbral_iou_ocupado}"
            ),
        )
        return {
            "mensaje": "Calibración guardada",
            "parking_lot_id": calibracion.parking_lot_id,
            "polygon_id": calibracion.polygon_id,
            "umbral_iou_libre": calibracion.umbral_iou_libre,
            "umbral_iou_ocupado": calibracion.umbral_iou_ocupado,
            "actualizado_por": usuario_actual.correo,
            "actualizado_en": calibracion.actualizado_en.isoformat().replace("+00:00", "Z"),
        }

    return router
