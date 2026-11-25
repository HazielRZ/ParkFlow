# Dataset de Validación RNF-07 (`day` & `night_rain`)

Este directorio contiene la batería de evaluación cuantitativa para validar el requisito **RNF-07**:

- Escenario `day` (luz diurna natural): **Accuracy >= 95%**
- Escenario `night_rain` (iluminación nocturna o lluvia moderada): **Accuracy >= 90%**

## Estructura actual (`ground_truth.json`)

Actualmente el archivo [ground_truth.json](file:///C:/Users/Hazie/.gemini/antigravity/worktrees/ParkFlow/pf15_cv_json_publisher/cv-service/data/validation/ground_truth.json) incluye **240 evaluaciones etiquetadas** (`120` en `day` y `120` en `night_rain`, balanceadas entre `Libre`, `Ocupado` y `En maniobra`) con coordenadas reales del estacionamiento `ITM-CAMPUS1-EST-NORTE`.

Cada muestra se evalúa directamente a través del pipeline real de `/cv-service`:
`YoloVehicleDetector.filter_raw_detections` → `PolygonIoUEvaluator` → `SlotTemporalStateMachine`.

## Cómo sustituirlo por capturas reales del campus sin cambiar código

1. Coloca las capturas etiquetadas (sin rostros ni datos personales, cumplimiento `OT-01`) en `cv-service/data/validation/images/day/` y `cv-service/data/validation/images/night_rain/`.
2. En `ground_truth.json`, reemplaza el campo `"frames"` de cada muestra por `"image_path": "images/day/frame_001.jpg"` (ruta relativa a `data/validation/`), conservando `scenario`, `spot_id`, `slot_name`, `polygon_vertices` y `ground_truth`.
3. Ejecuta nuevamente el evaluador sin modificar una sola línea de código:

```bash
python scripts/evaluate_accuracy.py
```

El evaluador detectará automáticamente `"image_path"`, aplicará el preprocesamiento CLAHE/gamma (`FramePreprocessor`), inferirá vehículos con `YoloVehicleDetector` (excluyendo `person`), calculará IoU por polígono y regenerará la matriz de confusión en `cv-service/reports/`.
