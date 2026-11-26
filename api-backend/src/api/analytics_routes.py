"""Endpoints REST de reportes analíticos históricos y exportación PDF/CSV (PF-24 / CU-04)."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query, Response

from src.services.analytics_service import AnalyticsService


def build_analytics_router(analytics_service: AnalyticsService) -> APIRouter:
    """Construye los endpoints de agregación histórica y descarga de reportes."""
    router = APIRouter(prefix="/api/reportes", tags=["Reportes Analíticos"])

    @router.get(
        "/analitica",
        summary="Consultar métricas agregadas por fecha, campus y turno",
        operation_id="obtenerAnaliticaHistorica",
    )
    def obtener_analitica(
        fecha_inicio: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
        fecha_fin: Optional[str] = Query(default=None, description="YYYY-MM-DD"),
        campus: str = Query(default="TODOS", description="CAMPUS-1 | CAMPUS-2 | TODOS"),
        turno: str = Query(default="TODOS", description="Matutino | Vespertino | TODOS"),
    ) -> dict:
        return analytics_service.generar_reporte(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            campus=campus,
            turno=turno,
        )

    @router.get(
        "/exportar/csv",
        summary="Exportar reporte analítico en formato CSV",
        operation_id="exportarReporteCsv",
    )
    def exportar_csv(
        fecha_inicio: Optional[str] = Query(default=None),
        fecha_fin: Optional[str] = Query(default=None),
        campus: str = Query(default="TODOS"),
        turno: str = Query(default="TODOS"),
    ) -> Response:
        reporte = analytics_service.generar_reporte(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            campus=campus,
            turno=turno,
        )
        contenido_csv = analytics_service.exportar_csv(reporte)
        nombre = f"parkflow_reporte_{reporte['filtros']['campus'].lower()}.csv"
        return Response(
            content=contenido_csv,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
        )

    @router.get(
        "/exportar/pdf",
        summary="Exportar reporte ejecutivo institucional en formato PDF",
        operation_id="exportarReportePdf",
    )
    def exportar_pdf(
        fecha_inicio: Optional[str] = Query(default=None),
        fecha_fin: Optional[str] = Query(default=None),
        campus: str = Query(default="TODOS"),
        turno: str = Query(default="TODOS"),
    ) -> Response:
        reporte = analytics_service.generar_reporte(
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            campus=campus,
            turno=turno,
        )
        contenido_pdf = analytics_service.exportar_pdf(reporte)
        nombre = f"parkflow_ejecutivo_{reporte['filtros']['campus'].lower()}.pdf"
        return Response(
            content=contenido_pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
        )

    return router