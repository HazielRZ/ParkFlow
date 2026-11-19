/**
 * Mapa SVG interactivo Nivel 3 (Micro — Croquis detallado de 1 zona con 12–16 cajones).
 * Reutiliza la vista cenital con carril central y soporta Modo Conductor / Modo Técnico.
 * Adaptado al Manual de Identidad Gráfica del TecNM (Pantone 294 C #1B396A).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useState } from "react";
import { CAMPUS_ZONES } from "../data/campusLots.js";

export { CAMPUS_ZONES };

export const STATE_BADGE_COLORS = {
  Libre: "#16a34a",
  "En maniobra": "#d97706",
  Ocupado: "#dc2626",
};

export const STATE_CONFIG = {
  Libre: {
    color: "#16a34a",
    icon: "✓",
    shortLabel: "LIBRE",
    dashArray: "none",
  },
  "En maniobra": {
    color: "#d97706",
    icon: "◐",
    shortLabel: "MANIOBRA",
    dashArray: "5 4",
  },
  Ocupado: {
    color: "#dc2626",
    icon: "✕",
    shortLabel: "OCUPADO",
    dashArray: "none",
  },
};

export const VEHICLE_LABELS = {
  car: "Automóvil (car)",
  truck: "Camioneta / Camión (truck)",
  motorcycle: "Motocicleta (motorcycle)",
  bus: "Autobús (bus)",
};

/**
 * Distribuye los cajones en 2 bloques laterales (A a la izquierda, B a la derecha)
 * separados por el carril central vertical.
 */
function computeCentralLaneSlotGeometry(index) {
  const isRightBlock = index % 2 === 1;
  const row = Math.floor(index / 2);

  const slotWidth = 176;
  const slotHeight = 68;
  const rowGap = 14;
  const startY = 54;

  const x = isRightBlock ? 340 : 24;
  const y = startY + row * (slotHeight + rowGap);

  return { x, y, width: slotWidth, height: slotHeight, row, isRightBlock };
}

/**
 * Vista superior cenital de automóvil en gris para cajones ocupados.
 */
function renderTopDownCarSvg(x, y, width) {
  const carW = 86;
  const carH = 34;
  const cx = x + (width - carW) / 2;
  const cy = y + 9;

  return (
    <g aria-hidden="true">
      {/* Sombra sutil de llantas */}
      <rect x={cx + 10} y={cy - 3} width="18" height="3" rx="1.5" fill="#4b5563" />
      <rect x={cx + carW - 28} y={cy - 3} width="18" height="3" rx="1.5" fill="#4b5563" />
      <rect x={cx + 10} y={cy + carH} width="18" height="3" rx="1.5" fill="#4b5563" />
      <rect x={cx + carW - 28} y={cy + carH} width="18" height="3" rx="1.5" fill="#4b5563" />

      {/* Carrocería cenital en gris */}
      <rect
        x={cx}
        y={cy}
        width={carW}
        height={carH}
        rx="10"
        fill="var(--map-car-body)"
        stroke="var(--map-car-cabin)"
        strokeWidth="1.5"
      />
      {/* Parabrisas y medallón */}
      <rect
        x={cx + 15}
        y={cy + 4}
        width="56"
        height="26"
        rx="6"
        fill="var(--map-car-window)"
      />
      {/* Toldo central */}
      <rect
        x={cx + 25}
        y={cy + 6}
        width="36"
        height="22"
        rx="4"
        fill="var(--map-car-cabin)"
      />
    </g>
  );
}

