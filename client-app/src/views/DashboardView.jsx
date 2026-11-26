/**
 * Vista principal móvil/PWA de disponibilidad en tiempo real con identidad TecNM (#1B396A).
 * Cumple style-agents.md: header curvo, carril horizontal de campus, hero de ocupación con
 * anillo radial + barra segmentada, tarjeta inteligente unificada, zonas con mini-matriz,
 * croquis arquitectónico, bottom sheet de Modo Demo y cápsula de navegación flotante.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CAMPUS_LOTS,
  adaptFlatPolygonsToLot,
  applyFullOccupancySimulation,
  applyHighOccupancySimulation,
  getBestZoneForLot,
  getLotMetrics,
  getNearestGeneralLot,
} from "../data/campusLots.js";
import { ParkingGrid } from "../components/ParkingGrid.jsx";
import { SaturationBanner } from "../components/SaturationBanner.jsx";
import { ZoneSchematicMap } from "../components/ZoneSchematicMap.jsx";
import { SpotGuidanceView } from "../components/SpotGuidanceView.jsx";
import { DemoBottomSheet } from "../components/DemoBottomSheet.jsx";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  LayoutGridIcon,
  LockIcon,
  MoonIcon,
  NavigationIcon,
  ParkingSquareIcon,
  SlidersIcon,
  SparklesIcon,
  SquareStopIcon,
  SunIcon,
  Volume2Icon,
} from "../components/Icons.jsx";
import { useParkingSocket } from "../hooks/useParkingSocket.js";
import { useParkingAssignment } from "../hooks/useParkingAssignment.js";
import { getEligibleLots } from "../utils/assignmentLogic.js";
import {
  resolveActiveSaturationAlert,
  shouldTriggerSaturationNotification,
} from "../utils/saturationLogic.js";
import {
  buildAvailabilityAnnouncement,
  buildSaturationAlertAnnouncement,
  isSpeechSupported,
  speakAvailability,
  stopAvailabilitySpeech,
} from "../utils/speechAvailability.js";

const STATE_FILTERS = [
  { id: "Todos", label: "Todos", dotColor: null },
  { id: "Libre", label: "Libres", dotColor: "var(--free)" },
  { id: "En maniobra", label: "Maniobra", dotColor: "var(--maneuver)" },
  { id: "Ocupado", label: "Ocupados", dotColor: "var(--occupied)" },
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
  const [saturationSim, setSaturationSim] = useState({
    mode: "off",
    lotId: null,
  });
  const [demoSheetOpen, setDemoSheetOpen] = useState(false);
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
          if (saturationSim.mode === "global_full") {
            return applyFullOccupancySimulation(lotTemplate);
          }
          if (
            saturationSim.mode === "full" &&
            lotTemplate.id === saturationSim.lotId
          ) {
            return applyFullOccupancySimulation(lotTemplate);
          }
          if (
            saturationSim.mode === "warning" &&
            lotTemplate.id === saturationSim.lotId
          ) {
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
      saturationSim,
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

  const activeSaturationAlert = useMemo(
    () =>
      resolveActiveSaturationAlert({
        lots: resolvedLots,
        activeLot,
        activeZone,
        userRole,
      }),
    [resolvedLots, activeLot, activeZone, userRole]
  );

  const saturationTrackerRef = useRef({
    initialized: false,
    level: "normal",
    key: null,
  });

  useEffect(() => {
    const nextLevel = activeSaturationAlert?.status?.level || "normal";
    const nextKey = activeSaturationAlert?.transitionKey || null;
    const prev = saturationTrackerRef.current;

    if (!prev.initialized) {
      saturationTrackerRef.current = {
        initialized: true,
        level: nextLevel,
        key: nextKey,
      };
      return;
    }

    const shouldNotify =
      Boolean(activeSaturationAlert) &&
      shouldTriggerSaturationNotification(prev.level, nextLevel);

    saturationTrackerRef.current = {
      initialized: true,
      level: nextLevel,
      key: nextKey,
    };

    if (!shouldNotify) {
      return;
    }

    const alertText = buildSaturationAlertAnnouncement({
      status: activeSaturationAlert.status,
      targetName: activeSaturationAlert.targetName,
      alternative: activeSaturationAlert.alternative,
    });

    if (!alertText) {
      return;
    }

    setSpeechNotice(alertText);
    if (isSpeechSupported()) {
      speakAvailability(alertText, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          setIsSpeaking(false);
          setSpeechNotice("");
        },
        onError: () => setIsSpeaking(false),
      });
    }
  }, [activeSaturationAlert]);

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
    stopVoiceState();
  };

  const handleSelectAlternativeZone = (alternative) => {
    if (!alternative) {
      return;
    }
    stopVoiceState();
    if (alternative.type === "zone" && alternative.lotId === activeLot?.id) {
      const targetZone = activeLot.zones?.find(
        (zone) => zone.id === alternative.zoneId
      );
      if (targetZone) {
        handleOpenZone(targetZone);
        return;
      }
    }
    handleSelectLot(alternative.lotId);
  };

  const handleChangeSaturationSim = (mode) => {
    if (mode === "off") {
      setSaturationSim({ mode: "off", lotId: null });
      return;
    }
    if (mode === "global_full") {
      setSaturationSim({ mode: "global_full", lotId: null });
      return;
    }
    setSaturationSim({ mode, lotId: selectedLotId });
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

  const handleReserveSpecificSlot = async (slot) => {
    if (!slot || slot.state !== "Libre") {
      return;
    }
    stopVoiceState();
    const result = await requestSpot({
      preferredLotId: activeLot?.id,
      preferredPolygonId: slot.polygon_id,
      userRole,
    });
    if (result?.ok && result.assignment) {
      setSelectedSlot(null);
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
  const isCroquisActive = !showGuidanceScreen && selectedZoneId !== null;

  // Cálculos del anillo radial y barra segmentada para el Hero de ocupación
  const totalSlots = Math.max(1, activeLotMetrics.total_slots || 0);
  const freePct = (activeLotMetrics.free / totalSlots) * 100;
  const maneuverPct = (activeLotMetrics.in_maneuver / totalSlots) * 100;
  const occupiedPct = Math.max(0, 100 - freePct - maneuverPct);

  const ringRadius = 31;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset =
    ringCircumference -
    (Math.min(100, Math.max(0, occupancyPercentage)) / 100) * ringCircumference;
  const ringColor = activeLotMetrics.high_occupancy_alert
    ? "var(--occupied)"
    : occupancyPercentage >= 70
      ? "var(--maneuver)"
      : "var(--accent-text)";

  return (
    <main className="pf-app" data-has-context={String(isCroquisActive)}>
      {/* Header curvo institucional (#1B396A -> #132A4F, border-bottom-radius: 28px) */}
      <header
        className="pf-hero-header"
        data-compact={String(showGuidanceScreen)}
      >
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
            <button
              type="button"
              className="pf-conn-pill"
              data-status={connectionStatus}
              onClick={() => setDemoSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={demoSheetOpen}
              title="Abrir controles de Modo Demo"
            >
              <span className="pf-conn-dot" aria-hidden="true" />
              <span>{connectionLabel}</span>
            </button>

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
              <span key={theme} className="pf-theme-icon-swap" aria-hidden="true">
                {theme === "light" ? <MoonIcon size={17} /> : <SunIcon size={17} />}
              </span>
            </button>
          </div>
        </div>

        {!showGuidanceScreen && (
          <>
            <div className="pf-header-headline-row">
              <h2 className="pf-hero-headline">
                Encuentra tu <em className="pf-italic-accent">lugar</em>
              </h2>

              <button
                type="button"
                className="pf-header-voice-btn"
                data-speaking={String(isSpeaking)}
                onClick={handleVoiceReadout}
                aria-pressed={isSpeaking}
                aria-label={
                  isSpeaking
                    ? "Detener lectura por voz"
                    : "Escuchar disponibilidad por voz"
                }
              >
                {isSpeaking ? (
                  <SquareStopIcon size={14} />
                ) : (
                  <Volume2Icon size={15} />
                )}
                <span>{isSpeaking ? "Detener" : "Escuchar"}</span>
              </button>
            </div>

            {speechNotice && (
              <p
                className="pf-header-speech-caption"
                role="status"
                aria-live="polite"
              >
                {speechNotice}
              </p>
            )}

            {/* Carril horizontal deslizable de píldoras de campus (reemplaza la cuadrícula 2x2) */}
            <div
              className="pf-campus-rail"
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
                    className="pf-campus-pill"
                    data-staff={String(isStaffOnly)}
                    onClick={() => handleSelectLot(lot.id)}
                  >
                    <span>{lot.shortName}</span>
                    {isStaffOnly && (
                      <span
                        className="pf-pill-lock"
                        title="Exclusivo personal ITM"
                      >
                        <LockIcon size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
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
          />
        ) : (
          <>
            {/* Tarjeta Hero de Ocupación Espacial superpuesta (-38px) */}
            <section
              className="pf-hero-occupancy-card"
              aria-label="Resumen de ocupación del estacionamiento"
            >
              <div className="pf-hero-occ-main">
                <div className="pf-hero-occ-metrics">
                  <span className="pf-hero-occ-eyebrow">
                    {activeLot.shortName} · Disponibilidad actual
                  </span>
                  <div className="pf-hero-free-row">
                    <strong
                      key={`${activeLot.id}-${activeLotMetrics.free}`}
                      className="pf-hero-free-num tabular-nums"
                    >
                      {activeLotMetrics.free}
                    </strong>
                    <span className="pf-hero-free-unit">
                      {activeLotMetrics.free === 1
                        ? "lugar libre"
                        : "lugares libres"}
                    </span>
                  </div>
                  <p className="pf-hero-submetric tabular-nums">
                    {activeLotMetrics.in_maneuver} en maniobra ·{" "}
                    {activeLotMetrics.occupied}/{activeLotMetrics.total_slots}{" "}
                    ocupados
                  </p>
                </div>

                {/* Anillo radial de porcentaje */}
                <div
                  className="pf-radial-ring"
                  role="img"
                  aria-label={`${occupancyPercentage}% de ocupación`}
                >
                  <svg viewBox="0 0 76 76" className="pf-radial-svg">
                    <circle
                      cx="38"
                      cy="38"
                      r={ringRadius}
                      className="pf-radial-track"
                    />
                    <circle
                      cx="38"
                      cy="38"
                      r={ringRadius}
                      className="pf-radial-progress"
                      style={{
                        stroke: ringColor,
                        strokeDasharray: ringCircumference,
                        strokeDashoffset: ringOffset,
                      }}
                    />
                  </svg>
                  <div className="pf-radial-center">
                    <strong className="pf-radial-pct tabular-nums">
                      {occupancyPercentage}%
                    </strong>
                    <span className="pf-radial-label">ocup.</span>
                  </div>
                </div>
              </div>

              {/* Barra segmentada horizontal de 3 estados */}
              <div className="pf-segmented-bar-wrap">
                <div
                  className="pf-segmented-bar"
                  role="img"
                  aria-label={`Libres: ${activeLotMetrics.free}, En maniobra: ${activeLotMetrics.in_maneuver}, Ocupados: ${activeLotMetrics.occupied}`}
                >
                  {freePct > 0 && (
                    <span
                      className="pf-seg-free"
                      style={{ width: `${freePct}%` }}
                    />
                  )}
                  {maneuverPct > 0 && (
                    <span
                      className="pf-seg-maneuver"
                      style={{ width: `${maneuverPct}%` }}
                    />
                  )}
                  {occupiedPct > 0 && (
                    <span
                      className="pf-seg-occupied"
                      style={{ width: `${occupiedPct}%` }}
                    />
                  )}
                </div>

                <div className="pf-segmented-legend tabular-nums">
                  <span className="pf-seg-legend-item">
                    <span
                      className="pf-legend-dot"
                      style={{ backgroundColor: "var(--free)" }}
                    />
                    <span>{activeLotMetrics.free} libres</span>
                  </span>
                  <span className="pf-seg-legend-item">
                    <span
                      className="pf-legend-dot"
                      style={{ backgroundColor: "var(--maneuver)" }}
                    />
                    <span>{activeLotMetrics.in_maneuver} maniobra</span>
                  </span>
                  <span className="pf-seg-legend-item">
                    <span
                      className="pf-legend-dot"
                      style={{ backgroundColor: "var(--car-body)" }}
                    />
                    <span>{activeLotMetrics.occupied} ocupados</span>
                  </span>
                </div>
              </div>
            </section>

            {/* Banner prioritario automático de saturación >= 90% y 100% (RF-04 / CU-03) */}
            {activeSaturationAlert && (
              <SaturationBanner
                occupancyRatio={activeSaturationAlert.status.occupancyRatio}
                occupancyPercentage={
                  activeSaturationAlert.status.occupancyPercentage
                }
                freeSpots={activeSaturationAlert.status.freeSpots}
                totalSpots={activeSaturationAlert.status.totalSpots}
                inManeuverSpots={activeSaturationAlert.status.inManeuverSpots}
                targetName={activeSaturationAlert.targetName}
                scope={activeSaturationAlert.scope}
                alternative={activeSaturationAlert.alternative}
                onSelectAlternative={handleSelectAlternativeZone}
              />
            )}

            {/* Tarjeta Protagonista Unificada (Smart Action) en azul TecNM */}
            {selectedZoneId === null && (
              hasLiveAssignedSpot ? (
                <section
                  className="pf-smart-card"
                  data-variant={
                    effectiveStatus === "conflict"
                      ? "conflict"
                      : effectiveStatus === "arrived"
                        ? "arrived"
                        : "active"
                  }
                  role="region"
                  aria-label="Tu espacio asignado actualmente"
                >
                  <div className="pf-smart-top">
                    <span className="pf-smart-eyebrow">
                      {effectiveStatus === "conflict" ? (
                        <>
                          <AlertTriangleIcon size={13} />
                          <span>Conflicto detectado</span>
                        </>
                      ) : effectiveStatus === "arrived" ? (
                        <>
                          <CheckCircleIcon size={13} />
                          <span>Estacionado</span>
                        </>
                      ) : (
                        <>
                          <ClockIcon size={13} />
                          <span className="tabular-nums">
                            Reserva activa · {formattedTime}
                          </span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="pf-smart-body">
                    <strong className="pf-smart-title tabular-nums">
                      Cajón {assignment.slot_name} · {assignment.lot_short_name}
                    </strong>
                    <span className="pf-smart-desc">
                      {assignment.zone_name} ({assignment.zone_landmark})
                    </span>
                  </div>

                  <button
                    type="button"
                    className="pf-smart-white-cta"
                    onClick={() => {
                      stopVoiceState();
                      setActiveView("guidance");
                    }}
                  >
                    <NavigationIcon size={15} />
                    <span>
                      {effectiveStatus === "arrived"
                        ? "Ver detalle de llegada"
                        : "Abrir guía paso a paso"}
                    </span>
                    <ArrowRightIcon size={15} />
                  </button>
                </section>
              ) : isStaffRestricted ? (
                <section
                  className="pf-smart-card"
                  data-variant="restricted"
                  role="region"
                  aria-label="Acceso exclusivo para personal y alternativa recomendada"
                >
                  <div className="pf-smart-top">
                    <span className="pf-smart-eyebrow">
                      <LockIcon size={13} />
                      <span>Exclusivo personal ITM</span>
                    </span>
                    {suggestedGeneralLot && (
                      <button
                        type="button"
                        className="pf-smart-link"
                        onClick={() => handleSelectLot(suggestedGeneralLot.id)}
                      >
                        <span className="tabular-nums">
                          Ver {suggestedGeneralLot.shortName} (
                          {suggestedGeneralMetrics?.free ?? 0})
                        </span>
                      </button>
                    )}
                  </div>

                  <div className="pf-smart-body">
                    <strong className="pf-smart-title">
                      {activeLot.shortName} requiere pase de trabajador
                    </strong>
                    <span className="pf-smart-desc">
                      {suggestedGeneralLot
                        ? `Alternativa recomendada: ${suggestedGeneralLot.name} con ${suggestedGeneralMetrics?.free ?? 0} libres.`
                        : "Cambia tu perfil a Personal ITM en Demo o elige otro lote."}
                    </span>
                    {secondaryGeneralLot && (
                      <div className="pf-smart-alt-row">
                        <button
                          type="button"
                          className="pf-smart-alt-chip"
                          onClick={() =>
                            handleSelectLot(secondaryGeneralLot.id)
                          }
                        >
                          <span className="tabular-nums">
                            {secondaryGeneralLot.shortName} (
                            {getLotMetrics(secondaryGeneralLot).free} libres)
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="pf-smart-white-cta"
                    disabled={!targetRequestLot || isRequesting}
                    onClick={() => handleRequestSpot(activeLot?.id)}
                  >
                    <NavigationIcon size={15} />
                    <span>
                      {isRequesting
                        ? "Asignando cajón..."
                        : targetRequestLot
                          ? `Solicitar espacio en ${targetRequestLot.shortName} (15 min)`
                          : "Sin cajones disponibles"}
                    </span>
                  </button>
                </section>
              ) : (
                <section
                  className="pf-smart-card"
                  role="region"
                  aria-label="Mejor opción y solicitud de espacio"
                >
                  <div className="pf-smart-top">
                    <span className="pf-smart-eyebrow">
                      <SparklesIcon size={13} />
                      <span>Mejor opción ahora</span>
                    </span>
                    {bestZone && bestZone.free_count > 0 && (
                      <button
                        type="button"
                        className="pf-smart-link"
                        onClick={() => handleOpenZone(bestZone)}
                      >
                        <span>Ver croquis</span>
                        <ArrowRightIcon size={13} />
                      </button>
                    )}
                  </div>

                  <div className="pf-smart-body">
                    <strong className="pf-smart-title tabular-nums">
                      {bestZone && bestZone.free_count > 0
                        ? `${bestZone.name} · ${bestZone.free_count} ${
                            bestZone.free_count === 1 ? "libre" : "libres"
                          }`
                        : targetRequestLot
                          ? `Disponible en ${targetRequestLot.shortName}`
                          : "Sin espacios disponibles"}
                    </strong>
                    <span className="pf-smart-desc">
                      {bestZone &&
                      bestZone.free_count > 0 &&
                      activeLotMetrics.free > 0
                        ? `${bestZone.landmark}. Asigna automáticamente el mejor cajón cercano al acceso.`
                        : targetRequestLot && targetRequestLot.id !== activeLot.id
                          ? `Sin cupo aquí. Te asignaremos lugar en ${targetRequestLot.shortName} (${targetRequestMetrics?.free ?? 0} libres).`
                          : "Todos los estacionamientos habilitados para tu rol están llenos en este momento."}
                    </span>

                    {effectiveStatus === "expired" && (
                      <span className="pf-smart-note">
                        Tu reserva anterior caducó. Puedes solicitar un lugar
                        nuevo.
                      </span>
                    )}
                    {assignmentError && (
                      <span className="pf-smart-error" role="alert">
                        {assignmentError}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="pf-smart-white-cta"
                    disabled={!targetRequestLot || isRequesting}
                    onClick={() => handleRequestSpot(activeLot?.id)}
                  >
                    <NavigationIcon size={15} />
                    <span>
                      {isRequesting
                        ? "Asignando cajón..."
                        : targetRequestLot
                          ? "Solicitar espacio y guiar (15 min)"
                          : "Sin cajones disponibles"}
                    </span>
                  </button>
                </section>
              )
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
                assignedPolygonId={
                  hasLiveAssignedSpot ? assignment.polygon_id : null
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
                      <ArrowLeftIcon size={15} />
                      <span>Ver zonas</span>
                    </button>
                    <div className="pf-micro-summary">
                      <span className="pf-micro-lot-tag">
                        {activeLot.shortName}
                      </span>
                      <strong className="pf-micro-count tabular-nums">
                        {activeZone.free_count} libres
                        {activeZone.maneuver_count > 0
                          ? ` · ${activeZone.maneuver_count} maniobra`
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
                          <span className="pf-micro-tab-count tabular-nums">
                            {zone.free_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtros de estado dentro del Nivel 3 (sin emojis/símbolos repetitivos) */}
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
                        {filter.dotColor && (
                          <span
                            className="pf-legend-dot"
                            style={{ backgroundColor: filter.dotColor }}
                          />
                        )}
                        <span>{filter.label}</span>
                      </button>
                    ))}
                  </div>

                  <ParkingGrid
                    key={activeZone.id}
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
                    assignment={hasLiveAssignedSpot ? assignment : null}
                    effectiveStatus={effectiveStatus}
                    formattedTime={formattedTime}
                    isStaffRestricted={isStaffRestricted}
                    isRequesting={isRequesting}
                    showContextBar={true}
                    onReserveSlot={handleReserveSpecificSlot}
                    onConfirmArrival={handleConfirmArrival}
                    onReleaseAssignment={handleCancelAssignment}
                    onOpenGuidance={() => {
                      stopVoiceState();
                      setActiveView("guidance");
                    }}
                  />
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Navbar flotante inferior tipo cápsula (border-radius: 9999px + blur 18px) */}
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
              <LayoutGridIcon size={17} />
            </span>
            <span>Zonas</span>
          </button>

          <button
            type="button"
            className="pf-nav-item"
            data-active={activeView === "explore" && selectedZoneId !== null}
            onClick={() => {
              stopVoiceState();
              setActiveView("explore");
              if (selectedZoneId === null) {
                const targetZone = bestZone || activeLot?.zones?.[0];
                if (targetZone) {
                  handleOpenZone(targetZone);
                }
              }
            }}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              <ParkingSquareIcon size={17} />
            </span>
            <span>Croquis</span>
          </button>

          {assignment && (
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
                <NavigationIcon size={17} />
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
          )}

          <button
            type="button"
            className="pf-nav-item"
            data-active={technicalMode}
            aria-pressed={technicalMode}
            onClick={() => setTechnicalMode((prev) => !prev)}
          >
            <span className="pf-nav-icon-circle" aria-hidden="true">
              <SlidersIcon size={17} />
            </span>
            <span>Técnico</span>
          </button>
        </nav>
      </div>

      {/* Bottom sheet de Modo Demo (abierto desde el pill Demo / En vivo del header) */}
      <DemoBottomSheet
        open={demoSheetOpen}
        onClose={() => setDemoSheetOpen(false)}
        connected={connected}
        userRole={userRole}
        onChangeRole={setUserRole}
        saturationSimMode={
          saturationSim.mode === "global_full"
            ? "global_full"
            : saturationSim.lotId === selectedLotId
              ? saturationSim.mode
              : "off"
        }
        onChangeSaturationSim={handleChangeSaturationSim}
        technicalMode={technicalMode}
        onToggleTechnicalMode={() => setTechnicalMode((prev) => !prev)}
        hasActiveAssignment={Boolean(
          assignment && effectiveStatus === "active"
        )}
        onSimulateShortTimer={simulateShortTimer}
        onSimulateExternalOccupancy={simulateExternalOccupancy}
      />
    </main>
  );
}
