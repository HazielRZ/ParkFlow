"""Rutas HTTP REST del servidor `/api-backend`."""

from .access_routes import build_access_router
from .aforo_routes import build_aforo_router
from .auth_routes import build_auth_router
from .calibration_routes import build_calibration_router
from .inference_routes import build_inference_router

__all__ = [
    "build_inference_router",
    "build_access_router",
    "build_aforo_router",
    "build_auth_router",
    "build_calibration_router",
]
