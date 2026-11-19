/**
 * Mapa SVG interactivo de cajones con carril central y vista cenital (PF-19 / INT-UI-01 / RF-01).
 * Adaptado al Manual de Identidad Gráfica del TecNM (Pantone 294 C #1B396A).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useState } from "react";

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

export const CAMPUS_ZONES = [
  {
    id: "ITM-CAMPUS1-EST-NORTE",
    shortName: "Campus 1 • Norte",
    name: "Campus 1 — Estacionamiento Norte (Sistemas / Edif. K)",
    bays: ["Bloque A (Poniente)", "Bloque B (Oriente)"],
    defaultSlots: [
      { polygon_id: "poly-itm-a01", slot_name: "A-01", state: "Libre", confidence: 0.96, iou_ratio: 0.04, vehicle_type: null },
      { polygon_id: "poly-itm-a02", slot_name: "A-02", state: "Ocupado", confidence: 0.94, iou_ratio: 0.78, vehicle_type: "car" },
      { polygon_id: "poly-itm-a03", slot_name: "A-03", state: "Libre", confidence: 0.97, iou_ratio: 0.02, vehicle_type: null },
      { polygon_id: "poly-itm-a04", slot_name: "A-04", state: "Ocupado", confidence: 0.91, iou_ratio: 0.81, vehicle_type: "truck" },
      { polygon_id: "poly-itm-b01", slot_name: "B-01", state: "En maniobra", confidence: 0.88, iou_ratio: 0.36, vehicle_type: "car" },
      { polygon_id: "poly-itm-b02", slot_name: "B-02", state: "Libre", confidence: 0.95, iou_ratio: 0.05, vehicle_type: null },
      { polygon_id: "poly-itm-b03", slot_name: "B-03", state: "Ocupado", confidence: 0.93, iou_ratio: 0.74, vehicle_type: "motorcycle" },
      { polygon_id: "poly-itm-b04", slot_name: "B-04", state: "Libre", confidence: 0.98, iou_ratio: 0.01, vehicle_type: null },
      { polygon_id: "poly-itm-001", slot_name: "C-01", state: "En maniobra", confidence: 0.89, iou_ratio: 0.38, vehicle_type: "car" },
      { polygon_id: "poly-itm-002", slot_name: "C-02", state: "Ocupado", confidence: 0.95, iou_ratio: 0.84, vehicle_type: "car" },
      { polygon_id: "poly-itm-003", slot_name: "C-03", state: "Libre", confidence: 0.96, iou_ratio: 0.03, vehicle_type: null },
      { polygon_id: "poly-itm-004", slot_name: "C-04", state: "Ocupado", confidence: 0.92, iou_ratio: 0.79, vehicle_type: "car" },
    ],
  },
  {
    id: "ITM-CAMPUS1-EST-SUR",
    shortName: "Campus 1 • Sur",
    name: "Campus 1 — Estacionamiento Sur (Av. Tecnológico)",
    bays: ["Bloque D (Poniente)", "Bloque E (Oriente)"],
    defaultSlots: [
      { polygon_id: "poly-sur-d01", slot_name: "D-01", state: "Ocupado", confidence: 0.95, iou_ratio: 0.82, vehicle_type: "car" },
      { polygon_id: "poly-sur-d02", slot_name: "D-02", state: "Ocupado", confidence: 0.93, iou_ratio: 0.77, vehicle_type: "car" },
      { polygon_id: "poly-sur-d03", slot_name: "D-03", state: "Libre", confidence: 0.97, iou_ratio: 0.03, vehicle_type: null },
      { polygon_id: "poly-sur-d04", slot_name: "D-04", state: "En maniobra", confidence: 0.86, iou_ratio: 0.34, vehicle_type: "truck" },
      { polygon_id: "poly-sur-e01", slot_name: "E-01", state: "Libre", confidence: 0.96, iou_ratio: 0.04, vehicle_type: null },
      { polygon_id: "poly-sur-e02", slot_name: "E-02", state: "Ocupado", confidence: 0.91, iou_ratio: 0.75, vehicle_type: "motorcycle" },
      { polygon_id: "poly-sur-e03", slot_name: "E-03", state: "Libre", confidence: 0.98, iou_ratio: 0.02, vehicle_type: null },
      { polygon_id: "poly-sur-e04", slot_name: "E-04", state: "Libre", confidence: 0.95, iou_ratio: 0.05, vehicle_type: null },
    ],
  },
  {
    id: "ITM-CAMPUS2-EST-CENTRAL",
    shortName: "Campus 2 • Central",
    name: "Campus 2 — Estacionamiento Central",
    bays: ["Bloque N (Poniente)", "Bloque S (Oriente)"],
    defaultSlots: [
      { polygon_id: "poly-c2-n01", slot_name: "N-01", state: "Libre", confidence: 0.97, iou_ratio: 0.02, vehicle_type: null },
      { polygon_id: "poly-c2-n02", slot_name: "N-02", state: "Libre", confidence: 0.96, iou_ratio: 0.04, vehicle_type: null },
      { polygon_id: "poly-c2-n03", slot_name: "N-03", state: "Ocupado", confidence: 0.92, iou_ratio: 0.79, vehicle_type: "car" },
      { polygon_id: "poly-c2-n04", slot_name: "N-04", state: "Libre", confidence: 0.98, iou_ratio: 0.01, vehicle_type: null },
      { polygon_id: "poly-c2-s01", slot_name: "S-01", state: "En maniobra", confidence: 0.87, iou_ratio: 0.31, vehicle_type: "car" },
      { polygon_id: "poly-c2-s02", slot_name: "S-02", state: "Ocupado", confidence: 0.94, iou_ratio: 0.83, vehicle_type: "bus" },
      { polygon_id: "poly-c2-s03", slot_name: "S-03", state: "Libre", confidence: 0.95, iou_ratio: 0.06, vehicle_type: null },
      { polygon_id: "poly-c2-s04", slot_name: "S-04", state: "Libre", confidence: 0.97, iou_ratio: 0.02, vehicle_type: null },
    ],
  },
];

/**
 * Distribuye los cajones en 2 bloques laterales (A a la izquierda, B a la derecha)
 * separados por el carril central vertical (Regla 5).
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
 * Vista superior cenital de automóvil en gris para cajones ocupados (Regla 5).
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

  const selectedSlot =
    polygons.find((item) => item.polygon_id === activeSelectedId) ||
    polygons[0] ||
    null;

  const rowsCount = Math.max(1, Math.ceil(polygons.length / 2));
  const svgHeight = Math.max(320, 54 + rowsCount * 82 + 28);

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
            ✓ Libre (Código)
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: STATE_BADGE_COLORS["En maniobra"] }}
            />
            ◐ En maniobra
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-swatch"
              style={{ backgroundColor: STATE_BADGE_COLORS.Ocupado }}
            />
            ✕ Ocupado (Auto)
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

          {/* Regla 5: Carril central de entrada con flechas punteadas */}
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
            fontSize="10"
            fontWeight="700"
          >
            ENTRADA ITM
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
          {/* Puntas de flecha en el carril central */}
          <path
            d="M264 90 L270 100 L276 90 M264 190 L270 200 L276 190 M264 290 L270 300 L276 290"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

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

            return (
              <g
                key={slot.polygon_id}
                className="pf-slot-group"
                role="button"
                tabIndex={0}
                aria-label={`Cajón ${slot.slot_name}, estado ${slot.state}, confianza ${Math.round(
                  (slot.confidence || 0) * 100
                )} por ciento`}
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
                {/* Superficie del cajón (Regla 5: seleccionado con borde 2px en --accent-text y fondo --accent-soft) */}
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

                {/* Contenido visual según estado (Regla 5) */}
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
                      fill="#dc2626"
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
                      fill="#d97706"
                      fontSize="11"
                      fontWeight="700"
                    >
                      ◐ EN MANIOBRA ({Math.round((slot.iou_ratio || 0) * 100)}%)
                    </text>
                  </>
                ) : (
                  <>
                    {/* Regla 5: Cajones libres muestran su código claramente */}
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
                      fill="#16a34a"
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

      {/* Tarjeta inferior de detalle del cajón seleccionado */}
      {selectedSlot && (
        <article
          className="pf-detail-sheet"
          role="region"
          aria-live="polite"
          aria-label={`Detalle del cajón ${selectedSlot.slot_name}`}
          data-slot-state={selectedSlot.state}
        >
          <div className="pf-detail-header">
            <div>
              <h3 className="pf-detail-title">
                Cajón {selectedSlot.slot_name}{" "}
                <small style={{ fontWeight: 500, color: "var(--text-muted)" }}>
                  ({selectedSlot.polygon_id})
                </small>
              </h3>
            </div>
            <span
              className="pf-state-pill"
              style={{
                backgroundColor:
                  STATE_BADGE_COLORS[selectedSlot.state] || "#64748b",
              }}
            >
              {(STATE_CONFIG[selectedSlot.state] || {}).icon || "•"}{" "}
              {selectedSlot.state}
            </span>
          </div>

          <div className="pf-detail-grid">
            <div className="pf-detail-item">
              <strong>Tipo de vehículo</strong>
              <span>
                {selectedSlot.vehicle_type
                  ? VEHICLE_LABELS[selectedSlot.vehicle_type] ||
                    selectedSlot.vehicle_type
                  : "Sin vehículo (null)"}
              </span>
            </div>
            <div className="pf-detail-item">
              <strong>Estado reportado</strong>
              <span>{selectedSlot.state}</span>
            </div>
            <div className="pf-detail-item">
              <strong>Intersección (IoU)</strong>
              <span>{(selectedSlot.iou_ratio * 100).toFixed(1)}%</span>
            </div>
            <div className="pf-detail-item">
              <strong>Confianza YOLO</strong>
              <span>{(selectedSlot.confidence * 100).toFixed(1)}%</span>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}

export const ParkingSvgMap = ParkingGrid;
