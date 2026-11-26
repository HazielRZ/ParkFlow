# ParkFlow — `/client-app` (Capa 3: Aplicación Cliente y Dashboard)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `RF-01` (Consulta de disponibilidad en tiempo real) • `RF-04` (Alerta de saturación ≥ 90%)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Aplicación web móvil / PWA (React) aislada de la lógica interna del backend y del motor de visión computacional. Consume el canal de difusión **WebSocket** (`/ws/parking-states`) expuesto por `/api-backend` para renderizar los tres estados del contrato `INT-SW-01`:
- **`Libre`** (Verde)
- **`En maniobra`** (Ámbar)
- **`Ocupado`** (Rojo)

### Flujo de Solicitud, Asignación Temporal (15 min) y Guiado
1. **Solicitud con 1 toque (`Request`)**: El botón principal **"Solicitar espacio (15 min)"** asigna automáticamente el mejor cajón libre disponible según el rol del usuario (`Estudiante` excluye lotes `staff_only`; `Personal` incluye `C1 • Edif. L`), priorizando la mejor zona y el cajón más cercano al acceso.
2. **Reserva temporal con caducidad de 15 minutos**: La asignación (`parkingAssignmentService.js`) se persiste localmente en `localStorage` y cuenta con adaptador listo para API REST futura (`VITE_ASSIGNMENT_API_URL`) con degradación transparente a modo local. Un reloj real muestra la cuenta regresiva `MM:SS` con alertas visuales (< 3 min ámbar, < 1 min rojo) y liberación automática al vencer.
3. **Guiado paso a paso y ruta animada**: `SpotGuidanceView` muestra indicaciones internas desde la caseta hasta la zona y el cajón (Bloque A/B y fila), trayectoria animada sobre el croquis SVG (`ParkingGrid`), lectura por voz nativa (`es-MX`) y enlaces opcionales a Google Maps / Waze hacia el acceso del campus.
4. **Sincronización en vivo y reasignación**: Si la cámara reporta el cajón asignado como `Ocupado` o `En maniobra`, la vista alerta al conductor y permite confirmar llegada (**"Ya me estacioné"**) o reasignar otro cajón en 1 toque.

### Arquitectura UX/UI Driver-First (Exploración en 3 Niveles)
1. **Nivel 1 — Selector Macro**: Tabs superiores para los estacionamientos reales del ITM (`C1 • Norte`, `C1 • Sur`, `C1 • Edif. L` exclusivo para personal y `C2 • Central`) junto con una franja horizontal compacta de KPIs (`Libres`, `En maniobra`, `% Ocupación`) y lectura por voz (`window.speechSynthesis` en `es-MX`).
2. **Nivel 2 — Mapa Esquemático Meso**: Bloques grandes tocables por zona/pasillo respetando la geometría real de cada estacionamiento, semáforo de disponibilidad y recomendación automática de la mejor zona o redirección desde zonas de personal.
3. **Nivel 3 — Croquis Detallado Micro (Drill-down)**: Vista cenital SVG de los 12–16 cajones de la zona seleccionada, filtros por estado y soporte opcional de **Modo Técnico / Admin** para consultar `IoU` y `Confianza YOLO` (ocultos por defecto para conductores).

### Alertas Automáticas de Saturación (`RF-04` • `CU-03`)
- `SaturationBanner` y `saturationLogic.js` monitorean en tiempo real (vía WebSocket o modo demo) la ocupación de la zona activa, del estacionamiento seleccionado y del campus agregado:
  - **`< 90%`**: El banner permanece oculto.
  - **`>= 90%` y `< 100%`**: Muestra banner de advertencia ámbar **`"ESTACIONAMIENTO CASI LLENO"`** con porcentaje y cajones restantes.
  - **`100%`**: Escala a banner crítico rojo **`"ESTACIONAMIENTO LLENO"`**.
- **Recomendación dinámica**: Excluye la zona/lote actual y opciones al `100%`, omite lotes `staff_only` (`C1 • Edif. L`) para estudiantes, prioriza zonas/lotes del mismo campus con menor ocupación y salta a otro campus si todo el campus actual está saturado (o muestra mensaje de contingencia en el caso borde de `100%` global).
- **Lectura por voz en transición**: Dispara `es-MX` únicamente al escalar de umbral (`<90% → >=90%`, `<90% → 100%`, `>=90% → 100%`) para evitar avisos repetidos en cada trama del WebSocket.

#### Cómo simular los umbrales localmente
1. **Desde la interfaz (Bottom Sheet de Modo Demo)**: Toca el pill **`Demo`** en la esquina superior derecha del encabezado (cuando no hay WebSocket conectado) y selecciona **`≥90%`** (simula saturación con 1 cajón libre en el lote actual), **`100%`** (lote actual al 100%), **`Campus 100%`** (caso borde de saturación global al 100%) o **`Normal`** para restaurar el estado base.
2. **Por WebSocket (`parking_state_updated`)**: Envía una trama JSON con `polygons` donde el porcentaje de cajones en estado `"Ocupado"` sea `>= 90%` o `100%` para comprobar la activación inmediata en vivo.

## Estructura Interna

```text
client-app/
├── src/
│   ├── components/
│   │   ├── DemoBottomSheet.jsx         # Panel deslizable de rol, simulación RF-04 y modo técnico
│   │   ├── Icons.jsx                   # Iconografía vectorial SVG unificada
│   │   ├── SaturationBanner.jsx        # Banner reactivo >= 90% y 100% (RF-04 / CU-03)
│   │   ├── ZoneSchematicMap.jsx        # Nivel 2: Mapa esquemático por zonas reales ITM
│   │   ├── ParkingGrid.jsx             # Nivel 3: Croquis SVG + trayectoria animada
│   │   └── SpotGuidanceView.jsx        # Vista de guiado paso a paso, timer 15m y acciones
│   ├── data/
│   │   └── campusLots.js               # Modelo jerárquico lot -> zones[] -> spots[] + rutas
│   ├── hooks/
│   │   ├── useParkingSocket.js         # Suscripción WebSocket en tiempo real
│   │   └── useParkingAssignment.js     # Ciclo de vida de asignación, timer y simulación demo
│   ├── services/
│   │   └── parkingAssignmentService.js # Persistencia local y adaptador listo para API REST
│   ├── utils/
│   │   ├── assignmentLogic.js          # Lógica pura de selección, caducidad y rutas
│   │   ├── saturationLogic.js          # Cálculo de umbral >= 90%/100% y zona alterna
│   │   └── speechAvailability.js       # Lectura por voz nativa (es-MX)
│   ├── views/
│   │   └── DashboardView.jsx           # Orquestación de solicitud, guiado y exploración
│   └── index.js                        # Punto de entrada de la capa cliente
├── style-agents.md                     # Guía estricta del Design System ParkFlow (TecNM)
├── tests/
│   ├── campusLots.test.mjs             # Pruebas unitarias de modelo, adaptador y voz
│   ├── assignmentFlow.test.mjs         # Pruebas unitarias de asignación, timer, ruta y servicio
│   └── saturationAlert.test.mjs        # Pruebas unitarias de umbrales RF-04 y zona alterna
├── Dockerfile
├── .dockerignore
└── package.json
```