export function ParkingGrid({
  polygons = [],
  stateFilter = "Todos",
  selectedPolygonId: controlledSelectedId,
  onSelectSlot,
  zoneName = "Mapa de Cajones de Estacionamiento",
  laneLabel = "ENTRADA ITM",
  cameraId = null,
  technicalMode = false,
}) {
  const [internalSelectedId, setInternalSelectedId] = useState(null);
  const activeSelectedId =
    controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

  const handleSelect = (slot) => {
    const nextId =
      activeSelectedId === slot.polygon_id ? null : slot.polygon_id;
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(nextId);
    }
    if (onSelectSlot) {
      onSelectSlot(nextId ? slot : null);
    }
  };

  const handleClearSelection = () => {
    if (controlledSelectedId === undefined) {
      setInternalSelectedId(null);
    }
    if (onSelectSlot) {
      onSelectSlot(null);
    }
  };

  const explicitSlot = activeSelectedId
    ? polygons.find((item) => item.polygon_id === activeSelectedId) || null
    : null;
  const technicalSlot = explicitSlot || polygons[0] || null;

  const rowsCount = Math.max(1, Math.ceil(polygons.length / 2));
  const svgHeight = Math.max(320, 54 + rowsCount * 82 + 28);

  const arrowPositions = Array.from(
    { length: rowsCount },
    (_, idx) => 88 + idx * 82
  ).filter((y) => y < svgHeight - 40);

  return (
    <section
      className="pf-map-card"
      aria-label="Mapa de Cajones de Estacionamiento"
    >
      <div className="pf-map-header">
        <div>
          <h2 className="pf-map-title">{zoneName}</h2>
        </div>
        <div className="pf-legend" aria-label="Leyenda de estados">
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: STATE_BADGE_COLORS.Libre }}
            />
            ✓ Libre
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: STATE_BADGE_COLORS["En maniobra"] }}
            />
            ◐ Maniobra
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: STATE_BADGE_COLORS.Ocupado }}
            />
            ✕ Ocupado
          </span>
        </div>
      </div>

      <div className="pf-svg-wrapper">
        <svg
          className="pf-svg-canvas"
          viewBox={`0 0 540 ${svgHeight}`}
          role="img"
          aria-label={`Croquis interactivo de ${zoneName}`}
        >
          {/* Lienzo base del estacionamiento */}
          <rect
            x="6"
            y="6"
            width="528"
            height={svgHeight - 12}
            rx="16"
            fill="var(--map-canvas-bg)"
            stroke="var(--border-subtle)"
            strokeWidth="1.5"
          />

          {/* Encabezados de Bloques A y B */}
          <text
            x="112"
            y="34"
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="12"
            fontWeight="700"
          >
            BLOQUE A
          </text>
          <text
            x="428"
            y="34"
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="12"
            fontWeight="700"
          >
            BLOQUE B
          </text>

          {/* Carril central de entrada con flechas punteadas dinámicas */}
          <rect
            x="212"
            y="16"
            width="116"
            height={svgHeight - 32}
            rx="10"
            fill="var(--map-lane-bg)"
          />
          <text
            x="270"
            y="35"
            textAnchor="middle"
            fill="var(--accent-text)"
            fontSize="9.5"
            fontWeight="700"
          >
            {laneLabel}
          </text>
          <line
            x1="270"
            y1="48"
            x2="270"
            y2={svgHeight - 34}
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          {arrowPositions.map((arrowY) => (
            <path
              key={arrowY}
              d={`M264 ${arrowY} L270 ${arrowY + 10} L276 ${arrowY}`}
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Cajones organizados en bloques laterales */}
          {polygons.map((slot, index) => {
            const geom = computeCentralLaneSlotGeometry(index);
            const cfg = STATE_CONFIG[slot.state] || STATE_CONFIG.Libre;
            const matchesFilter =
              stateFilter === "Todos" || slot.state === stateFilter;
            const isSelected = activeSelectedId === slot.polygon_id;

            const slotFill = isSelected
              ? "var(--accent-soft)"
              : "var(--map-slot-bg)";
            const slotStroke = isSelected
              ? "var(--accent-border)"
              : slot.state === "En maniobra"
                ? "#d97706"
                : "var(--border-subtle)";
            const slotStrokeWidth = isSelected ? "2" : "1.5";
            const ariaDetail = technicalMode
              ? `, confianza ${Math.round((slot.confidence || 0) * 100)} por ciento`
              : "";

            return (
              <g
                key={slot.polygon_id}
                className="pf-slot-group"
                role="button"
                tabIndex={0}
                aria-label={`Cajón ${slot.slot_name}, estado ${slot.state}${ariaDetail}`}
                aria-pressed={isSelected}
                data-slot-state={slot.state}
                data-polygon-id={slot.polygon_id}
                style={{ opacity: matchesFilter ? 1 : 0.22 }}
                onClick={() => handleSelect(slot)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelect(slot);
                  }
                }}
              >
                <rect
                  x={geom.x}
                  y={geom.y}
                  width={geom.width}
                  height={geom.height}
                  rx="10"
                  fill={slotFill}
                  stroke={slotStroke}
                  strokeWidth={slotStrokeWidth}
                  strokeDasharray={isSelected ? "none" : cfg.dashArray}
                />

                {slot.state === "Ocupado" ? (
                  <>
                    {renderTopDownCarSvg(geom.x, geom.y, geom.width)}
                    <text
                      x={geom.x + 12}
                      y={geom.y + geom.height - 7}
                      fill="var(--text-muted)"
                      fontSize="10"
                      fontWeight="700"
                    >
                      {slot.slot_name}
                    </text>
                    <text
                      x={geom.x + geom.width - 12}
                      y={geom.y + geom.height - 7}
                      textAnchor="end"
                      fill="var(--status-danger)"
                      fontSize="10"
                      fontWeight="700"
                    >
                      ✕ OCUPADO
                    </text>
                  </>
                ) : slot.state === "En maniobra" ? (
                  <>
                    <text
                      x={geom.x + geom.width / 2}
                      y={geom.y + 30}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize="16"
                      fontWeight="800"
                    >
                      {slot.slot_name}
                    </text>
                    <text
                      x={geom.x + geom.width / 2}
                      y={geom.y + 50}
                      textAnchor="middle"
                      fill="var(--status-warning)"
                      fontSize="11"
                      fontWeight="700"
                    >
                      {technicalMode
                        ? `◐ MANIOBRA (${Math.round((slot.iou_ratio || 0) * 100)}%)`
                        : "◐ EN MANIOBRA"}
                    </text>
                  </>
                ) : (
                  <>
                    <text
                      x={geom.x + geom.width / 2}
                      y={geom.y + 34}
                      textAnchor="middle"
                      fill="var(--accent-text)"
                      fontSize="19"
                      fontWeight="800"
                    >
                      {slot.slot_name}
                    </text>
                    <text
                      x={geom.x + geom.width / 2}
                      y={geom.y + 52}
                      textAnchor="middle"
                      fill="var(--status-success)"
                      fontSize="11"
                      fontWeight="700"
                    >
                      ✓ LIBRE
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Vista Conductor: pill mínima sin telemetría técnica */}
      {!technicalMode && explicitSlot && (
        <div
          className="pf-driver-slot-chip"
          role="status"
          aria-live="polite"
        >
          <span className="pf-driver-slot-info">
            <span
              className="pf-state-pill"
              style={{
                backgroundColor:
                  STATE_BADGE_COLORS[explicitSlot.state] || "#64748b",
              }}
            >
              {(STATE_CONFIG[explicitSlot.state] || {}).icon || "•"}{" "}
              {explicitSlot.state}
            </span>
            <strong>Cajón {explicitSlot.slot_name}</strong>
          </span>
          <button
            type="button"
            className="pf-chip-close"
            onClick={handleClearSelection}
            aria-label="Cerrar selección de cajón"
          >
            ✕
          </button>
        </div>
      )}

      {/* Vista Técnica / Admin: telemetría completa de YOLO + IoU */}
      {technicalMode && technicalSlot && (
        <article
          className="pf-detail-sheet"
          role="region"
          aria-live="polite"
          aria-label={`Telemetría técnica del cajón ${technicalSlot.slot_name}`}
          data-slot-state={technicalSlot.state}
        >
          <div className="pf-detail-header">
            <div>
              <h3 className="pf-detail-title">
                Cajón {technicalSlot.slot_name}{" "}
                <small style={{ fontWeight: 500, color: "var(--text-muted)" }}>
                  ({technicalSlot.polygon_id})
                </small>
              </h3>
              {cameraId && (
                <small style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Cámara: {cameraId}
                </small>
              )}
            </div>
            <span
              className="pf-state-pill"
              style={{
                backgroundColor:
                  STATE_BADGE_COLORS[technicalSlot.state] || "#64748b",
              }}
            >
              {(STATE_CONFIG[technicalSlot.state] || {}).icon || "•"}{" "}
              {technicalSlot.state}
            </span>
          </div>

          <div className="pf-detail-grid">
            <div className="pf-detail-item">
              <strong>Tipo de vehículo</strong>
              <span>
                {technicalSlot.vehicle_type
                  ? VEHICLE_LABELS[technicalSlot.vehicle_type] ||
                    technicalSlot.vehicle_type
                  : "Sin vehículo (null)"}
              </span>
            </div>
            <div className="pf-detail-item">
              <strong>Estado reportado</strong>
              <span>{technicalSlot.state}</span>
            </div>
            <div className="pf-detail-item">
              <strong>Intersección (IoU)</strong>
              <span>{((technicalSlot.iou_ratio || 0) * 100).toFixed(1)}%</span>
            </div>
            <div className="pf-detail-item">
              <strong>Confianza YOLO</strong>
              <span>{((technicalSlot.confidence || 0) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}

export const ParkingSvgMap = ParkingGrid;
