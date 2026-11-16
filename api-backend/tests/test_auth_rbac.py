"""Pruebas de autenticación institucional y RBAC (RNF-02 / PF-16)."""

import pytest
from fastapi.testclient import TestClient

from src.main import create_app
from src.models.usuario import RolEnum
from src.services.audit_service import auditoria_service

# Un usuario semilla por rol (ver `_construir_repositorio_demo` en `src/models/usuario.py`).
CREDENCIALES_POR_ROL = {
    RolEnum.ADMINISTRADOR: {"correo": "admin@morelia.tecnm.mx", "password": "Admin123*"},
    RolEnum.VIGILANCIA: {"correo": "vigilancia@morelia.tecnm.mx", "password": "Vigila123*"},
    RolEnum.DESARROLLADOR: {"correo": "l23121070@morelia.tecnm.mx", "password": "Dev123*"},
    RolEnum.TECH_LEAD: {"correo": "techlead@morelia.tecnm.mx", "password": "TechLead123*"},
    RolEnum.DEVOPS_QA: {"correo": "devops.qa@morelia.tecnm.mx", "password": "DevOpsQA123*"},
    RolEnum.ESTUDIANTE: {"correo": "estudiante@morelia.tecnm.mx", "password": "Estudiante123*"},
    RolEnum.INVITADO: {"correo": "invitado@morelia.tecnm.mx", "password": "Invitado123*"},
}

ENDPOINTS_PROTEGIDOS = {
    "calibracion": ("/api/calibracion/cajones", {"id_cajon": 5, "umbral_ocupado_cm": 12.5}),
    "registro_manual": ("/api/accesos/registro-manual", {"placa": "ABC-123", "id_cajon": 3}),
}

# Matriz de permisos esperada (mínimo privilegio). Se escribe a mano a propósito,
# sin importarla de las rutas: si alguien cambia los roles de un endpoint, esta
# prueba debe fallar y obligar a revisar el cambio.
ROLES_PERMITIDOS = {
    "calibracion": {RolEnum.ADMINISTRADOR},
    "registro_manual": {RolEnum.ADMINISTRADOR, RolEnum.VIGILANCIA},
}

CASOS_MATRIZ = [(endpoint, rol) for endpoint in ENDPOINTS_PROTEGIDOS for rol in RolEnum]


def _auth_header(client: TestClient, credenciales: dict) -> dict:
    respuesta = client.post("/api/auth/login", json=credenciales)
    assert respuesta.status_code == 200, respuesta.text
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

    respuesta = client.post("/api/auth/login", json=CREDENCIALES_POR_ROL[RolEnum.ADMINISTRADOR])

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


@pytest.mark.parametrize("rol", list(RolEnum), ids=lambda rol: rol.name)
def test_cada_rol_tiene_usuario_semilla_que_inicia_sesion(rol: RolEnum) -> None:
    client = TestClient(create_app())

    respuesta = client.post("/api/auth/login", json=CREDENCIALES_POR_ROL[rol])

    assert respuesta.status_code == 200
    assert respuesta.json()["rol"] == rol.value


@pytest.mark.parametrize(
    ("endpoint", "rol"),
    CASOS_MATRIZ,
    ids=[f"{endpoint}-{rol.name}" for endpoint, rol in CASOS_MATRIZ],
)
def test_matriz_de_permisos_por_rol(endpoint: str, rol: RolEnum) -> None:
    client = TestClient(create_app())
    headers = _auth_header(client, CREDENCIALES_POR_ROL[rol])
    ruta, payload = ENDPOINTS_PROTEGIDOS[endpoint]
    total_logs_previos = len(auditoria_service.registros)

    respuesta = client.post(ruta, json=payload, headers=headers)

    assert len(auditoria_service.registros) == total_logs_previos + 1
    ultima_accion = auditoria_service.registros[-1].accion
    if rol in ROLES_PERMITIDOS[endpoint]:
        assert respuesta.status_code == 200
        assert not ultima_accion.startswith("ACCESO_DENEGADO")
    else:
        assert respuesta.status_code == 403
        assert ultima_accion == f"ACCESO_DENEGADO:rol={rol.value}"


@pytest.mark.parametrize("endpoint", list(ENDPOINTS_PROTEGIDOS))
def test_endpoint_protegido_sin_token_retorna_401(endpoint: str) -> None:
    client = TestClient(create_app())
    ruta, payload = ENDPOINTS_PROTEGIDOS[endpoint]

    respuesta = client.post(ruta, json=payload)

    assert respuesta.status_code == 401
