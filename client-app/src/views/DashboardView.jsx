/**
 * Vista principal móvil/PWA de disponibilidad en tiempo real con flujo
 * Solicitud → Asignación temporal (15 min) → Guiado paso a paso + Zoom Semántico (Driver-First).
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
import { SpotGuidanceView } from "../components/SpotGuidanceView.jsx";
import { useParkingSocket } from "../hooks/useParkingSocket.js";
import { useParkingAssignment } from "../hooks/useParkingAssignment.js";
import { getEligibleLots } from "../utils/assignmentLogic.js";
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

  const baseResolvedLots = useMemo(
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

  const {
    effectiveLots: resolvedLots,
    assignment,
    assignedLot,
    assignedZone,
    effectiveStatus,
    remainingMs,
    progressRatio,
    urgency,
    formattedTime,
    maneuvering,
    route,
    isRequesting,
    assignmentError,
    requestSpot,
    reassignSpot,
    confirmArrival,
    cancelAssignment,
    dismissAssignment,
    simulateShortTimer,
    simulateExternalOccupancy,
  } = useParkingAssignment({
    lots: baseResolvedLots,
    connected,
  });

  const [activeView, setActiveView] = useState(() =>
    assignment ? "guidance" : "explore"
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

  const targetRequestLot = useMemo(() => {
    if (!isStaffRestricted && activeLotMetrics.free > 0) {
      return activeLot;
    }
    if (suggestedGeneralLot && (suggestedGeneralMetrics?.free ?? 0) > 0) {
      return suggestedGeneralLot;
    }
    const eligible = getEligibleLots(resolvedLots, userRole);
    return eligible.find((lot) => getLotMetrics(lot).free > 0) || null;
  }, [
    isStaffRestricted,
    activeLotMetrics.free,
    activeLot,
    suggestedGeneralLot,
    suggestedGeneralMetrics,
    resolvedLots,
    userRole,
  ]);

  const targetRequestMetrics = useMemo(
    () => (targetRequestLot ? getLotMetrics(targetRequestLot) : null),
    [targetRequestLot]
  );

  const hasLiveAssignedSpot = Boolean(
    assignment &&
      (effectiveStatus === "active" ||
        effectiveStatus === "conflict" ||
        effectiveStatus === "arrived")
  );

  const stopVoiceState = () => {
    stopAvailabilitySpeech();
    setIsSpeaking(false);
    setSpeechNotice("");
  };

  const handleSelectLot = (lotId) => {
    setSelectedLotId(lotId);
    setSelectedZoneId(null);
    setSelectedSlot(null);
    setStateFilter("Todos");
    setSimulateHighOccupancy(false);
    stopVoiceState();
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
      stopVoiceState();
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

  const handleRequestSpot = async (preferredLotId = activeLot?.id) => {
    stopVoiceState();
    const result = await requestSpot({
      preferredLotId,
      userRole,
    });
    if (result?.ok && result.assignment) {
      setSelectedLotId(result.assignment.parking_lot_id);
      setSelectedZoneId(null);
      setSelectedSlot(null);
      setActiveView("guidance");
    }
  };

  const handleReassignSpot = async () => {
    stopVoiceState();
    const result = await reassignSpot({ userRole });
    if (result?.ok && result.assignment) {
      setSelectedLotId(result.assignment.parking_lot_id);
    }
  };

  const handleConfirmArrival = async () => {
    stopVoiceState();
    await confirmArrival();
  };

  const handleCancelAssignment = async () => {
    stopVoiceState();
    await cancelAssignment();
    setActiveView("explore");
  };

  const handleDismissAssignment = () => {
    stopVoiceState();
    dismissAssignment();
    setActiveView("explore");
  };

  const handleExploreFromGuidance = () => {
    stopVoiceState();
    if (assignment?.parking_lot_id) {
      setSelectedLotId(assignment.parking_lot_id);
    }
    setSelectedZoneId(null);
    setActiveView("explore");
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  const showGuidanceScreen = activeView === "guidance" && Boolean(assignment);

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
              title={
                theme === "light"
                  ? "Activar modo oscuro"
                  : "Activar modo claro"
              }
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
          </div>
        </div>
      </header>

      <div className="pf-content">
        {showGuidanceScreen ? (
          <SpotGuidanceView
            assignment={assignment}
            assignedLot={assignedLot}
            assignedZone={assignedZone}
            effectiveStatus={effectiveStatus}
            remainingMs={remainingMs}
            progressRatio={progressRatio}
            urgency={urgency}
            formattedTime={formattedTime}
            maneuvering={maneuvering}
            route={route}
            connected={connected}
            technicalMode={technicalMode}
            isRequesting={isRequesting}
            assignmentError={assignmentError}
            onConfirmArrival={handleConfirmArrival}
            onReassign={handleReassignSpot}
            onCancel={handleCancelAssignment}
            onRequestNew={() =>
              handleRequestSpot(assignment?.parking_lot_id || activeLot?.id)
            }
            onExploreMap={handleExploreFromGuidance}
            onDismiss={handleDismissAssignment}
            onSimulateShortTimer={simulateShortTimer}
            onSimulateExternalOccupancy={simulateExternalOccupancy}
          />
        ) : (
          <>
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
                <p
                  className="pf-speech-caption"
                  role="status"
                  aria-live="polite"
                >
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
                        <span
                          className="pf-staff-badge"
                          title="Exclusivo personal ITM"
                        >
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

            {/* Acceso rápido a asignación activa o botón principal de solicitud (15 min) */}
            {hasLiveAssignedSpot ? (
              <section
                className="pf-active-assignment-bar"
                data-conflict={String(effectiveStatus === "conflict")}
                data-status={effectiveStatus}
                role="region"
                aria-label="Tu espacio asignado actualmente"
              >
                <div className="pf-banner-body">
                  <span className="pf-active-assignment-eyebrow">
                    {effectiveStatus === "conflict"
                      ? "⚠ Conflicto detectado"
                      : effectiveStatus === "arrived"
                        ? "✓ Estacionado"
                        : `⏱ Reserva activa • ${formattedTime}`}
                  </span>
                  <strong className="pf-banner-title">
                    Cajón {assignment.slot_name} • {assignment.lot_short_name}
                  </strong>
                  <span className="pf-banner-desc">
                    {assignment.zone_name} ({assignment.zone_landmark})
                  </span>
                </div>
                <button
                  type="button"
                  className="pf-banner-cta"
                  onClick={() => {
                    stopVoiceState();
                    setActiveView("guidance");
                  }}
                >
                  {effectiveStatus === "arrived"
                    ? "Ver detalle →"
                    : "Ver guía →"}
                </button>
              </section>
            ) : (
              <section
                className="pf-request-card"
                role="region"
                aria-label="Solicitar espacio de estacionamiento"
              >
                <div className="pf-request-card-info">
                  <strong className="pf-request-card-title">
                    {targetRequestLot
                      ? "Reserva y ruta guiada por 15 minutos"
                      : "Sin espacios disponibles"}
                  </strong>
                  <span className="pf-request-card-desc">
                    {targetRequestLot
                      ? targetRequestLot.id !== activeLot.id
                        ? `Se asignará el mejor cajón en ${targetRequestLot.shortName} (${targetRequestMetrics?.free ?? 0} libres) y te guiaremos hasta ahí.`
                        : `Asigna automáticamente el mejor cajón libre en ${activeLot.shortName} y te guía paso a paso.`
                      : "Todos los estacionamientos habilitados para tu rol están llenos en este momento."}
                  </span>
                  {effectiveStatus === "expired" && (
                    <span className="pf-request-expired-note">
                      Tu reserva anterior caducó. Puedes solicitar un lugar nuevo.
                    </span>
                  )}
                  {assignmentError && (
                    <span className="pf-request-error-note" role="alert">
                      {assignmentError}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="pf-primary-btn pf-request-cta"
                  disabled={!targetRequestLot || isRequesting}
                  onClick={() => handleRequestSpot(activeLot?.id)}
                >
                  {isRequesting
                    ? "Asignando cajón..."
                    : targetRequestLot
                      ? "🚗 Solicitar espacio (15 min)"
                      : "Sin cajones disponibles"}
                </button>
              </section>
            )}

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
                      C1 • Edif. L (Av. Tecnológico) requiere pase de
                      trabajador.
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
                      <span className="pf-banner-eyebrow">
                        Mejor opción ahora
                      </span>
                      <strong className="pf-banner-title">
                        {bestZone.name} • {bestZone.free_count}{" "}
                        {bestZone.free_count === 1 ? "libre" : "libres"}
                      </strong>
                      <span className="pf-banner-desc">
                        {bestZone.landmark}
                      </span>
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
              <div
                className="pf-demo-bar"
                aria-label="Controles de modo demostración"
              >
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
                assignedZoneId={
                  hasLiveAssignedSpot &&
                  assignment?.parking_lot_id === activeLot.id
                    ? assignment.zone_id
                    : null
                }
                assignedSlotName={
                  hasLiveAssignedSpot ? assignment.slot_name : null
                }
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
                      <span className="pf-micro-lot-tag">
                        {activeLot.shortName}
                      </span>
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
                    assignedPolygonId={
                      hasLiveAssignedSpot ? assignment.polygon_id : null
                    }
                    showGuidancePath={false}
                    assignmentConflict={effectiveStatus === "conflict"}
                  />
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Navbar flotante inferior tipo píldora (4 elementos) */}
      <div className="pf-floating-nav-wrapper">
        <nav className="pf-floating-nav" aria-label="Navegación rápida ParkFlow">
          <button
            type="button"
            className="pf-nav-item"
            data-active={activeView === "explore" && selectedZoneId === null}
            onClick={() => {
              stopVoiceState();
              setActiveView("explore");
              handleBackToZones();
            }}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              ◫
            </span>
            <span>Zonas</span>
          </button>

          {assignment ? (
            <button
              type="button"
              className="pf-nav-item"
              data-active={activeView === "guidance"}
              onClick={() => {
                stopVoiceState();
                setActiveView("guidance");
              }}
            >
              <span className="pf-nav-icon-circle" aria-hidden="true">
                🧭
                {(effectiveStatus === "active" ||
                  effectiveStatus === "conflict") && (
                  <span
                    className="pf-nav-status-dot"
                    data-conflict={String(effectiveStatus === "conflict")}
                  />
                )}
              </span>
              <span>Mi guía</span>
            </button>
          ) : (
            <button
              type="button"
              className="pf-nav-item"
              data-active={activeView === "explore" && selectedZoneId !== null}
              onClick={() => {
                stopVoiceState();
                setActiveView("explore");
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
          )}

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
