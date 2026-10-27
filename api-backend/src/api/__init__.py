"""Rutas HTTP REST del servidor `/api-backend`."""

from .inference_routes import build_inference_router

__all__ = ["build_inference_router"]
