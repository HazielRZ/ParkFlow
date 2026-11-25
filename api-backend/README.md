# ParkFlow — `/api-backend` (Capa 2: Orquestador de Negocio y Real-Time)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `INT-SW-01` (Integración con Pipeline de Visión Computacional)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Servicio backend construido con **FastAPI** responsable de:
1. Recibir actualizaciones de estados por polígono en `POST /api/v1/inference/states`.
2. Validar estrictamente en frontera (runtime) cada petición contra `contracts/json-schema/inference-state.schema.json`.
3. Rechazar inmediatamente con **HTTP 422** cualquier estado fuera de `["Libre", "Ocupado", "En maniobra"]` o valores fuera de rango (`confidence`, `iou_ratio`), y responder **HTTP 202 Accepted** al encolar eventos válidos.
4. Difundir los cambios de disponibilidad en tiempo real mediante **WebSockets** hacia `/client-app` y los paneles LED, segmentados por campus y zona (≤ 3 s), y ofrecer un **snapshot REST** para la carga inicial.

## Estructura Interna

```text
api-backend/
├── src/
│   ├── api/              # Endpoints REST e ingestión de inferencia (POST /api/v1/inference/states)
│   ├── websocket/        # ConnectionManager: difusión en tiempo real por campus y zona
│   ├── services/         # Cálculo de ocupación y alertas de capacidad (RF-04)
│   ├── models/           # Entidades de dominio y persistencia
│   ├── security/         # JWT y guardias RBAC (RNF-02)
│   ├── validators/       # Validación en runtime con JSON Schema (Draft 2020-12)
│   └── main.py           # Punto de entrada FastAPI
├── tests/
├── Dockerfile
├── .dockerignore
└── requirements.txt
```

## Aforo en tiempo real (INT-COM-01 / RNF-01)

Contrato completo: [`contracts/openapi/aforo-realtime-spec.yaml`](../contracts/openapi/aforo-realtime-spec.yaml). La lectura es **pública**: es disponibilidad, no gestión, y los paneles LED no pueden iniciar sesión.

Una **zona** es el `parking_lot_id` de INT-SW-01 (igual que `Zone.code` en la BD) y empieza con el código de su **campus**: `ITM-CAMPUS1-EST-NORTE` pertenece a `ITM-CAMPUS1`. Los campus activos vienen de `PARKFLOW_CAMPUS_CODES` (separados por coma); si no se define, se usan los de la semilla (`ITM-CAMPUS1,ITM-CAMPUS2`).

| Tipo | Ruta | Para qué |
| :--- | :--- | :--- |
| REST | `GET /api/aforo` | Snapshot de todos los campus |
| REST | `GET /api/aforo/campus/{campus_id}` | Snapshot de un campus (carga inicial de la PWA o del panel LED) |
| REST | `GET /api/aforo/campus/{campus_id}/zonas/{zona_id}` | Snapshot de una zona |
| WebSocket | `/ws/parking-states` | Todos los eventos (canal global; lo sigue usando la PWA) |
| WebSocket | `/ws/campus/{campus_id}` | Eventos de las zonas de ese campus |
| WebSocket | `/ws/campus/{campus_id}/zonas/{zona_id}` | Eventos de una sola zona |

- **Segmentación:** `ConnectionManager` (`src/websocket/gateway.py`) manda cada evento solo al canal global, al campus de la zona y a la zona. Los clientes de otro campus no lo reciben.
- **Latencia ≤ 3 s:** el envío a los clientes es en paralelo y con tiempo límite de 1 s por cliente. Un cliente lento o caído no retrasa a los demás: se le cierra la conexión con el código `1013` y la PWA se reconecta sola.
- **Carga inicial:** abrir primero el WebSocket y luego pedir el snapshot, para no perder un cambio que ocurra entre los dos. Los snapshots se responden con `Cache-Control: no-store`, para que el service worker de la PWA no sirva datos viejos.
- **Prueba de estrés** (`tests/test_latencia_websocket.py`): levanta uvicorn real y mide la llegada de cada evento a cada cliente. Por defecto usa 200 clientes y 20 eventos; la carga se sube con variables de entorno:

  ```bash
  PARKFLOW_STRESS_CLIENTES=1000 PARKFLOW_STRESS_EVENTOS=50 python -m pytest tests/test_latencia_websocket.py -s
  ```

