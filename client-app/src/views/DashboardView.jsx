/**
 * Vista principal móvil/PWA de disponibilidad en tiempo real con Zoom Semántico en 3 Niveles (Driver-First).
 * Nivel 1 (Macro): Selector de Estacionamientos ITM + franja KPI compacta.
 * Nivel 2 (Meso): Mapa esquemático por zonas reales tocables con semáforo y mejor opción.
 * Nivel 3 (Micro): Croquis detallado de 12–16 cajones de la zona seleccionada.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CAMPUS_LOTS,
  adaptFlatPolygonsToLot,
  applyHighOccupancySimulation,
  getBestZoneForLot,
  getLotMetrics,
  getNearestGeneralLot,
} from "../data/campusLots.js";
import { ParkingGrid } from "../components/ParkingGrid.jsx";
import { ZoneSchematicMap } from "../components/ZoneSchematicMap.jsx";
import { useParkingSocket } from "../hooks/useParkingSocket.js";
import {
  buildAvailabilityAnnouncement,
  isSpeechSupported,
  speakAvailability,
  stopAvailabilitySpeech,
} from "../utils/speechAvailability.js";

const STATE_FILTERS = [
  { id: "Todos", label: "Todos" },
  { id: "Libre", label: "✓ Libres" },
  { id: "En maniobra", label: "◐ Maniobra" },
  { id: "Ocupado", label: "✕ Ocupados" },
];

export function DashboardView({ wsUrl }) {
  const {
    parkingLotId,
    polygons: livePolygons,
    polygonsByLot,
    connected,
    reconnecting,
    attempt,
  } = useParkingSocket(wsUrl);

  const [selectedLotId, setSelectedLotId] = useState(CAMPUS_LOTS[0].id);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [stateFilter, setStateFilter] = useState("Todos");
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [userRole, setUserRole] = useState("student");
  const [technicalMode, setTechnicalMode] = useState(false);
  const [demoEnabled] = useState(true);
  const [simulateHighOccupancy, setSimulateHighOccupancy] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  useEffect(() => () => stopAvailabilitySpeech(), []);

  const resolvedLots = useMemo(
    () =>
      CAMPUS_LOTS.map((lotTemplate) => {
        const fromByLot =
          polygonsByLot && Array.isArray(polygonsByLot[lotTemplate.id])
            ? polygonsByLot[lotTemplate.id]
            : [];
        const liveLotPolygons =
          fromByLot.length > 0
            ? fromByLot
            : parkingLotId === lotTemplate.id && Array.isArray(livePolygons)
              ? livePolygons
              : [];

        if (liveLotPolygons.length > 0) {
          return adaptFlatPolygonsToLot(lotTemplate, liveLotPolygons);
        }

        if (!connected && demoEnabled) {
          if (simulateHighOccupancy && lotTemplate.id === selectedLotId) {
            return applyHighOccupancySimulation(lotTemplate);
          }
          return lotTemplate;
        }

        return adaptFlatPolygonsToLot(lotTemplate, []);
      }),
    [
      polygonsByLot,
      parkingLotId,
      livePolygons,
      connected,
      demoEnabled,
      simulateHighOccupancy,
      selectedLotId,
    ]
  );

  const activeLot = useMemo(
    () =>
      resolvedLots.find((lot) => lot.id === selectedLotId) || resolvedLots[0],
    [resolvedLots, selectedLotId]
  );

  const activeLotMetrics = useMemo(
    () => getLotMetrics(activeLot),
    [activeLot]
  );

  const bestZone = useMemo(() => getBestZoneForLot(activeLot), [activeLot]);

  const suggestedGeneralLot = useMemo(
    () => getNearestGeneralLot(resolvedLots, activeLot?.id),
    [resolvedLots, activeLot]
  );

  const suggestedGeneralMetrics = useMemo(
    () => (suggestedGeneralLot ? getLotMetrics(suggestedGeneralLot) : null),
    [suggestedGeneralLot]
  );

  const secondaryGeneralLot = useMemo(() => {
    if (!activeLot || activeLot.access_type !== "staff_only") {
      return null;
    }
    return (
      resolvedLots.find(
        (lot) =>
          lot.access_type === "general" &&
          lot.campus === activeLot.campus &&
          lot.id !== suggestedGeneralLot?.id
      ) || null
    );
  }, [resolvedLots, activeLot, suggestedGeneralLot]);

  const activeZone = useMemo(() => {
    if (!selectedZoneId || !activeLot) {
      return null;
    }
    return (
      activeLot.zones.find((zone) => zone.id === selectedZoneId) ||
      activeLot.zones[0] ||
      null
    );
  }, [activeLot, selectedZoneId]);

  const occupancyPercentage = Math.round(
    (activeLotMetrics.occupancy_ratio || 0) * 100
  );

  const isUsingDemoData =
    !connected &&
    demoEnabled &&
    !(polygonsByLot?.[activeLot.id]?.length > 0) &&
    !(parkingLotId === activeLot.id && livePolygons.length > 0);

  const connectionStatus = connected
    ? "online"
    : isUsingDemoData
      ? "demo"
      : "reconnecting";

  const connectionLabel = connected
    ? "En vivo"
    : isUsingDemoData
      ? "Demo"
      : reconnecting
        ? `Reintento #${attempt}`
        : "Sin red";

  const isStaffRestricted =
    activeLot.access_type === "staff_only" && userRole === "student";

  const handleSelectLot = (lotId) => {
    setSelectedLotId(lotId);
    setSelectedZoneId(null);
    setSelectedSlot(null);
    setStateFilter("Todos");
    setSimulateHighOccupancy(false);
    setSpeechNotice("");
    stopAvailabilitySpeech();
    setIsSpeaking(false);
  };

  const handleOpenZone = (zone) => {
    if (!zone) {
      return;
    }
    setSelectedZoneId(zone.id);
    setSelectedSlot(null);
    setStateFilter("Todos");
  };

  const handleBackToZones = () => {
    setSelectedZoneId(null);
    setSelectedSlot(null);
    setStateFilter("Todos");
  };

  const handleVoiceReadout = () => {
    if (isSpeaking) {
      stopAvailabilitySpeech();
      setIsSpeaking(false);
      setSpeechNotice("");
      return;
    }

    const message = buildAvailabilityAnnouncement({
      lot: activeLot,
      lotMetrics: activeLotMetrics,
      bestZone,
      userRole,
      suggestedGeneralLot,
    });

    if (!isSpeechSupported()) {
      setSpeechNotice(message);
      return;
    }

    setSpeechNotice(message);
    speakAvailability(message, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        setSpeechNotice("");
      },
      onError: () => {
        setIsSpeaking(false);
      },
    });
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <main className="pf-app">
      {/* Header compacto en Azul Pantone 294 C (#1B396A) */}
      <header className="pf-hero-header">
        <div className="pf-header-top">
          <div className="pf-brand">
            <span className="pf-brand-badge" aria-hidden="true">
              P
            </span>
            <div className="pf-brand-text">
              <h1 className="pf-title">ParkFlow</h1>
              <p className="pf-subtitle">TecNM Campus Morelia</p>
            </div>
          </div>

          <div className="pf-header-actions">
            <div
              className="pf-conn-badge"
              data-status={connectionStatus}
              aria-live="polite"
              title="Estado de conexión en tiempo real"
            >
              <span className="pf-conn-dot" aria-hidden="true" />
              <span>{connectionLabel}</span>
            </div>

            <button
              type="button"
              className="pf-theme-toggle"
              onClick={toggleTheme}
              aria-label="Alternar tema claro u oscuro"
              title={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
          </div>
        </div>
      </header>

      <div className="pf-content">
        {/* Nivel 1 (Macro): Tarjeta superpuesta con selector de lotes y KPIs en 1 franja */}
        <section
          className="pf-summary-float-card"
          aria-label="Selector de estacionamiento y resumen rápido"
        >
          <div className="pf-headline-row">
            <h2 className="pf-section-headline">
              Encuentra tu <em className="pf-italic-accent">lugar</em>
            </h2>

            <button
              type="button"
              className="pf-voice-btn"
              data-speaking={String(isSpeaking)}
              onClick={handleVoiceReadout}
              aria-pressed={isSpeaking}
            >
              <span aria-hidden="true">{isSpeaking ? "⏹" : "🔊"}</span>
              <span>
                {isSpeaking ? "Detener voz" : "Escuchar disponibilidad"}
              </span>
            </button>
          </div>

          {speechNotice && (
            <p className="pf-speech-caption" role="status" aria-live="polite">
              {speechNotice}
            </p>
          )}

          {/* Tabs tipo pill para los 4 estacionamientos */}
          <div
            className="pf-lot-grid"
            role="tablist"
            aria-label="Estacionamientos del campus"
          >
            {resolvedLots.map((lot) => {
              const isSelected = activeLot.id === lot.id;
              const isStaffOnly = lot.access_type === "staff_only";
              return (
                <button
                  key={lot.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className="pf-lot-tab"
                  data-staff={String(isStaffOnly)}
                  onClick={() => handleSelectLot(lot.id)}
                >
                  <span className="pf-lot-tab-name">{lot.shortName}</span>
                  {isStaffOnly && (
                    <span className="pf-staff-badge" title="Exclusivo personal ITM">
                      🔒 Personal
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Franja horizontal compacta de 3 KPIs */}
          <div
            className="pf-kpi-strip"
            aria-label="Indicadores de disponibilidad del estacionamiento"
          >
            <div className="pf-kpi-cell" data-variant="free">
              <span
                className="pf-kpi-value"
                style={{ color: "var(--status-success)" }}
              >
                {activeLotMetrics.free}
              </span>
              <span className="pf-kpi-label">Libres</span>
            </div>

            <div className="pf-kpi-cell" data-variant="maneuver">
              <span
                className="pf-kpi-value"
                style={{ color: "var(--status-warning)" }}
              >
                {activeLotMetrics.in_maneuver}
              </span>
              <span className="pf-kpi-label">En maniobra</span>
            </div>

            <div className="pf-kpi-cell" data-variant="ratio">
              <span
                className="pf-kpi-value"
                style={{ color: "var(--accent-text)" }}
              >
                {occupancyPercentage}%
              </span>
              <span className="pf-kpi-label">
                Ocupación ({activeLotMetrics.total_slots})
              </span>
            </div>
          </div>
        </section>

        {/* Alerta de saturación >= 90% (RF-04) */}
        {activeLotMetrics.high_occupancy_alert && (
          <div className="pf-alert-saturation" role="alert">
            <span>
              ⚠️ Saturación {occupancyPercentage}% en {activeLot.shortName}{" "}
              (RF-04).
            </span>
            {suggestedGeneralLot && suggestedGeneralMetrics?.free > 0 && (
              <button
                type="button"
                className="pf-banner-cta pf-banner-cta-danger"
                onClick={() => handleSelectLot(suggestedGeneralLot.id)}
              >
                Ir a {suggestedGeneralLot.shortName} (
                {suggestedGeneralMetrics.free}) →
              </button>
            )}
          </div>
        )}

        {/* Banner contextual Nivel 2: Restricción Personal ITM o Mejor opción ahora */}
        {selectedZoneId === null &&
          (isStaffRestricted ? (
            <section
              className="pf-restricted-banner"
              role="region"
              aria-label="Aviso de acceso exclusivo para personal"
            >
              <div className="pf-banner-body">
                <strong className="pf-banner-title">
                  🔒 Acceso exclusivo para personal ITM
                </strong>
                <span className="pf-banner-desc">
                  C1 • Edif. L (Av. Tecnológico) requiere pase de trabajador.
                </span>
              </div>
              <div className="pf-restricted-actions">
                {suggestedGeneralLot && (
                  <button
                    type="button"
                    className="pf-banner-cta"
                    onClick={() => handleSelectLot(suggestedGeneralLot.id)}
                  >
                    Ir a {suggestedGeneralLot.shortName} (
                    {suggestedGeneralMetrics?.free ?? 0} libres) →
                  </button>
                )}
                {secondaryGeneralLot && (
                  <button
                    type="button"
                    className="pf-banner-cta pf-banner-cta-ghost"
                    onClick={() => handleSelectLot(secondaryGeneralLot.id)}
                  >
                    {secondaryGeneralLot.shortName} (
                    {getLotMetrics(secondaryGeneralLot).free})
                  </button>
                )}
              </div>
            </section>
          ) : (
            bestZone && (
              <section
                className="pf-best-banner"
                role="region"
                aria-label="Mejor opción ahora"
              >
                <div className="pf-banner-body">
                  <span className="pf-banner-eyebrow">Mejor opción ahora</span>
                  <strong className="pf-banner-title">
                    {bestZone.name} • {bestZone.free_count}{" "}
                    {bestZone.free_count === 1 ? "libre" : "libres"}
                  </strong>
                  <span className="pf-banner-desc">{bestZone.landmark}</span>
                </div>
                <button
                  type="button"
                  className="pf-banner-cta"
                  onClick={() => handleOpenZone(bestZone)}
                >
                  Ver zona →
                </button>
              </section>
            )
          ))}

        {/* Barra compacta de 1 línea para Modo Demo */}
        {!connected && (
          <div className="pf-demo-bar" aria-label="Controles de modo demostración">
            <span className="pf-demo-label">
              <strong>Modo demo</strong> •{" "}
              {userRole === "student" ? "Rol: Estudiante" : "Rol: Personal"}
              {technicalMode ? " • Técnico" : ""}
            </span>
            <button
              type="button"
              className="pf-demo-btn"
              aria-pressed={simulateHighOccupancy}
              onClick={() => setSimulateHighOccupancy((prev) => !prev)}
            >
              {simulateHighOccupancy
                ? "Restaurar demo"
                : "Simular alerta ≥90% (RF-04)"}
            </button>
          </div>
        )}

        {/* Nivel 2 (Meso) vs Nivel 3 (Micro) */}
        {selectedZoneId === null ? (
          <ZoneSchematicMap
            lot={activeLot}
            bestZoneId={bestZone?.id || null}
            userRole={userRole}
            technicalMode={technicalMode}
            onSelectZone={handleOpenZone}
          />
        ) : (
          activeZone && (
            <div className="pf-micro-view">
              {/* Regreso rápido + contexto de zona */}
              <div className="pf-micro-topbar">
                <button
                  type="button"
                  className="pf-back-btn"
                  onClick={handleBackToZones}
                >
                  ← Ver zonas
                </button>
                <div className="pf-micro-summary">
                  <span className="pf-micro-lot-tag">{activeLot.shortName}</span>
                  <strong className="pf-micro-count">
                    {activeZone.free_count} libres
                    {activeZone.maneuver_count > 0
                      ? ` • ${activeZone.maneuver_count} maniobra`
                      : ""}
                  </strong>
                </div>
              </div>

              {/* Tabs horizontales compactos para saltar entre zonas del lote */}
              <div
                className="pf-micro-zone-tabs"
                role="tablist"
                aria-label={`Zonas de ${activeLot.shortName}`}
              >
                {activeLot.zones.map((zone) => {
                  const isCurrent = zone.id === activeZone.id;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      className="pf-micro-zone-tab"
                      onClick={() => handleOpenZone(zone)}
                    >
                      <span>{zone.shortLabel || zone.name}</span>
                      <span className="pf-micro-tab-count">
                        {zone.free_count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Filtros de estado dentro del Nivel 3 */}
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
                    onClick={() => setStateFilter(filter.id)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <ParkingGrid
                polygons={activeZone.spots}
                stateFilter={stateFilter}
                selectedPolygonId={
                  selectedSlot ? selectedSlot.polygon_id : null
                }
                onSelectSlot={setSelectedSlot}
                zoneName={`${activeZone.name} — ${activeZone.landmark}`}
                laneLabel={activeZone.laneLabel || "ENTRADA ITM"}
                cameraId={activeZone.camera_id}
                technicalMode={technicalMode}
              />
            </div>
          )
        )}
      </div>

      {/* Navbar flotante inferior tipo píldora */}
      <div className="pf-floating-nav-wrapper">
        <nav className="pf-floating-nav" aria-label="Navegación rápida ParkFlow">
          <button
            type="button"
            className="pf-nav-item"
            data-active={selectedZoneId === null}
            onClick={handleBackToZones}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              ◫
            </span>
            <span>Zonas</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={selectedZoneId !== null}
            onClick={() => {
              if (selectedZoneId === null && bestZone) {
                handleOpenZone(bestZone);
              }
            }}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              🅿
            </span>
            <span>Croquis</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={userRole === "staff"}
            aria-pressed={userRole === "staff"}
            onClick={() =>
              setUserRole((prev) => (prev === "student" ? "staff" : "student"))
            }
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              {userRole === "staff" ? "🪪" : "🎓"}
            </span>
            <span>{userRole === "staff" ? "Personal" : "Estudiante"}</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={technicalMode}
            aria-pressed={technicalMode}
            onClick={() => setTechnicalMode((prev) => !prev)}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              ⚙
            </span>
            <span>Técnico</span>
          </button>
        </nav>
      </div>
    </main>
  );
}
