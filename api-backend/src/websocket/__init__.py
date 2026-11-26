"""Gateway WebSocket para difusión en tiempo real hacia `/client-app` y paneles LED."""

from .gateway import ConnectionManager, WebSocketBroadcastGateway

__all__ = ["ConnectionManager", "WebSocketBroadcastGateway"]