## Autenticación y RBAC (RNF-02 / PF-16)

Login con `POST /api/auth/login`, restringido a correos `@morelia.tecnm.mx`. Los endpoints protegidos exigen `Authorization: Bearer <token>` y validan el rol con `VerificadorRoles` (`src/security/rbac.py`).

### Roles

| Rol (`RolEnum`) | Valor | Quién lo usa |
| :--- | :--- | :--- |
| `ADMINISTRADOR` | `Administrador` | Administración del sistema y **Product Owner** (Administrador/PO es un solo rol) |
| `VIGILANCIA` | `Vigilancia` | Personal de caseta / control de accesos |
| `TECH_LEAD` | `Tech Lead` | Líder técnico del equipo |
| `DEVOPS_QA` | `DevOps/QA` | Despliegue y aseguramiento de calidad |
| `DESARROLLADOR` | `Desarrollador` | Equipo de desarrollo |
| `ESTUDIANTE` | `Estudiante` | Usuarios del estacionamiento |
| `INVITADO` | `Invitado` | Acceso temporal; puede iniciar sesión pero no consume endpoints protegidos |

### Matriz de permisos (mínimo privilegio)

| Endpoint | Administrador | Vigilancia | Tech Lead | DevOps/QA | Desarrollador | Estudiante | Invitado |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `POST /api/auth/login` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /api/calibracion/cajones` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `POST /api/accesos/registro-manual` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

❌ responde `403` y queda en la bitácora como `ACCESO_DENEGADO:rol=<rol>`. La matriz está cubierta en `tests/test_auth_rbac.py::test_matriz_de_permisos_por_rol`: si cambias los roles de un endpoint, actualiza esta tabla y ese test.

### Endpoints operativos

Los dos identifican el cajón como en el contrato INT-SW-01 (`parking_lot_id` + `polygon_id`) y responden `404` si `/cv-service` todavía no ha reportado ese cajón.

- **`POST /api/accesos/registro-manual`**: `{parking_lot_id, polygon_id, placa, estado}`, con `estado` en `Libre` (salida) u `Ocupado` (entrada). Cambia el estado real del cajón, lo difunde por WebSocket como un `parking_state_updated` y lo audita a nombre del usuario. `En maniobra` no se acepta, porque solo lo detecta la cámara. La siguiente inferencia de `/cv-service` vuelve a fijar el estado según lo que vea la cámara.
- **`POST /api/calibracion/cajones`**: `{parking_lot_id, polygon_id, umbral_iou_libre, umbral_iou_ocupado}`, ambos entre 0 y 1 y con `umbral_iou_libre < umbral_iou_ocupado` (el rango intermedio es `En maniobra`, ver AGENTS.md §5.1). Guarda la última calibración del cajón en `CalibracionService` (en memoria por ahora).

> **Base de datos**: el catálogo de roles en PostgreSQL debe contener los mismos 7 valores. `DevOps/QA` e `Invitado` son nuevos respecto a la semilla original (`Administrador`, `Vigilancia`, `Estudiante`, `Tech Lead`, `Desarrollador`).

### Bitácora de auditoría

`AuditoriaService` (`src/services/audit_service.py`) registra:

| Evento | `accion` | `id_usuario` |
| :--- | :--- | :--- |
| Login exitoso | `LOGIN_EXITOSO` | Usuario que inició sesión |
| Login fallido (`401`) | `LOGIN_FALLIDO:correo=<correo>` | La cuenta, si el correo existe (contraseña incorrecta); vacío si no existe |
| Login con correo no institucional (`422`) | `LOGIN_RECHAZADO_DOMINIO:correo=<correo>` | Vacío |
| Acceso permitido a endpoint protegido | `CALIBRACION_CAJON:...` / `REGISTRO_MANUAL_ACCESO:...` | Usuario autenticado |
| Rechazo RBAC (`403`) | `ACCESO_DENEGADO:rol=<rol>` | Usuario autenticado |
| Cambio de estado de un cajón | `CAMBIO_ESTADO_CAJON:lote=...,poligono=...,cajon=...,anterior=<estado>,nuevo=<estado>` | Vacío si lo reporta `/cv-service`; el usuario si viene de un registro manual |

Un cambio de estado se registra solo cuando el estado nuevo es distinto del anterior. La primera vez que se ve un cajón no hay estado anterior, así que no se registra.
