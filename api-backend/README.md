# ParkFlow — `/api-backend` (Capa 2: Orquestador de Negocio y Real-Time)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `INT-SW-01` (Integración con Pipeline de Visión Computacional)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Servicio backend construido con **FastAPI** responsable de:
1. Recibir actualizaciones de estados por polígono en `POST /api/v1/inference/states`.
2. Validar estrictamente en frontera (runtime) cada petición contra `contracts/json-schema/inference-state.schema.json`.
3. Rechazar inmediatamente con **HTTP 422** cualquier estado fuera de `["Libre", "Ocupado", "En maniobra"]` o valores fuera de rango (`confidence`, `iou_ratio`), y responder **HTTP 202 Accepted** al encolar eventos válidos.
4. Difundir los cambios de disponibilidad en tiempo real mediante **WebSockets** hacia `/client-app`.

## Estructura Interna

```text
api-backend/
├── src/
│   ├── api/              # Endpoints REST e ingestión de inferencia (POST /api/v1/inference/states)
│   ├── websocket/        # Gateway de broadcast en tiempo real hacia /client-app
│   ├── services/         # Cálculo de ocupación y alertas de capacidad (RF-04)
│   ├── models/           # Entidades de dominio y persistencia
│   ├── validators/       # Validación en runtime con JSON Schema (Draft 2020-12)
│   └── main.py           # Punto de entrada FastAPI
├── tests/
├── Dockerfile
├── .dockerignore
└── requirements.txt
```
