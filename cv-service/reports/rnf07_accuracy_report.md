# ParkFlow — Reporte de Validación de Precisión IA (`RNF-07`)

- **Generado:** `2026-11-25T15:36:18.030425Z`
- **Dataset:** `ParkFlow ITM Campus 1 Validation Suite (RNF-07)` (`structured_mock_campus_polygons`)
- **Resultado Global RNF-07:** `PASS`

## Resumen por Escenario

| Escenario | Muestras | Aciertos | Accuracy | Umbral ERS | Macro-F1 | Weighted-F1 | Estado |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| `day` | 120 | 117 | 97.50% | >= 95% | 0.9751 | 0.9751 | **PASS** |
| `night_rain` | 120 | 112 | 93.33% | >= 90% | 0.9337 | 0.9337 | **PASS** |
| `overall` | 240 | 229 | 95.42% | N/A | 0.9544 | 0.9544 | INFO |

## Matriz de Confusión — `day` (97.50%)

| Real \ Predicho | Libre | Ocupado | En maniobra |
| :--- | ---: | ---: | ---: |
| **Libre** | 39 | 0 | 1 |
| **Ocupado** | 0 | 39 | 1 |
| **En maniobra** | 0 | 1 | 39 |

| Clase | Soporte | Precision | Recall | F1-Score |
| :--- | ---: | ---: | ---: | ---: |
| `Libre` | 40 | 1.0000 | 0.9750 | 0.9873 |
| `Ocupado` | 40 | 0.9750 | 0.9750 | 0.9750 |
| `En maniobra` | 40 | 0.9512 | 0.9750 | 0.9630 |

## Matriz de Confusión — `night_rain` (93.33%)

| Real \ Predicho | Libre | Ocupado | En maniobra |
| :--- | ---: | ---: | ---: |
| **Libre** | 38 | 0 | 2 |
| **Ocupado** | 0 | 37 | 3 |
| **En maniobra** | 2 | 1 | 37 |

| Clase | Soporte | Precision | Recall | F1-Score |
| :--- | ---: | ---: | ---: | ---: |
| `Libre` | 40 | 0.9500 | 0.9500 | 0.9500 |
| `Ocupado` | 40 | 0.9737 | 0.9250 | 0.9487 |
| `En maniobra` | 40 | 0.8810 | 0.9250 | 0.9024 |
