"""Emisión y verificación de JSON Web Tokens (RNF-02)."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Tuple

from jose import JWTError, jwt

from src.models.usuario import UsuarioRecord

__all__ = ["JWTError", "JWTHandler", "jwt_handler"]

# Valores por defecto para desarrollo local; en despliegue se sobreescriben
# mediante variables de entorno (ver docker-compose.yml).
PARKFLOW_JWT_SECRET_KEY = os.getenv(
    "PARKFLOW_JWT_SECRET_KEY", "parkflow-itm-dummy-secret-key-CAMBIAR-EN-PRODUCCION"
)
PARKFLOW_JWT_ALGORITHM = os.getenv("PARKFLOW_JWT_ALGORITHM", "HS256")
PARKFLOW_JWT_EXPIRE_MINUTES = int(os.getenv("PARKFLOW_JWT_EXPIRE_MINUTES", "60"))


class JWTHandler:
    """Encapsula la creación y verificación de tokens de acceso."""

    def __init__(self, secret_key: str, algorithm: str, expire_minutes: int) -> None:
        self._secret_key = secret_key
        self._algorithm = algorithm
        self._expire_minutes = expire_minutes

    def crear_token(self, usuario: UsuarioRecord) -> Tuple[str, int]:
        expira_en_segundos = self._expire_minutes * 60
        expira = datetime.now(timezone.utc) + timedelta(seconds=expira_en_segundos)
        payload = {
            "sub": usuario.correo,
            "id_usuario": usuario.id_usuario,
            "rol": usuario.rol.value,
            "exp": expira,
        }
        token = jwt.encode(payload, self._secret_key, algorithm=self._algorithm)
        return token, expira_en_segundos

    def decodificar(self, token: str) -> dict:
        return jwt.decode(token, self._secret_key, algorithms=[self._algorithm])


jwt_handler = JWTHandler(
    secret_key=PARKFLOW_JWT_SECRET_KEY,
    algorithm=PARKFLOW_JWT_ALGORITHM,
    expire_minutes=PARKFLOW_JWT_EXPIRE_MINUTES,
)
