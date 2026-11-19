/**
 * Mapa esquemático Nivel 2 (Meso — Vista por defecto) por zonas/pasillos reales del ITM.
 * Diseñado bajo enfoque Driver-First para leerse en <= 2 segundos desde un vehículo.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React from "react";
import { getZoneTrafficLight } from "../data/campusLots.js";

const SLOT_ORIENTATION_LABELS = {
  west: "Oeste",
  center: "Centro",
  east: "Este",
  north: "Norte",
  south: "Sur",
};

const TRAFFIC_LABELS = {
  available: "Disponible",
  limited: "Pocos lugares",
  full: "Lleno",
};

function getRoadReferenceText(lot) {
  if (!lot) {
    return "";
  }
  if (lot.id === "ITM-CAMPUS1-EST-NORTE") {
    return "↓ Caseta Principal • C. Raza Maya";
  }
  if (lot.id === "ITM-CAMPUS1-EST-SUR") {
    return "↔ Paralelo a Periférico Revolución";
  }
  if (lot.id === "ITM-CAMPUS1-EST-EDIF-L") {
    return "→ Av. Tecnológico • Exclusivo personal ITM";
  }
  if (lot.id === "ITM-CAMPUS2-EST-CENTRAL") {
    return "→ Vialidad Principal Campus 2";
  }
  return lot.accessLabel || "";
}

export function ZoneSchematicMap({
  lot,
  bestZoneId = null,
  userRole = "student",
  technicalMode = false,
  onSelectZone,
}) {
  if (!lot) {
    return null;
  }

  const isStaffLot = lot.access_type === "staff_only";
  const isRestricted = isStaffLot && userRole === "student";
  const roadLabel = getRoadReferenceText(lot);
  const zones = Array.isArray(lot.zones) ? lot.zones : [];

  return (
    <section
      className="pf-zone-map-card"
      aria-label={`Mapa esquemático por zonas de ${lot.name}`}
    >
      <div className="pf-zone-map-header">
        <div className="pf-zone-map-heading">
          <h2 className="pf-map-title">{lot.name}</h2>
          <p className="pf-zone-map-sub">{lot.accessLabel}</p>
        </div>

        <div className="pf-traffic-legend" aria-label="Semáforo de zonas">
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: "var(--status-success)" }}
            />
            Libre
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: "var(--status-warning)" }}
            />
            Pocos
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: "var(--status-danger)" }}
            />
            Lleno
          </span>
        </div>
      </div>

      {roadLabel && (
        <div className="pf-road-strip" aria-hidden="true">
          <span>{roadLabel}</span>
          <span className="pf-road-hint">Toca una zona</span>
        </div>
      )}

      <div
        className="pf-schematic-grid"
        data-layout={lot.layout_type || "compact"}
      >
        {zones.map((zone) => {
          const traffic = getZoneTrafficLight(zone);
          const isBest = Boolean(bestZoneId && zone.id === bestZoneId);
          const occPct = Math.round((zone.occupancy_ratio || 0) * 100);
          const orientation =
            lot.layout_type === "linear" || lot.layout_type === "compact"
              ? SLOT_ORIENTATION_LABELS[zone.layout_slot]
              : null;
          const camSuffix = zone.camera_id
            ? zone.camera_id.slice(-4).toUpperCase()
            : null;

          return (
            <button
              key={zone.id}
              type="button"
              className="pf-zone-block"
              data-slot={zone.layout_slot || "center"}
              data-traffic={traffic}
              data-recommended={String(isBest && !isRestricted)}
              data-restricted={String(isRestricted)}
              aria-label={`Zona ${zone.name}, ${zone.landmark}, ${zone.free_count} libres de ${zone.total_count}, estado ${TRAFFIC_LABELS[traffic]}${
                zone.maneuver_count > 0
                  ? `, ${zone.maneuver_count} en maniobra`
                  : ""
              }`}
              onClick={() => onSelectZone && onSelectZone(zone)}
            >
              <div className="pf-zone-block-main">
                <div className="pf-zone-block-badges">
                  {orientation && (
                    <span className="pf-zone-orient-tag">{orientation}</span>
                  )}
                  {isBest && !isRestricted && (
                    <span className="pf-zone-best-tag">★ Mejor</span>
                  )}
                  {isRestricted && (
                    <span
                      className="pf-zone-lock-tag"
                      title="Exclusivo personal ITM"
                    >
                      🔒 Personal
                    </span>
                  )}
                </div>

                <strong className="pf-zone-block-name">{zone.name}</strong>
                <span className="pf-zone-block-landmark">{zone.landmark}</span>

                {technicalMode && (
                  <span className="pf-zone-tech-meta">
                    {camSuffix ? `CAM: …${camSuffix} • ` : ""}
                    {occPct}% ocup. ({zone.total_count} caj.)
                  </span>
                )}
              </div>

              <div className="pf-zone-block-count">
                <span className="pf-zone-free-num">{zone.free_count}</span>
                <span className="pf-zone-free-label">
                  {zone.free_count === 0
                    ? "lleno"
                    : zone.free_count === 1
                      ? "libre"
                      : "libres"}
                </span>
                {zone.maneuver_count > 0 && (
                  <span className="pf-zone-maneuver-pill">
                    ◐ {zone.maneuver_count} maniobra
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
