/**
 * Vista principal móvil/PWA de disponibilidad en tiempo real (PF-19 / RF-01 / RF-04 / RNF-03 / RNF-06).
 * Adaptada al Manual de Identidad Gráfica del TecNM (Azul Pantone 294 C #1B396A).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useEffect, useMemo, useState } from "react";
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
  const [theme, setTheme] = useState("light");
  const [activeNav, setActiveNav] = useState("mapa");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

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

  const isUsingDemoData =
    !connected && demoEnabled && liveZonePolygons.length === 0;

  const displayedPolygons = useMemo(() => {
    if (!isUsingDemoData) {
      return liveZonePolygons;
    }
    if (!simulateHighOccupancy) {
      return activeZone.defaultSlots;
    }
    const total = activeZone.defaultSlots.length;
    const keepOneFree = total > 0 && (total - 1) / total >= 0.9;
    return activeZone.defaultSlots.map((slot, idx) =>
      keepOneFree && idx === 0
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
    if (
      !isUsingDemoData &&
      parkingLotId === selectedZoneId &&
      liveZonePolygons.length > 0
    ) {
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
    : isUsingDemoData
      ? reconnecting
        ? `Modo demo • Reconectando (#${attempt})`
        : "Modo demostración"
      : reconnecting
        ? `Reconectando (intento #${attempt})...`
        : "Sin conexión";

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <main className="pf-app">
      {/* Regla 1: Header curvo en Azul Pantone 294 C (#1B396A) */}
      <header className="pf-hero-header">
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
                TecNM Campus Morelia • Consulta en &le; 3 pasos
              </p>
            </div>
          </div>

          <button
            type="button"
            className="pf-theme-toggle"
            onClick={toggleTheme}
            aria-label="Alternar tema claro u oscuro"
          >
            {theme === "light" ? "☾ Oscuro" : "☀ Claro"}
          </button>
        </div>

        <div className="pf-header-status-row">
          <div
            className="pf-conn-badge"
            data-status={connectionStatus}
            aria-live="polite"
          >
            <span className="pf-conn-dot" aria-hidden="true" />
            <span>Estado de conexión: {connectionLabel}</span>
          </div>

          {lastUpdated && (
            <small style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.72rem" }}>
              Actualizado: {lastUpdated}
            </small>
          )}
        </div>
      </header>

      <div className="pf-content">
        {/* Regla 1 y 2: Tarjeta principal superpuesta (-40px) y titular con cursiva */}
        <section
          className="pf-summary-float-card"
          aria-label="Resumen y selección de estacionamiento"
        >
          <h2 className="pf-section-headline">
            Encuentra tu <em className="pf-italic-accent">lugar</em> ideal
          </h2>

          {/* Paso 1: Selector de Zona / Estacionamiento (píldoras 9999px) */}
          <div
            className="pf-zone-bar"
            role="tablist"
            aria-label="Zonas del campus"
          >
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

          {/* Resumen de métricas en vivo (celdas con radio 12px) */}
          <div className="pf-metrics-grid" aria-label="Resumen de disponibilidad">
            <div className="pf-metric-card" data-variant="free">
              <span
                className="pf-metric-value"
                style={{ color: "var(--status-success)" }}
              >
                {displayedMetrics.free}
              </span>
              <span className="pf-metric-label">Libres</span>
            </div>
            <div className="pf-metric-card" data-variant="maneuver">
              <span
                className="pf-metric-value"
                style={{ color: "var(--status-warning)" }}
              >
                {displayedMetrics.in_maneuver}
              </span>
              <span className="pf-metric-label">En maniobra</span>
            </div>
            <div className="pf-metric-card" data-variant="occupied">
              <span
                className="pf-metric-value"
                style={{ color: "var(--status-danger)" }}
              >
                {displayedMetrics.occupied}
              </span>
              <span className="pf-metric-label">Ocupados</span>
            </div>
            <div className="pf-metric-card" data-variant="ratio">
              <span
                className="pf-metric-value"
                style={{ color: "var(--accent-text)" }}
              >
                {occupancyPercentage}%
              </span>
              <span className="pf-metric-label">
                Ocupación ({displayedMetrics.total_slots} cajones)
              </span>
            </div>
          </div>

          {/* Paso 2: Filtros rápidos por estado (píldoras 9999px) */}
          <div
            className="pf-filter-bar"
            role="group"
            aria-label="Filtrar cajones por estado"
          >
            {STATE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className="pf-filter-chip"
                aria-pressed={stateFilter === filter.id}
                onClick={() => {
                  setStateFilter(filter.id);
                  setActiveNav(filter.id === "Libre" ? "libres" : "mapa");
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </section>

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

        {/* Paso 3: Mapa SVG interactivo con carril central + selección de cajón */}
        <ParkingGrid
          polygons={displayedPolygons}
          stateFilter={stateFilter}
          selectedPolygonId={selectedSlot ? selectedSlot.polygon_id : undefined}
          onSelectSlot={setSelectedSlot}
          zoneName={activeZone.name}
        />
      </div>

      {/* Regla 4: Navbar flotante inferior tipo píldora */}
      <div className="pf-floating-nav-wrapper">
        <nav className="pf-floating-nav" aria-label="Navegación rápida ParkFlow">
          <button
            type="button"
            className="pf-nav-item"
            data-active={activeNav === "mapa"}
            onClick={() => {
              setActiveNav("mapa");
              setStateFilter("Todos");
            }}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              🅿
            </span>
            <span>Mapa</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={activeNav === "libres"}
            onClick={() => {
              setActiveNav("libres");
              setStateFilter((prev) => (prev === "Libre" ? "Todos" : "Libre"));
            }}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              ✓
            </span>
            <span>Libres ({displayedMetrics.free})</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={theme === "dark"}
            onClick={toggleTheme}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              {theme === "light" ? "☾" : "☀"}
            </span>
            <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
          </button>
        </nav>
      </div>
    </main>
  );
}
