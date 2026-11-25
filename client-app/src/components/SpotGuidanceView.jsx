/**
 * Vista dedicada de guiado paso a paso, temporizador de 15 minutos,
 * ruta animada sobre el croquis SVG y acciones del conductor (Client-App).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useEffect, useState } from "react";
import { ParkingGrid } from "./ParkingGrid.jsx";
import {
  buildGuidanceAnnouncement,
  isSpeechSupported,
  speakAvailability,
  stopAvailabilitySpeech,
} from "../utils/speechAvailability.js";

export function SpotGuidanceView({
  assignment,
  assignedLot = null,
  assignedZone = null,
  effectiveStatus = null,
  remainingMs = 0,
  progressRatio = 0,
  urgency = "normal",
  formattedTime = "15:00",
  maneuvering = false,
  route = null,
  connected = false,
  technicalMode = false,
  isRequesting = false,
  assignmentError = "",
  onConfirmArrival,
  onReassign,
  onCancel,
  onRequestNew,
  onExploreMap,
  onDismiss,
  onSimulateShortTimer,
  onSimulateExternalOccupancy,
}) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechNotice, setSpeechNotice] = useState("");

  useEffect(() => {
    setActiveStepIndex(0);
    stopAvailabilitySpeech();
    setIsSpeaking(false);
    setSpeechNotice("");
  }, [assignment?.assignment_id, effectiveStatus]);

  useEffect(() => () => stopAvailabilitySpeech(), []);

  if (!assignment) {
    return null;
  }

  const isConflict = effectiveStatus === "conflict";

  const handleToggleVoice = () => {
    if (isSpeaking) {
      stopAvailabilitySpeech();
      setIsSpeaking(false);
      setSpeechNotice("");
      return;
    }

    const message = buildGuidanceAnnouncement({
      assignment,
      route,
      remainingMs,
      conflict: isConflict,
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

  if (effectiveStatus === "arrived") {
    const arrivedTime = assignment.arrived_at
      ? new Date(assignment.arrived_at).toLocaleTimeString("es-MX", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    return (
      <section
        className="pf-guidance-shell"
        aria-label="Confirmación de estacionamiento"
      >
        <div className="pf-guidance-state-card" data-state="arrived">
          <span className="pf-guidance-state-badge" data-variant="success">
            ✓ Estacionado
          </span>
          <h2 className="pf-guidance-state-title">
            Vehículo en cajón {assignment.slot_name}
          </h2>
          <p className="pf-guidance-state-desc">
            {assignment.lot_name || assignment.lot_short_name} •{" "}
            {assignment.zone_name} ({assignment.zone_landmark})
            {arrivedTime ? ` • Confirmado a las ${arrivedTime}` : ""}
          </p>

          <div className="pf-guidance-state-actions">
            <button
              type="button"
              className="pf-primary-btn"
              onClick={() => onDismiss && onDismiss()}
            >
              Liberar y salir
            </button>
            <button
              type="button"
              className="pf-secondary-btn"
              onClick={() => onExploreMap && onExploreMap()}
            >
              Ver mapa de zonas
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (effectiveStatus === "expired") {
    return (
      <section
        className="pf-guidance-shell"
        aria-label="Reserva de cajón caducada"
      >
        <div className="pf-guidance-state-card" data-state="expired">
          <span className="pf-guidance-state-badge" data-variant="danger">
            ⏱ Tiempo agotado
          </span>
          <h2 className="pf-guidance-state-title">
            Tu reserva de 15 minutos venció
          </h2>
          <p className="pf-guidance-state-desc">
            El cajón <strong>{assignment.slot_name}</strong> en{" "}
            <strong>{assignment.zone_name}</strong> se liberó automáticamente
            para mantener la disponibilidad en tiempo real.
          </p>

          {assignmentError && (
            <p className="pf-guidance-error" role="alert">
              {assignmentError}
            </p>
          )}

          <div className="pf-guidance-state-actions">
            <button
              type="button"
              className="pf-primary-btn"
              disabled={isRequesting}
              onClick={() => onRequestNew && onRequestNew()}
            >
              {isRequesting ? "Buscando lugar..." : "🚗 Solicitar nuevo espacio"}
            </button>
            <button
              type="button"
              className="pf-secondary-btn"
              onClick={() => onDismiss && onDismiss()}
            >
              Volver a zonas
            </button>
          </div>
        </div>
      </section>
    );
  }

  const urgencyLabel = isConflict
    ? "Cajón ocupado"
    : urgency === "critical"
      ? "¡Menos de 1 min!"
      : urgency === "warning"
        ? "Caduca pronto"
        : "Expira en 15 min";

  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round((progressRatio || 0) * 100))
  );

  return (
    <section
      className="pf-guidance-shell"
      aria-label={`Guiado hacia el cajón ${assignment.slot_name}`}
    >
      {/* Tarjeta Hero superpuesta (-32px) con regreso rápido, cajón asignado y cuenta regresiva */}
      <article
        className="pf-guidance-hero"
        data-urgency={urgency}
        data-conflict={String(isConflict)}
      >
        <div className="pf-guidance-nav-row">
          <button
            type="button"
            className="pf-back-btn pf-back-btn-compact"
            onClick={() => onExploreMap && onExploreMap()}
          >
            ← Ver zonas
          </button>

          <span
            className="pf-guidance-live-pill"
            data-status={
              isConflict ? "conflict" : maneuvering ? "maneuver" : "active"
            }
          >
            {isConflict
              ? "⚠ Conflicto en cajón"
              : maneuvering
                ? "◐ En maniobra"
                : "🧭 Guía activa"}
          </span>
        </div>

        <div className="pf-guidance-hero-top">
          <div className="pf-guidance-spot-meta">
            <div className="pf-guidance-badges">
              <span className="pf-guidance-eyebrow">Tu lugar asignado</span>
              {assignment.reassigned_from && (
                <span className="pf-guidance-info-tag">
                  Reasignado desde {assignment.reassigned_from}
                </span>
              )}
              {assignment.redirected_from_lot_id && (
                <span className="pf-guidance-info-tag">
                  Redirigido a lote disponible
                </span>
              )}
            </div>

            <div className="pf-guidance-slot-row">
              <strong className="pf-guidance-slot-code">
                {assignment.slot_name}
              </strong>
              <div className="pf-guidance-lot-text">
                <span className="pf-guidance-zone-name">
                  {assignment.zone_name}
                </span>
                <span className="pf-guidance-landmark">
                  {assignedLot?.shortName || assignment.lot_short_name} •{" "}
                  {assignment.zone_landmark}
                </span>
              </div>
            </div>
          </div>

          <div
            className="pf-countdown-box"
            data-urgency={urgency}
            aria-live="off"
          >
            <span className="pf-countdown-digits">{formattedTime}</span>
            <span className="pf-countdown-label">{urgencyLabel}</span>
          </div>
        </div>

        <div
          className="pf-countdown-track"
          role="progressbar"
          aria-label="Tiempo restante de la reserva"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
        >
          <div
            className="pf-countdown-fill"
            data-urgency={urgency}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="pf-guidance-voice-row">
          <button
            type="button"
            className="pf-voice-btn"
            data-speaking={String(isSpeaking)}
            onClick={handleToggleVoice}
            aria-pressed={isSpeaking}
          >
            <span aria-hidden="true">{isSpeaking ? "⏹" : "🔊"}</span>
            <span>{isSpeaking ? "Detener guía" : "Escuchar ruta"}</span>
          </button>

          {route && (
            <span className="pf-guidance-route-chip">
              {route.blockName} • Fila {route.rowNumber} ({route.turnSymbol})
            </span>
          )}
        </div>

        {speechNotice && (
          <p className="pf-speech-caption" role="status" aria-live="polite">
            {speechNotice}
          </p>
        )}
      </article>

      {/* Alerta de conflicto si la cámara detecta el cajón ocupado */}
      {isConflict && (
        <div
          className="pf-guidance-alert"
          data-variant="conflict"
          role="alert"
        >
          <div className="pf-guidance-alert-body">
            <strong>
              ⚠ La cámara detectó un vehículo en {assignment.slot_name}
            </strong>
            <span>
              Si fuiste tú quien ya se estacionó, confirma tu llegada. Si otro
              vehículo lo ocupó, reasignamos otro cajón al instante.
            </span>
          </div>
          <div className="pf-guidance-alert-actions">
            <button
              type="button"
              className="pf-primary-btn pf-btn-compact"
              disabled={isRequesting}
              onClick={() => onReassign && onReassign()}
            >
              🔄 Reasignar otro lugar
            </button>
            <button
              type="button"
              className="pf-secondary-btn pf-btn-compact"
              onClick={() => onConfirmArrival && onConfirmArrival()}
            >
              ✓ Fui yo, ya me estacioné
            </button>
          </div>
        </div>
      )}

      {/* Aviso de maniobra detectada */}
      {!isConflict && maneuvering && (
        <div
          className="pf-guidance-alert"
          data-variant="maneuver"
          role="status"
          aria-live="polite"
        >
          <div className="pf-guidance-alert-body">
            <strong>
              ◐ Movimiento detectado en {assignment.slot_name}
            </strong>
            <span>¿Ya estás entrando al cajón asignado?</span>
          </div>
          <div className="pf-guidance-alert-actions">
            <button
              type="button"
              className="pf-secondary-btn pf-btn-compact"
              onClick={() => onConfirmArrival && onConfirmArrival()}
            >
              ✓ Ya me estacioné
            </button>
            <button
              type="button"
              className="pf-secondary-btn pf-btn-compact"
              disabled={isRequesting}
              onClick={() => onReassign && onReassign()}
            >
              🔄 Cambiar
            </button>
          </div>
        </div>
      )}

      {assignmentError && (
        <p className="pf-guidance-error" role="alert">
          {assignmentError}
        </p>
      )}

      {/* Ruta interna paso a paso */}
      {route && (
        <article
          className="pf-route-card"
          aria-label="Indicaciones paso a paso hacia tu cajón"
        >
          <div className="pf-route-header">
            <h2 className="pf-map-title">Ruta hacia tu cajón</h2>
            <span className="pf-route-meta-tag">
              {route.blockName} • Fila {route.rowNumber}
            </span>
          </div>

          <ol className="pf-route-steps">
            {route.steps.map((step, index) => {
              const isCurrent = index === activeStepIndex;
              const isDone = index < activeStepIndex;
              return (
                <li
                  key={step.id}
                  className="pf-route-step"
                  data-current={String(isCurrent)}
                  data-done={String(isDone)}
                >
                  <button
                    type="button"
                    className="pf-route-step-btn"
                    onClick={() => setActiveStepIndex(index)}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className="pf-route-step-num" aria-hidden="true">
                      {isDone ? "✓" : index + 1}
                    </span>
                    <span className="pf-route-step-content">
                      <strong className="pf-route-step-title">
                        <span aria-hidden="true">{step.icon} </span>
                        {step.title}
                      </strong>
                      <span className="pf-route-step-desc">
                        {step.description}
                      </span>
                    </span>
                  </button>

                  {step.id === "gate" && route.externalLinks && (
                    <div className="pf-external-nav-links">
                      <a
                        className="pf-ext-link"
                        href={route.externalLinks.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ↗ Google Maps
                      </a>
                      <a
                        className="pf-ext-link"
                        href={route.externalLinks.wazeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ↗ Waze
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </article>
      )}

      {/* Croquis SVG con trayectoria animada hacia el cajón asignado */}
      {assignedZone?.spots?.length > 0 && (
        <ParkingGrid
          polygons={assignedZone.spots}
          stateFilter="Todos"
          zoneName={`${assignedZone.name} — ${assignedZone.landmark}`}
          laneLabel={assignedZone.laneLabel || "ENTRADA ITM"}
          cameraId={assignedZone.camera_id}
          technicalMode={technicalMode}
          assignedPolygonId={assignment.polygon_id}
          showGuidancePath={true}
          assignmentConflict={isConflict}
        />
      )}

      {/* Acciones principales del conductor */}
      <div className="pf-guidance-actions">
        <button
          type="button"
          className="pf-primary-btn"
          onClick={() => onConfirmArrival && onConfirmArrival()}
        >
          ✓ Ya me estacioné
        </button>

        <div className="pf-guidance-secondary-row">
          <button
            type="button"
            className="pf-secondary-btn"
            disabled={isRequesting}
            onClick={() => onReassign && onReassign()}
          >
            {isRequesting ? "Buscando..." : "🔄 Cambiar cajón"}
          </button>
          <button
            type="button"
            className="pf-danger-ghost-btn"
            onClick={() => onCancel && onCancel()}
          >
            Cancelar lugar
          </button>
        </div>
      </div>

      {/* Controles rápidos de demostración cuando no hay WebSocket en vivo */}
      {!connected && (
        <div
          className="pf-demo-bar pf-guidance-demo-bar"
          aria-label="Simuladores de demostración de guía"
        >
          <span className="pf-demo-label">
            <strong>Demo guía</strong> • Pruebas rápidas
          </span>
          <div className="pf-guidance-demo-btns">
            <button
              type="button"
              className="pf-demo-btn"
              onClick={() =>
                onSimulateExternalOccupancy && onSimulateExternalOccupancy()
              }
            >
              Simular ocupación
            </button>
            <button
              type="button"
              className="pf-demo-btn"
              onClick={() =>
                onSimulateShortTimer && onSimulateShortTimer(10)
              }
            >
              Simular 10s
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
