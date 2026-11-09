"""Pruebas de autenticación institucional y RBAC (RNF-02)."""

from fastapi.testclient import TestClient

from src.main import create_app
from src.services.audit_service import auditoria_service

CREDENCIALES_ADMIN = {"correo": "admin@morelia.tecnm.mx", "password": "Admin123*"}
CREDENCIALES_VIGILANCIA = {"correo": "vigilancia@morelia.tecnm.mx", "password": "Vigila123*"}
CREDENCIALES_DESARROLLADOR = {"correo": "l23121070@morelia.tecnm.mx", "password": "Dev123*"}


def _auth_header(client: TestClient, credenciales: dict) -> dict:
    respuesta = client.post("/api/auth/login", json=credenciales)
    token = respuesta.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_login_rechaza_correo_no_institucional() -> None:
    client = TestClient(create_app())
    respuesta = client.post(
        "/api/auth/login", json={"correo": "hacker@gmail.com", "password": "x"}
    )
    assert respuesta.status_code == 422


def test_login_exitoso_retorna_jwt_y_registra_auditoria() -> None:
    client = TestClient(create_app())
    total_logs_previos = len(auditoria_service.registros)

    respuesta = client.post("/api/auth/login", json=CREDENCIALES_ADMIN)

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["rol"] == "Administrador"
    assert cuerpo["token_type"] == "bearer"
    assert len(auditoria_service.registros) == total_logs_previos + 1
    assert auditoria_service.registros[-1].accion == "LOGIN_EXITOSO"


def test_login_credenciales_incorrectas_retorna_401() -> None:
    client = TestClient(create_app())
    respuesta = client.post(
        "/api/auth/login",
        json={"correo": "admin@morelia.tecnm.mx", "password": "incorrecta"},
    )
    assert respuesta.status_code == 401


def test_calibracion_cajones_permite_administrador() -> None:
    client = TestClient(create_app())
    headers = _auth_header(client, CREDENCIALES_ADMIN)

    respuesta = client.post(
        "/api/calibracion/cajones",
        json={"id_cajon": 5, "umbral_ocupado_cm": 12.5},
        headers=headers,
    )

    assert respuesta.status_code == 200


def test_calibracion_cajones_rechaza_rol_sin_permiso() -> None:
    client = TestClient(create_app())
    headers = _auth_header(client, CREDENCIALES_DESARROLLADOR)
    total_logs_previos = len(auditoria_service.registros)

    respuesta = client.post(
        "/api/calibracion/cajones",
        json={"id_cajon": 5, "umbral_ocupado_cm": 12.5},
        headers=headers,
    )

    assert respuesta.status_code == 403
    assert len(auditoria_service.registros) == total_logs_previos + 1
    assert auditoria_service.registros[-1].accion.startswith("ACCESO_DENEGADO")


def test_calibracion_cajones_sin_token_retorna_401() -> None:
    client = TestClient(create_app())
    respuesta = client.post(
        "/api/calibracion/cajones", json={"id_cajon": 5, "umbral_ocupado_cm": 12.5}
    )
    assert respuesta.status_code == 401


def test_registro_manual_permite_vigilancia() -> None:
    client = TestClient(create_app())
    headers = _auth_header(client, CREDENCIALES_VIGILANCIA)

    respuesta = client.post(
        "/api/accesos/registro-manual",
        json={"placa": "ABC-123", "id_cajon": 3},
        headers=headers,
    )

    assert respuesta.status_code == 200


def test_registro_manual_rechaza_estudiante() -> None:
    client = TestClient(create_app())
    headers = _auth_header(client, CREDENCIALES_DESARROLLADOR)

    respuesta = client.post(
        "/api/accesos/registro-manual",
        json={"placa": "ABC-123", "id_cajon": 3},
        headers=headers,
    )

    assert respuesta.status_code == 403
