/**
 * Mapa SVG interactivo y accesible de cajones por zona (PF-19 / INT-UI-01 / RF-01).
 * Soporta los tres estados discretos del contrato INT-SW-01:
 * - Libre (#16a34a)
 * - En maniobra (#d97706)
 * - Ocupado (#dc2626)
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
    fill: "#14532d",
    stroke: "#22c55e",
    icon: "✓",
    shortLabel: "LIBRE",
    dashArray: "none",
  },
  "En maniobra": {
    color: "#d97706",
    fill: "#78350f",
    stroke: "#f59e0b",
    icon: "◐",
    shortLabel: "MANIOBRA",
    dashArray: "6 4",
  },
  Ocupado: {
    color: "#dc2626",
    fill: "#7f1d1d",
    stroke: "#ef4444",
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
    bays: ["Bahía A (Norte)", "Bahía B (Central)", "Bahía C (Acceso Caseta)"],
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
    bays: ["Bahía D (Poniente)", "Bahía E (Oriente)"],
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
    bays: ["Bahía N (Norte)", "Bahía S (Sur)"],
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

function computeSlotGeometry(index, totalSlots) {
  const columns = 4;
  const row = Math.floor(index / columns);
  const col = index % columns;

  const slotWidth = 148;
  const slotHeight = 86;
  const colGap = 24;
  const startX = 56;

  // Distribución en bahías separadas por carril de circulación
  const rowYPositions = [42, 178, 314];
  const y = rowYPositions[row] !== undefined ? rowYPositions[row] : 42 + row * 128;
  const x = startX + col * (slotWidth + colGap);

  return { x, y, width: slotWidth, height: slotHeight, row, col, totalSlots };
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

  const rowsCount = Math.max(1, Math.ceil(polygons.length / 4));
  const svgHeight = Math.max(300, rowsCount * 136 + 36);

  return (
    <section
      className="pf-map-card"
      aria-label="Mapa de Cajones de Estacionamiento"
    >
      <div className="pf-map-header">
        <h2 className="pf-map-title">{zoneName}</h2>
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
            ◐ En maniobra
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
          viewBox={`0 0 760 ${svgHeight}`}
          role="img"
          aria-label={`Croquis interactivo de ${zoneName}`}
        >
          <defs>
            <pattern
              id="pf-maneuver-stripes"
              width="12"
              height="12"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="12"
                stroke="#f59e0b"
                strokeWidth="3"
                strokeOpacity="0.28"
              />
            </pattern>
          </defs>

          {/* Fondo del estacionamiento */}
          <rect
            x="8"
            y="8"
            width="744"
            height={svgHeight - 16}
            rx="14"
            fill="#0f172a"
            stroke="#334155"
            strokeWidth="2"
          />

          {/* Carriles de circulación vehicular */}
          <rect
            x="24"
            y="136"
            width="712"
            height="34"
            rx="6"
            fill="#1e293b"
          />
          <text
            x="380"
            y="158"
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="12"
            fontWeight="600"
          >
            ⟵ CARRIL DE CIRCULACIÓN VEHICULAR • ACCESO CASETA ITM ⟶
          </text>

          {rowsCount > 2 && (
            <>
              <rect
                x="24"
                y="272"
                width="712"
                height="34"
                rx="6"
                fill="#1e293b"
              />
              <text
                x="380"
                y="294"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="12"
                fontWeight="600"
              >
                ⟵ CARRIL DE SALIDA / FLUJO INTERNO ⟶
              </text>
            </>
          )}

          {/* Cajones de estacionamiento (polígonos) */}
          {polygons.map((slot, index) => {
            const geom = computeSlotGeometry(index, polygons.length);
            const cfg = STATE_CONFIG[slot.state] || {
              color: "#64748b",
              fill: "#1e293b",
              stroke: "#94a3b8",
              icon: "•",
              shortLabel: slot.state || "N/D",
              dashArray: "none",
            };
            const matchesFilter =
              stateFilter === "Todos" || slot.state === stateFilter;
            const isSelected = activeSelectedId === slot.polygon_id;

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
                <rect
                  x={geom.x}
                  y={geom.y}
                  width={geom.width}
                  height={geom.height}
                  rx="10"
                  fill={cfg.fill}
                  stroke={isSelected ? "#38bdf8" : cfg.stroke}
                  strokeWidth={isSelected ? "4" : "2.5"}
                  strokeDasharray={cfg.dashArray}
                />

                {slot.state === "En maniobra" && (
                  <rect
                    x={geom.x + 2}
                    y={geom.y + 2}
                    width={geom.width - 4}
                    height={geom.height - 4}
                    rx="8"
                    fill="url(#pf-maneuver-stripes)"
                  />
                )}

                {/* Franja superior de color de estado */}
                <rect
                  x={geom.x + 10}
                  y={geom.y + 8}
                  width={geom.width - 20}
                  height="22"
                  rx="6"
                  fill={cfg.color}
                />

                <text
                  x={geom.x + geom.width / 2}
                  y={geom.y + 23}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="800"
                >
                  {cfg.icon} {cfg.shortLabel}
                </text>

                {/* Etiqueta principal del cajón */}
                <text
                  x={geom.x + geom.width / 2}
                  y={geom.y + 54}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="20"
                  fontWeight="800"
                >
                  {slot.slot_name}
                </text>

                {/* Metadato rápido IoU / Confianza */}
                <text
                  x={geom.x + geom.width / 2}
                  y={geom.y + 74}
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="11"
                  fontWeight="600"
                >
                  IoU {(slot.iou_ratio * 100).toFixed(0)}% • Conf{" "}
                  {(slot.confidence * 100).toFixed(0)}%
                </text>
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
                <small style={{ fontWeight: 500, color: "#cbd5e1" }}>
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
