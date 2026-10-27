# ParkFlow — `/cv-service` (Capa 1: Visión Computacional)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `INT-SW-01` (Integración con Pipeline de Visión Computacional)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Servicio aislado responsable de la captura de streams de video (RTSP), inferencia vehicular mediante **Ultralytics YOLO** y **OpenCV**, evaluación geométrica de intersección sobre unión (**IoU**) por polígono de cajón, filtrado temporal de estados (`Libre`, `En maniobra`, `Ocupado`) y despacho HTTP hacia `/api-backend`.

## Estructura Interna

```text
cv-service/
├── src/
│   ├── capture/          # Ingestión y calibración de streams RTSP / video
│   ├── detector/         # Motor de inferencia vehicular YOLO
│   ├── polygon_mapper/   # Evaluación geométrica IoU contra polígonos de cajón
│   ├── state_machine/    # Máquina de estados finitos con filtro temporal
│   ├── client/           # Cliente HTTP emisor hacia POST /api/v1/inference/states
│   └── models.py         # Modelos Pydantic alineados con inference-state.schema.json
├── tests/
├── Dockerfile
├── .dockerignore
└── requirements.txt
```

## Reglas de Aislamiento (`RNF-05`)

- Este servicio **no importa código fuente** de `/api-backend` ni de `/client-app`.
- Toda comunicación de salida cumple estrictamente con el esquema declarativo `contracts/json-schema/inference-state.schema.json`.
