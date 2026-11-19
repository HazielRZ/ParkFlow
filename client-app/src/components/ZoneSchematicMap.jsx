/**
 * Mapa esquemático Nivel 2 (Meso) por zonas/pasillos reales del ITM.
 * Tarjetas limpias (--bg-surface) sin border-left ni degradados neón,
 * equipadas con mini-matriz visual de cajones al pie de cada zona.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React from "react";
import { getZoneTrafficLight } from "../data/campusLots.js";
import {
  ChevronRightIcon,
  LockIcon,
  MapPinIcon,
  NavigationIcon,
  StarIcon,
} from "./Icons.jsx";

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
    return "Caseta Principal · C. Raza Maya";
  }
  if (lot.id === "ITM-CAMPUS1-EST-SUR") {
    return "Paralelo a Periférico Revolución";
  }
  if (lot.id === "ITM-CAMPUS1-EST-EDIF-L") {
    return "Av. Tecnológico · Exclusivo personal ITM";
  }
  if (lot.id === "ITM-CAMPUS2-EST-CENTRAL") {
    return "Vialidad Principal Campus 2";
  }
  return lot.accessLabel || "";
}

export function ZoneSchematicMap({
  lot,
  bestZoneId = null,
  assignedZoneId = null,
  assignedSlotName = null,
  assignedPolygonId = null,
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
      className="pf-zones-section"
      aria-label={`Zonas de ${lot.name}`}
    >
      <div className="pf-zone-map-header">
        <div className="pf-zone-map-heading">
          <h2 className="pf-map-title">{lot.name}</h2>
          <p className="pf-zone-map-sub">{lot.accessLabel}</p>
        </div>

        <div className="pf-traffic-legend" aria-label="Leyenda de disponibilidad">
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--free)" }}
            />
            Libre
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--maneuver)" }}
            />
            Maniobra
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--occupied)" }}
            />
            Ocupado
          </span>
        </div>
      </div>

      {roadLabel && (
        <div className="pf-road-strip" aria-hidden="true">
          <span className="pf-road-label">
            <MapPinIcon size={14} />
            <span>{roadLabel}</span>
          </span>
          <span className="pf-road-hint">Toca para abrir croquis</span>
        </div>
      )}

      <div
        key={lot.id}
        className="pf-schematic-grid"
        data-layout={lot.layout_type || "compact"}
      >
        {zones.map((zone, index) => {
          const traffic = getZoneTrafficLight(zone);
          const isBest = Boolean(bestZoneId && zone.id === bestZoneId);
          const isAssignedZone = Boolean(
            assignedZoneId && zone.id === assignedZoneId
          );
          const occPct = Math.round((zone.occupancy_ratio || 0) * 100);
          const orientation =
            lot.layout_type === "linear" || lot.layout_type === "compact"
              ? SLOT_ORIENTATION_LABELS[zone.layout_slot]
              : null;
          const camSuffix = zone.camera_id
            ? zone.camera_id.slice(-4).toUpperCase()
            : null;
          const spots = Array.isArray(zone.spots) ? zone.spots : [];

          return (
            <button
              key={zone.id}
              type="button"
              className="pf-zone-card"
              style={{ "--stagger-index": Math.min(index, 5) }}
              data-slot={zone.layout_slot || "center"}
              data-traffic={traffic}
              data-recommended={String(isBest && !isRestricted)}
              data-assigned={isAssignedZone ? "true" : undefined}
              data-restricted={String(isRestricted)}
              aria-label={`Zona ${zone.name}, ${zone.landmark}, ${zone.free_count} libres de ${zone.total_count}, estado ${TRAFFIC_LABELS[traffic]}${
                isAssignedZone && assignedSlotName
                  ? `, tu cajón asignado ${assignedSlotName}`
                  : ""
              }${
                zone.maneuver_count > 0
                  ? `, ${zone.maneuver_count} en maniobra`
                  : ""
              }`}
              onClick={() => onSelectZone && onSelectZone(zone)}
            >
              <div className="pf-zone-card-top">
                <div className="pf-zone-block-main">
                  <div className="pf-zone-block-badges">
                    {orientation && (
                      <span className="pf-zone-orient-tag">{orientation}</span>
                    )}
                    {isAssignedZone && (
                      <span className="pf-zone-assigned-tag">
                        <NavigationIcon size={11} />
                        <span>
                          Tu lugar{assignedSlotName ? `: ${assignedSlotName}` : ""}
                        </span>
                      </span>
                    )}
                    {isBest && !isRestricted && (
                      <span className="pf-zone-best-tag">
                        <StarIcon size={11} />
                        <span>Mejor opción</span>
                      </span>
                    )}
                    {isRestricted && (
                      <span
                        className="pf-zone-lock-tag"
                        title="Exclusivo personal ITM"
                      >
                        <LockIcon size={11} />
                        <span>Personal</span>
                      </span>
                    )}
                    {zone.maneuver_count > 0 && (
                      <span className="pf-zone-maneuver-pill">
                        <span className="pf-dot-inline pf-dot-maneuver" />
                        <span>{zone.maneuver_count} maniobra</span>
                      </span>
                    )}
                  </div>

                  <strong className="pf-zone-block-name">{zone.name}</strong>
                  <span className="pf-zone-block-landmark">
                    {zone.landmark}
                  </span>

                  {technicalMode && (
                    <span className="pf-zone-tech-meta tabular-nums">
                      {camSuffix ? `CAM …${camSuffix} · ` : ""}
                      {occPct}% ocup. ({zone.total_count} cajones)
                    </span>
                  )}
                </div>

                <div className="pf-zone-block-count">
                  <div className="pf-zone-count-row">
                    <span className="pf-zone-free-num tabular-nums">
                      {zone.free_count}
                    </span>
                    <ChevronRightIcon size={16} className="pf-zone-chevron" />
                  </div>
                  <span className="pf-zone-free-label">
                    {zone.free_count === 0
                      ? "Lleno"
                      : zone.free_count === 1
                        ? "libre"
                        : "libres"}
                  </span>
                </div>
              </div>

              {/* Mini-matriz visual de cajones al pie de la tarjeta */}
              {spots.length > 0 && (
                <div
                  className="pf-zone-mini-matrix"
                  aria-hidden="true"
                >
                  {spots.map((spot) => {
                    const isReservedCell = Boolean(
                      assignedPolygonId && spot.polygon_id === assignedPolygonId
                    );
                    const cellState = isReservedCell
                      ? "assigned"
                      : spot.state === "Libre"
                        ? "free"
                        : spot.state === "En maniobra"
                          ? "maneuver"
                          : "occupied";
                    return (
                      <span
                        key={spot.polygon_id}
                        className="pf-mini-cell"
                        data-state={cellState}
                      />
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
