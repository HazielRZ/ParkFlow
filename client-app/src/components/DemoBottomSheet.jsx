/**
 * Bottom Sheet de Controles de Modo Demo (style-agents.md §2.4).
 * Agrupa cambio de rol (Estudiante / Personal ITM), simulación RF-04 (>=90%),
 * modo técnico (YOLO/IoU) y simuladores de reserva activa fuera de la pantalla Home.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  ClockIcon,
  GraduationCapIcon,
  IdCardIcon,
  SlidersIcon,
  XIcon,
} from "./Icons.jsx";

const SATURATION_SIM_OPTIONS = [
  { id: "off", label: "Normal", variant: "neutral" },
  { id: "warning", label: "≥90%", variant: "warning" },
  { id: "full", label: "100%", variant: "critical" },
  { id: "global_full", label: "Campus 100%", variant: "critical" },
];

export function DemoBottomSheet({
  open = false,
  onClose,
  connected = false,
  userRole = "student",
  onChangeRole,
  simulateHighOccupancy = false,
  onToggleHighOccupancy,
  saturationSimMode = null,
  onChangeSaturationSim,
  technicalMode = false,
  onToggleTechnicalMode,
  hasActiveAssignment = false,
  onSimulateShortTimer,
  onSimulateExternalOccupancy,
}) {
  const effectiveSimMode =
    saturationSimMode ?? (simulateHighOccupancy ? "warning" : "off");
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }

    if (!rendered) {
      return undefined;
    }

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setRendered(false);
      setClosing(false);
      return undefined;
    }

    setClosing(true);
    const timer = setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 210);

    return () => clearTimeout(timer);
  }, [open, rendered]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!rendered) {
    return null;
  }

  const sheetState = closing ? "closing" : "open";

  return (
    <div
      className="pf-sheet-backdrop"
      data-state={sheetState}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <section
        className="pf-bottom-sheet"
        data-state={sheetState}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-demo-sheet-title"
      >
        <div className="pf-sheet-handle" aria-hidden="true" />

        <div className="pf-sheet-header">
          <div>
            <span className="pf-sheet-eyebrow">
              {connected ? "Telemetría en vivo" : "Entorno de demostración"}
            </span>
            <h2 id="pf-demo-sheet-title" className="pf-sheet-title">
              Controles de Modo Demo
            </h2>
          </div>

          <button
            type="button"
            className="pf-sheet-close"
            onClick={() => onClose && onClose()}
            aria-label="Cerrar panel de demostración"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Selector de rol: Estudiante vs Personal ITM */}
        <div className="pf-sheet-section">
          <div className="pf-sheet-section-head">
            <strong>Perfil de acceso</strong>
            <span>Personal ITM desbloquea C1 • Edif. L</span>
          </div>

          <div
            className="pf-segmented-control"
            role="group"
            aria-label="Cambiar rol de acceso"
          >
            <button
              type="button"
              className="pf-segment-btn"
              aria-pressed={userRole === "student"}
              onClick={() => onChangeRole && onChangeRole("student")}
            >
              <GraduationCapIcon size={16} />
              <span>Estudiante</span>
            </button>
            <button
              type="button"
              className="pf-segment-btn"
              aria-pressed={userRole === "staff"}
              onClick={() => onChangeRole && onChangeRole("staff")}
            >
              <IdCardIcon size={16} />
              <span>Personal ITM</span>
            </button>
          </div>
        </div>

        {/* Simulación de alerta RF-04 / CU-03 y Modo técnico */}
        <div className="pf-sheet-section">
          <div className="pf-sheet-sim-card">
            <div className="pf-sheet-toggle-meta">
              <strong className="pf-sheet-toggle-title">
                <AlertTriangleIcon size={15} />
                <span>Simular saturación (RF-04 / CU-03)</span>
              </strong>
              <span className="pf-sheet-toggle-desc">
                {connected
                  ? "Desactivado mientras el WebSocket en vivo está conectado."
                  : "Prueba los umbrales ≥90%, 100% del lote o saturación total del campus."}
              </span>
            </div>

            <div
              className="pf-sheet-sim-pills"
              role="group"
              aria-label="Modos de simulación de saturación"
            >
              {SATURATION_SIM_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="pf-sheet-action-pill"
                  data-active={String(effectiveSimMode === option.id)}
                  data-variant={option.variant}
                  aria-pressed={effectiveSimMode === option.id}
                  disabled={connected}
                  onClick={() => {
                    if (onChangeSaturationSim) {
                      onChangeSaturationSim(option.id);
                    } else if (onToggleHighOccupancy) {
                      onToggleHighOccupancy();
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pf-sheet-toggle-row">
            <div className="pf-sheet-toggle-meta">
              <strong className="pf-sheet-toggle-title">
                <SlidersIcon size={15} />
                <span>Modo técnico (YOLO / IoU)</span>
              </strong>
              <span className="pf-sheet-toggle-desc">
                Muestra telemetría de cámara, confianza e IoU por cajón.
              </span>
            </div>

            <button
              type="button"
              className="pf-sheet-action-pill"
              data-active={String(technicalMode)}
              aria-pressed={technicalMode}
              onClick={() => onToggleTechnicalMode && onToggleTechnicalMode()}
            >
              {technicalMode ? "Activo" : "Activar"}
            </button>
          </div>
        </div>

        {/* Simuladores contextuales cuando hay una reserva activa */}
        {hasActiveAssignment && !connected && (
          <div className="pf-sheet-section">
            <div className="pf-sheet-section-head">
              <strong>Pruebas de reserva activa</strong>
              <span>Simula eventos de cámara o expiración</span>
            </div>
            <div className="pf-sheet-dual-actions">
              <button
                type="button"
                className="pf-secondary-btn pf-btn-compact"
                onClick={() => {
                  if (onSimulateExternalOccupancy) {
                    onSimulateExternalOccupancy();
                  }
                  if (onClose) {
                    onClose();
                  }
                }}
              >
                <AlertTriangleIcon size={15} />
                <span>Simular ocupación</span>
              </button>
              <button
                type="button"
                className="pf-secondary-btn pf-btn-compact"
                onClick={() => {
                  if (onSimulateShortTimer) {
                    onSimulateShortTimer(10);
                  }
                  if (onClose) {
                    onClose();
                  }
                }}
              >
                <ClockIcon size={15} />
                <span>Temporizador 10s</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
