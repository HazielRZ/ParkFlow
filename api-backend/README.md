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
│   ├── security/         # JWT y guardias RBAC (RNF-02)
│   ├── validators/       # Validación en runtime con JSON Schema (Draft 2020-12)
│   └── main.py           # Punto de entrada FastAPI
├── tests/
├── Dockerfile
├── .dockerignore
└── requirements.txt
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

> **Base de datos**: el catálogo de roles en PostgreSQL debe contener los mismos 7 valores. `DevOps/QA` e `Invitado` son nuevos respecto a la semilla original (`Administrador`, `Vigilancia`, `Estudiante`, `Tech Lead`, `Desarrollador`).
