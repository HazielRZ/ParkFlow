"""Pruebas unitarias para el módulo de reportes analíticos y exportación PDF/CSV (PF-24)."""

from fastapi.testclient import TestClient

from src.main import create_app


def test_consulta_analitica_por_campus_y_turno() -> None:
    client = TestClient(create_app())
    resp = client.get(
        "/api/reportes/analitica",
        params={
            "fecha_inicio": "2026-11-18",
            "fecha_fin": "2026-11-24",
            "campus": "CAMPUS-1",
            "turno": "Matutino",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["filtros"]["campus"] == "CAMPUS-1"
    assert data["filtros"]["turno"] == "Matutino"
    assert data["resumen"]["cajones_totales"] == 180
    assert data["resumen"]["estancia_promedio_min"] > 0
    assert data["resumen"]["indice_rotacion_vehicular"] > 0
    assert len(data["horas_pico"]) > 0


def test_exportar_reporte_csv_y_pdf() -> None:
    client = TestClient(create_app())
    params = {"campus": "CAMPUS-2", "turno": "Vespertino"}

    r_csv = client.get("/api/reportes/exportar/csv", params=params)
    assert r_csv.status_code == 200
    assert "text/csv" in r_csv.headers["content-type"]
    assert "Indice de Rotacion Vehicular" in r_csv.text

    r_pdf = client.get("/api/reportes/exportar/pdf", params=params)
    assert r_pdf.status_code == 200
    assert "application/pdf" in r_pdf.headers["content-type"]
    assert r_pdf.content.startswith(b"%PDF-1.4")