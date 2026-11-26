# ParkFlow — `/cv-service` (Capa 1: Visión Computacional)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `INT-SW-01` (Contrato JSON) • `RF-03` (Detección Automática) • `OT-01` (Privacidad Estricta sin Captura Facial) • `RNF-01` (Latencia <= 5 s) • `RNF-07` (Precisión >= 95% día / >= 90% noche-lluvia)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Servicio aislado responsable de la captura en memoria RAM de streams de video (`RTSP`, cámara local, archivo `.mp4` o modo sintético), preprocesamiento nocturno/lluvia (`CLAHE + gamma`), inferencia vehicular mediante **Ultralytics YOLO** (restringida estrictamente a clases COCO vehiculares `car`, `motorcycle`, `bus`, `truck` — excluyendo `person` y sin escribir imágenes a disco según `OT-01`), evaluación geométrica **IoU** por polígono (`Shapely`), máquina de estados temporal (`Libre`, `En maniobra`, `Ocupado`) y despacho asíncrono no bloqueante de **deltas JSON** hacia `POST /api/v1/inference/states`.

## Estructura Interna

```text
cv-service/
├── config/
│   └── polygons_itm_campus1.json   # Polígonos calibrados (ITM Campus 1 Norte)
├── data/validation/
│   ├── ground_truth.json           # Dataset etiquetado day & night_rain (RNF-07)
│   └── README.md                   # Guía para sustituir por capturas reales del campus
├── reports/                        # Reportes generados (MD, JSON y PNG de matriz de confusión)
├── scripts/
│   ├── evaluate_accuracy.py        # Evaluador RNF-07 y generador de matriz de confusión
│   └── benchmark_latency.py        # Benchmark E2E HTTP + WebSocket RNF-01 (< 5 s)
├── src/
│   ├── capture/                    # Ingestión en RAM (RTSP, archivo, webcam o sintético)
│   ├── detector/                   # YOLO vehicular + preprocesamiento CLAHE/gamma (OT-01)
│   ├── polygon_mapper/             # Cargador de polígonos y evaluador IoU/cobertura
│   ├── state_machine/              # FSM temporal con histéresis por frames
│   ├── client/                     # Detector de deltas + emisor HTTP asíncrono (PF-15)
│   ├── evaluation/                 # Motor de métricas y matriz de confusión (RNF-07)
│   ├── engine.py                   # Orquestador PF-14 + CLI dry-run
│   └── models.py                   # Modelos Pydantic INT-SW-01 y SpotInferenceResult
├── tests/
├── .env.example
├── Dockerfile
└── requirements.txt
```

## Comandos Rápidos

### Modo Dry-Run (sin backend, solo consola)
```bash
python -m src.engine --dry-run --source synthetic:night_rain --frames 10
```

### Emisor Asíncrono en Vivo hacia `/api-backend`
```bash
python -m src.client.async_publisher --demo --source synthetic:day --frames 20
```

### Validación de Precisión (`RNF-07`) y Matriz de Confusión
```bash
python scripts/evaluate_accuracy.py
```

### Benchmark de Latencia (`RNF-01` < 5 s)
```bash
python scripts/benchmark_latency.py
```

## Reglas de Aislamiento (`RNF-05`) y Privacidad (`OT-01`)

- Este servicio **no importa código fuente** de `/api-backend` ni de `/client-app`.
- Toda comunicación de salida cumple estrictamente con `contracts/json-schema/inference-state.schema.json`.
- Queda prohibido detectar/rastrear peatones (`person`), capturar rostros o guardar frames crudos en disco.
