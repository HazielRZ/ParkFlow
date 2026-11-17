"""Revalidación estricta de claims del JWT en `get_current_user` (PF-16, Tarea 1.5).

Los tokens se forjan con la misma clave del servidor para simular un `SECRET_KEY`
filtrado: la firma es válida, así que solo la revalidación de claims los detiene.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from jose import jwt

from src.main import create_app
from src.security.jwt_handler import PARKFLOW_JWT_ALGORITHM, PARKFLOW_JWT_SECRET_KEY
from src.security.rbac import get_current_user

ADMIN = "admin@morelia.tecnm.mx"
ID_ADMIN = 1
ID_VIGILANCIA = 2


def _token_forjado(claims: dict) -> str:
    payload = {**claims, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
    return jwt.encode(payload, PARKFLOW_JWT_SECRET_KEY, algorithm=PARKFLOW_JWT_ALGORITHM)


def test_token_con_claims_correctos_retorna_el_usuario() -> None:
    usuario = asyncio.run(get_current_user(_token_forjado({"sub": ADMIN, "id_usuario": ID_ADMIN})))

    assert usuario.id_usuario == ID_ADMIN
    assert usuario.rol.value == "Administrador"


@pytest.mark.parametrize(
    "claims",
    [
        {"sub": "admin@gmail.com", "id_usuario": ID_ADMIN},
        {"sub": "admin@morelia.tecnm.mx.evil.com", "id_usuario": ID_ADMIN},
        {"sub": ADMIN, "id_usuario": ID_VIGILANCIA},
        {"sub": ADMIN, "id_usuario": 999},
        {"sub": ADMIN, "id_usuario": True},
        {"sub": ADMIN, "id_usuario": "1"},
        {"sub": 123, "id_usuario": ID_ADMIN},
        {"sub": "noexiste@morelia.tecnm.mx", "id_usuario": ID_ADMIN},
        {"id_usuario": ID_ADMIN},
        {"sub": ADMIN},
    ],
    ids=[
        "dominio-externo",
        "dominio-falso-como-prefijo",
        "id-de-otra-cuenta",
        "id-inexistente",
        "id-booleano",
        "id-como-texto",
        "sub-no-es-texto",
        "correo-no-registrado",
        "sin-sub",
        "sin-id",
    ],
)
def test_token_con_claims_invalidos_retorna_401(claims: dict) -> None:
    with pytest.raises(HTTPException) as exc:
        asyncio.run(get_current_user(_token_forjado(claims)))

    assert exc.value.status_code == 401
    assert exc.value.headers == {"WWW-Authenticate": "Bearer"}


def test_endpoint_protegido_rechaza_token_con_id_de_otra_cuenta() -> None:
    """Correo de Vigilancia con el id del Administrador: no debe heredar permisos de admin."""
    client = TestClient(create_app())
    token = _token_forjado({"sub": "vigilancia@morelia.tecnm.mx", "id_usuario": ID_ADMIN})

    respuesta = client.post(
        "/api/calibracion/cajones",
        json={"parking_lot_id": "L", "polygon_id": "P", "umbral_iou_libre": 0.2, "umbral_iou_ocupado": 0.5},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert respuesta.status_code == 401
