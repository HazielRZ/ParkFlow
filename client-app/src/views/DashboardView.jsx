/**
 * Vista principal móvil/PWA de disponibilidad en tiempo real (PF-19 / RF-01 / RF-04 / RNF-03 / RNF-06).
 * Diseñada para consulta en <= 3 pasos desde dispositivos móviles.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useMemo, useState } from "react";
import { CAMPUS_ZONES, ParkingGrid } from "../components/ParkingGrid.jsx";
import {
  computeMetricsFromPolygons,
  useParkingSocket,
} from "../hooks/useParkingSocket.js";

const STATE_FILTERS = [
  { id: "Todos", label: "Todos" },
  { id: "Libre", label: "✓ Libres" },
  { id: "En maniobra", label: "◐ En maniobra" },
  { id: "Ocupado", label: "✕ Ocupados" },
];

export function DashboardView({ wsUrl }) {
  const {
    parkingLotId,
    polygons: livePolygons,
    polygonsByLot,
    metrics: liveMetrics,
    connected,
    reconnecting,
    attempt,
    lastUpdated,
  } = useParkingSocket(wsUrl);

  const [selectedZoneId, setSelectedZoneId] = useState(CAMPUS_ZONES[0].id);
  const [stateFilter, setStateFilter] = useState("Todos");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [demoEnabled, setDemoEnabled] = useState(true);
  const [simulateHighOccupancy, setSimulateHighOccupancy] = useState(false);

  const activeZone = useMemo(
    () =>
      CAMPUS_ZONES.find((zone) => zone.id === selectedZoneId) ||
      CAMPUS_ZONES[0],
    [selectedZoneId]
  );

  const liveZonePolygons = useMemo(() => {
    if (polygonsByLot && Array.isArray(polygonsByLot[selectedZoneId])) {
      return polygonsByLot[selectedZoneId];
    }
    if (parkingLotId === selectedZoneId && Array.isArray(livePolygons)) {
      return livePolygons;
    }
    return [];
  }, [polygonsByLot, parkingLotId, livePolygons, selectedZoneId]);

  const isUsingDemoData = !connected && demoEnabled && liveZonePolygons.length === 0;

  const displayedPolygons = useMemo(() => {
    if (!isUsingDemoData) {
      return liveZonePolygons;
    }
    if (!simulateHighOccupancy) {
      return activeZone.defaultSlots;
    }
    return activeZone.defaultSlots.map((slot, idx) =>
      idx === 0
        ? { ...slot, state: "Libre", vehicle_type: null, iou_ratio: 0.03 }
        : {
            ...slot,
            state: "Ocupado",
            vehicle_type: slot.vehicle_type || "car",
            iou_ratio: 0.85,
            confidence: 0.95,
          }
    );
  }, [isUsingDemoData, simulateHighOccupancy, activeZone, liveZonePolygons]);

  const displayedMetrics = useMemo(() => {
    if (!isUsingDemoData && parkingLotId === selectedZoneId && liveZonePolygons.length > 0) {
      return liveMetrics;
    }
    return computeMetricsFromPolygons(displayedPolygons);
  }, [
    isUsingDemoData,
    parkingLotId,
    selectedZoneId,
    liveZonePolygons,
    liveMetrics,
    displayedPolygons,
  ]);

  const occupancyPercentage = Math.round(
    (displayedMetrics.occupancy_ratio || 0) * 100
  );

  const connectionStatus = connected
    ? "online"
    : isUsingDemoData
      ? "demo"
      : "reconnecting";

  const connectionLabel = connected
    ? "En línea (WebSocket)"
    : reconnecting
      ? `Reconectando (intento #${attempt})...`
      : "Sin conexión";

  return (
    <main className="pf-app">
      {/* Encabezado móvil compacto */}
      <header className="pf-header">
        <div className="pf-header-top">
          <div className="pf-brand">
            <span className="pf-brand-badge" aria-hidden="true">
              P
            </span>
            <div>
              <h1 className="pf-title">
                ParkFlow — Monitoreo en Tiempo Real ({activeZone.id})
              </h1>
              <p className="pf-subtitle">
                TecNM Campus Morelia • Consulta rápida en &le; 3 pasos
              </p>
            </div>
          </div>

          <div
            className="pf-conn-badge"
            data-status={connectionStatus}
            aria-live="polite"
          >
            <span className="pf-conn-dot" aria-hidden="true" />
            <span>Estado de conexión: {connectionLabel}</span>
          </div>
        </div>

        {lastUpdated && (
          <small style={{ color: "#94a3b8", fontSize: "0.74rem" }}>
            Última actualización recibida: {lastUpdated}
          </small>
        )}
      </header>

      {/* Alerta automática de saturación >= 90% (RF-04) */}
      {displayedMetrics.high_occupancy_alert && (
        <div className="pf-alert-saturation" role="alert">
          <span>
            ⚠️ Alerta RF-04: Ocupación superior al 90% de capacidad en{" "}
            {activeZone.id} ({occupancyPercentage}% ocupado). Se recomienda
            dirigirse a una zona alterna.
          </span>
        </div>
      )}

      {/* Aviso explícito de Modo Demostración cuando no hay backend conectado */}
      {!connected && (
        <section className="pf-demo-banner" aria-label="Modo demostración">
          <div>
            <strong>Modo demostración</strong> — Backend WebSocket no detectado.
            {demoEnabled
              ? " Mostrando croquis interactivo de referencia para validación UI."
              : " Datos de demostración desactivados."}
          </div>
          <div className="pf-demo-actions">
            <button
              type="button"
              className="pf-btn pf-btn-secondary"
              onClick={() => setDemoEnabled((prev) => !prev)}
            >
              {demoEnabled ? "Ocultar demo" : "Activar modo demo"}
            </button>
            {demoEnabled && (
              <button
                type="button"
                className="pf-btn pf-btn-secondary"
                onClick={() => setSimulateHighOccupancy((prev) => !prev)}
              >
                {simulateHighOccupancy
                  ? "Restaurar ocupación normal"
                  : "Simular alerta ≥90% (RF-04)"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Paso 1: Selector de Zona / Estacionamiento (áreas táctiles >= 44x44px) */}
      <section className="pf-controls" aria-label="Selección de estacionamiento y filtros">
        <div className="pf-zone-bar" role="tablist" aria-label="Zonas del campus">
          {CAMPUS_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className="pf-zone-tab"
              aria-pressed={selectedZoneId === zone.id}
              onClick={() => {
                setSelectedZoneId(zone.id);
                setSelectedSlot(null);
              }}
            >
              {zone.shortName}
            </button>
          ))}
        </div>

        {/* Resumen de métricas en vivo */}
        <div className="pf-metrics-grid" aria-label="Resumen de disponibilidad">
          <div className="pf-metric-card" data-variant="free">
            <span className="pf-metric-value" style={{ color: "#4ade80" }}>
              {displayedMetrics.free}
            </span>
            <span className="pf-metric-label">Libres</span>
          </div>
          <div className="pf-metric-card" data-variant="maneuver">
            <span className="pf-metric-value" style={{ color: "#fbbf24" }}>
              {displayedMetrics.in_maneuver}
            </span>
            <span className="pf-metric-label">En maniobra</span>
          </div>
          <div className="pf-metric-card" data-variant="occupied">
            <span className="pf-metric-value" style={{ color: "#f87171" }}>
              {displayedMetrics.occupied}
            </span>
            <span className="pf-metric-label">Ocupados</span>
          </div>
          <div className="pf-metric-card" data-variant="ratio">
            <span className="pf-metric-value" style={{ color: "#38bdf8" }}>
              {occupancyPercentage}%
            </span>
            <span className="pf-metric-label">
              Ocupación ({displayedMetrics.total_slots} cajones)
            </span>
          </div>
        </div>

        {/* Paso 2: Filtros rápidos por estado */}
        <div className="pf-filter-bar" role="group" aria-label="Filtrar cajones por estado">
          {STATE_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="pf-filter-chip"
              aria-pressed={stateFilter === filter.id}
              onClick={() => setStateFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {/* Paso 3: Mapa SVG interactivo + selección de cajón */}
      <ParkingGrid
        polygons={displayedPolygons}
        stateFilter={stateFilter}
        selectedPolygonId={selectedSlot ? selectedSlot.polygon_id : undefined}
        onSelectSlot={setSelectedSlot}
        zoneName={activeZone.name}
      />
    </main>
  );
}
