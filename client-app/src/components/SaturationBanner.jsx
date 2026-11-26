/**
 * Banner prioritario de alerta de saturación (>= 90% y 100%) con recomendación
 * dinámica de zona o estacionamiento alterno (RF-04 • CU-03).
 * Alineado al sistema visual ParkFlow (`style-agents.md`: SVG consistentes, tabular-nums).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React from "react";
import { getSaturationStatus } from "../utils/saturationLogic.js";
import { AlertTriangleIcon, ArrowRightIcon } from "./Icons.jsx";

function getAlternativeContextLabel(alternative) {
  if (!alternative) {
    return "";
  }
  if (alternative.sameLot) {
    return "Zona alterna disponible en este estacionamiento";
  }
  if (alternative.sameCampus) {
    return "Alternativa disponible en el mismo campus";
  }
  return `Campus saturado · Alternativa en ${alternative.campus || "otro campus"}`;
}

export function SaturationBanner({
  occupancyRatio,
  occupancyPercentage,
  freeSpots,
  totalSpots,
  inManeuverSpots = 0,
  targetName = "",
  scope = "lot",
  alternative = null,
  onSelectAlternative,
  className = "",
}) {
  const status = getSaturationStatus({
    occupancyRatio,
    occupancyPercentage,
    free: freeSpots,
    total: totalSpots,
    inManeuver: inManeuverSpots,
  });

  if (!status.isVisible) {
    return null;
  }

  const remainingSpots = status.isCritical ? 0 : status.freeSpots;
  const remainingLabel =
    remainingSpots === 1 ? "1 cajón libre" : `${remainingSpots} cajones libres`;
  const maneuverSuffix =
    !status.isCritical && remainingSpots === 0 && status.inManeuverSpots > 0
      ? ` (${status.inManeuverSpots} en maniobra)`
      : "";

  const altSpotsLabel = alternative
    ? alternative.freeSpots === 1
      ? "1 libre"
      : `${alternative.freeSpots} libres`
    : "";

  return (
    <section
      className={`pf-saturation-banner${className ? ` ${className}` : ""}`}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      data-severity={status.level}
      data-scope={scope}
    >
      <div className="pf-saturation-header">
        <div className="pf-saturation-title-group">
          <span className="pf-saturation-icon" aria-hidden="true">
            <AlertTriangleIcon size={17} />
          </span>
          <strong className="pf-saturation-title">{status.title}</strong>
        </div>

        <span className="pf-saturation-pct-pill tabular-nums">
          {status.occupancyPercentage}%
        </span>
      </div>

      <p className="pf-saturation-meta tabular-nums">
        {targetName ? `${targetName} · ` : ""}
        {remainingLabel}
        {maneuverSuffix}
      </p>

      {alternative ? (
        <div className="pf-saturation-footer">
          <div className="pf-saturation-alt-info">
            <span className="pf-saturation-alt-hint">
              {getAlternativeContextLabel(alternative)}
            </span>
            {alternative.landmark && (
              <span className="pf-saturation-alt-landmark">
                {alternative.landmark}
              </span>
            )}
          </div>

          <button
            type="button"
            className="pf-saturation-cta tabular-nums"
            onClick={() => onSelectAlternative && onSelectAlternative(alternative)}
          >
            <span>
              Ir a {alternative.displayName} ({altSpotsLabel})
            </span>
            <ArrowRightIcon size={14} />
          </button>
        </div>
      ) : (
        <p className="pf-saturation-empty">
          Sin cajones disponibles en el campus. Revisa accesos alternos o espera
          la liberación de un lugar.
        </p>
      )}
    </section>
  );
}
