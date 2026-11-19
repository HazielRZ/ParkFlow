# ParkFlow — `/client-app` (Capa 3: Aplicación Cliente y Dashboard)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `RF-01` (Consulta de disponibilidad en tiempo real) • `RF-04` (Alerta de saturación ≥ 90%)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Aplicación web móvil / PWA (React) aislada de la lógica interna del backend y del motor de visión computacional. Consume únicamente el canal de difusión **WebSocket** (`/ws/parking-states`) expuesto por `/api-backend` para renderizar los tres estados del contrato `INT-SW-01`:
- **`Libre`** (Verde)
- **`En maniobra`** (Ámbar)
- **`Ocupado`** (Rojo)

### Arquitectura UX/UI Driver-First (Zoom Semántico en 3 Niveles)
1. **Nivel 1 — Selector Macro**: Tabs superiores para los estacionamientos reales del ITM (`C1 • Norte`, `C1 • Sur`, `C1 • Edif. L` exclusivo para personal y `C2 • Central`) junto con una franja horizontal compacta de KPIs (`Libres`, `En maniobra`, `% Ocupación`) y lectura por voz (`window.speechSynthesis` en `es-MX`).
2. **Nivel 2 — Mapa Esquemático Meso (Vista por defecto)**: Bloques grandes tocables por zona/pasillo respetando la geometría real de cada estacionamiento, semáforo de disponibilidad y recomendación automática de la mejor zona o redirección desde zonas de personal.
3. **Nivel 3 — Croquis Detallado Micro (Drill-down)**: Vista cenital SVG de los 12–16 cajones de la zona seleccionada, filtros por estado y soporte opcional de **Modo Técnico / Admin** para consultar `IoU` y `Confianza YOLO` (ocultos por defecto para conductores).

## Estructura Interna

```text
client-app/
├── src/
│   ├── components/
│   │   ├── ZoneSchematicMap.jsx  # Nivel 2: Mapa esquemático por zonas reales ITM
│   │   └── ParkingGrid.jsx       # Nivel 3: Croquis detallado de cajones por zona
│   ├── data/
│   │   └── campusLots.js         # Modelo jerárquico lot -> zones[] -> spots[] + adaptador WS
│   ├── hooks/
│   │   └── useParkingSocket.js   # Suscripción WebSocket en tiempo real
│   ├── utils/
│   │   └── speechAvailability.js # Lectura por voz nativa (es-MX)
│   ├── views/
│   │   └── DashboardView.jsx     # Orquestación de los 3 niveles de zoom semántico
│   └── index.js                  # Punto de entrada de la capa cliente
├── tests/
│   └── campusLots.test.mjs       # Pruebas unitarias de modelo, adaptador y voz
├── Dockerfile
├── .dockerignore
└── package.json
```
