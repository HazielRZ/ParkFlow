# ParkFlow — `/client-app` (Capa 3: Aplicación Cliente y Dashboard)

> **Trazabilidad ERS**: `RNF-05` (Arquitectura Modular en 3 Capas) • `RF-01` (Consulta de disponibilidad en tiempo real)  
> **Licencia**: [PolyForm Noncommercial License 1.0.0](../LICENSE)

## Descripción

Aplicación web cliente (React / PWA) aislada de la lógica interna del backend y del motor de visión computacional. Consume únicamente el canal de difusión **WebSocket** (`/ws/parking-states`) expuesto por `/api-backend` para renderizar los tres estados del contrato `INT-SW-01`:
- **`Libre`** (Verde)
- **`En maniobra`** (Ámbar)
- **`Ocupado`** (Rojo)

## Estructura Interna

```text
client-app/
├── src/
│   ├── components/       # Layout de estacionamiento y visor de cajones (ParkingGrid)
│   ├── hooks/            # Suscripción a WebSockets en tiempo real (useParkingSocket)
│   ├── views/            # Vistas de operador y visualización de disponibilidad (DashboardView)
│   └── index.js          # Punto de entrada de la capa cliente
├── Dockerfile
├── .dockerignore
└── package.json
```
