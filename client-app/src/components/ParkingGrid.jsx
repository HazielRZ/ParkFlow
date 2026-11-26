/**
 * Mapa arquitectónico Nivel 3 (Micro — Croquis detallado de 1 zona con 12–16 cajones).
 * Cajones en bloques A y B abiertos hacia el pasillo central (style-agents.md §4.5):
 * - Bloque A (izq.): border-right: none
 * - Bloque B (der.): border-left: none
 * - Sin textos repetitivos "✓ LIBRE" ni "✕ OCUPADO"
 * - Chevrons animados en el pasillo central hasta la fila del cajón seleccionado/reservado
 * - Barra flotante contextual sobre la navbar para Reservar / Confirmar / Liberar
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React, { useState } from "react";
import { CAMPUS_ZONES } from "../data/campusLots.js";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  NavigationIcon,
  TopDownCarSvg,
  XIcon,
} from "./Icons.jsx";

export { CAMPUS_ZONES };

export const STATE_BADGE_COLORS = {
  Libre: "var(--free)",
  "En maniobra": "var(--maneuver)",
  Ocupado: "var(--occupied)",
};

export const STATE_CONFIG = {
  Libre: {
    color: "var(--free)",
    shortLabel: "Libre",
    dashArray: "none",
  },
  "En maniobra": {
    color: "var(--maneuver)",
    shortLabel: "Maniobra",
    dashArray: "5 4",
  },
  Ocupado: {
    color: "var(--occupied)",
    shortLabel: "Ocupado",
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
 * Conserva la geometría exportada para consumidores externos/pruebas.
 */
export function computeCentralLaneSlotGeometry(index) {
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

export function ParkingGrid({
  polygons = [],
  stateFilter = "Todos",
  selectedPolygonId: controlledSelectedId,
  onSelectSlot,
  zoneName = "Mapa de Cajones de Estacionamiento",
  laneLabel = "ENTRADA ITM",
  cameraId = null,
  technicalMode = false,
  assignedPolygonId = null,
  showGuidancePath = false,
  assignmentConflict = false,
  assignment = null,
  effectiveStatus = null,
  formattedTime = "15:00",
  isStaffRestricted = false,
  isRequesting = false,
  showContextBar = true,
  onReserveSlot,
  onConfirmArrival,
  onReleaseAssignment,
  onOpenGuidance,
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

  const assignedIndex = assignedPolygonId
    ? polygons.findIndex((item) => item.polygon_id === assignedPolygonId)
    : -1;
  const selectedIndex = activeSelectedId
    ? polygons.findIndex((item) => item.polygon_id === activeSelectedId)
    : -1;

  // Prioridad de guiado en el pasillo: cajón seleccionado en el croquis, o cajón reservado en esta zona
  const activeFocusIndex =
    selectedIndex >= 0 ? selectedIndex : assignedIndex >= 0 ? assignedIndex : -1;
  const targetRow = activeFocusIndex >= 0 ? Math.floor(activeFocusIndex / 2) : -1;
  const targetIsRightBlock = activeFocusIndex >= 0 ? activeFocusIndex % 2 === 1 : false;

  const rowsCount = Math.max(1, Math.ceil(polygons.length / 2));
  const rows = Array.from({ length: rowsCount }, (_, rowIdx) => ({
    rowIdx,
    leftSlot: polygons[rowIdx * 2] || null,
    rightSlot: polygons[rowIdx * 2 + 1] || null,
  }));

  const hasAssignedInZone = assignedIndex >= 0;
  const assignedSlotInZone = hasAssignedInZone ? polygons[assignedIndex] : null;
  const isSelectingAssigned = Boolean(
    explicitSlot && assignedPolygonId && explicitSlot.polygon_id === assignedPolygonId
  );

  // Barra contextual sobre la navbar cuando hay selección o reserva activa en esta zona
  const shouldShowContextBar =
    showContextBar &&
    (Boolean(explicitSlot) ||
      (hasAssignedInZone &&
        assignment &&
        (effectiveStatus === "active" ||
          effectiveStatus === "conflict" ||
          effectiveStatus === "arrived")));

  const renderBay = (slot, isRightBlock, rowIdx) => {
    if (!slot) {
      return <div className="pf-bay-placeholder" aria-hidden="true" />;
    }

    const isAssigned = Boolean(
      assignedPolygonId && slot.polygon_id === assignedPolygonId
    );
    const isAssignedConflict = isAssigned && assignmentConflict;
    const isSelected = activeSelectedId === slot.polygon_id;
    const matchesFilter =
      stateFilter === "Todos" || slot.state === stateFilter || isAssigned;

    const bayVisualState = isAssignedConflict
      ? "conflict"
      : isAssigned
        ? "assigned"
        : slot.state === "Ocupado"
          ? "occupied"
          : slot.state === "En maniobra"
            ? "maneuver"
            : "free";

    const ariaDetail = technicalMode
      ? `, confianza ${Math.round((slot.confidence || 0) * 100)} por ciento`
      : "";
    const ariaAssigned = isAssigned ? ", tu cajón asignado" : "";

    return (
      <button
        key={slot.polygon_id}
        type="button"
        className="pf-bay"
        data-block={isRightBlock ? "B" : "A"}
        data-state={bayVisualState}
        data-selected={String(isSelected)}
        data-assigned={isAssigned ? "true" : undefined}
        data-dimmed={String(!matchesFilter)}
        data-polygon-id={slot.polygon_id}
        aria-label={`Cajón ${slot.slot_name}, Bloque ${isRightBlock ? "B" : "A"} fila ${rowIdx + 1}, estado ${slot.state}${ariaAssigned}${ariaDetail}`}
        aria-pressed={isSelected}
        onClick={() => handleSelect(slot)}
      >
        {isAssigned && !isAssignedConflict ? (
          <div className="pf-bay-assigned-content">
            <span className="pf-bay-code tabular-nums">{slot.slot_name}</span>
            <span className="pf-bay-assigned-tag">
              <NavigationIcon size={10} />
              <span>
                {effectiveStatus === "arrived"
                  ? "Estacionado"
                  : slot.state === "En maniobra"
                    ? "Tu lugar · Maniobra"
                    : "Tu lugar"}
              </span>
            </span>
          </div>
        ) : isAssignedConflict ? (
          <div className="pf-bay-assigned-content">
            {slot.state === "Ocupado" && (
              <TopDownCarSvg facing={isRightBlock ? "left" : "right"} />
            )}
            <span className="pf-bay-code-corner tabular-nums">
              {slot.slot_name}
            </span>
            <span className="pf-bay-conflict-tag">
              <AlertTriangleIcon size={10} />
              <span>Conflicto</span>
            </span>
          </div>
        ) : slot.state === "Ocupado" ? (
          <div className="pf-bay-occupied-content">
            <TopDownCarSvg facing={isRightBlock ? "left" : "right"} />
            <span className="pf-bay-code-corner tabular-nums">
              {slot.slot_name}
            </span>
          </div>
        ) : slot.state === "En maniobra" ? (
          <div className="pf-bay-maneuver-content">
            <span className="pf-bay-code tabular-nums">{slot.slot_name}</span>
            <span className="pf-bay-maneuver-badge">
              <span className="pf-legend-dot pf-dot-maneuver" />
              <span>
                {technicalMode
                  ? `Maniobra ${Math.round((slot.iou_ratio || 0) * 100)}%`
                  : "Maniobra"}
              </span>
            </span>
          </div>
        ) : (
          <span className="pf-bay-code pf-bay-code-free tabular-nums">
            {slot.slot_name}
          </span>
        )}
      </button>
    );
  };

  return (
    <section
      className="pf-croquis-card"
      aria-label="Croquis de cajones de estacionamiento"
    >
      <div className="pf-map-header">
        <div className="pf-map-title-wrap">
          <h2 className="pf-map-title">{zoneName}</h2>
        </div>

        {/* Leyenda simplificada: solo punto 6px + etiqueta */}
        <div className="pf-legend" aria-label="Leyenda de estados">
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--free)" }}
            />
            <span>Libre</span>
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--maneuver)" }}
            />
            <span>Maniobra</span>
          </span>
          <span className="pf-legend-item">
            <span
              className="pf-legend-dot"
              style={{ backgroundColor: "var(--occupied)" }}
            />
            <span>Ocupado</span>
          </span>
        </div>
      </div>

      {/* Tablero arquitectónico del croquis (border-radius 24px) */}
      <div
        className="pf-croquis-board"
        role="region"
        aria-label={`Croquis interactivo de ${zoneName}`}
      >
        <div className="pf-croquis-col-headers" aria-hidden="true">
          <span className="pf-croquis-block-label">Bloque A</span>
          <span className="pf-croquis-lane-label">{laneLabel}</span>
          <span className="pf-croquis-block-label">Bloque B</span>
        </div>

        <div className="pf-croquis-grid-body">
          {/* Carril central continuo de fondo */}
          <div className="pf-croquis-lane-backdrop" aria-hidden="true">
            <span className="pf-croquis-lane-line" />
          </div>

          {rows.map(({ rowIdx, leftSlot, rightSlot }) => {
            const isGuidedRow = targetRow >= 0 && rowIdx <= targetRow;
            const isDestinationRow = targetRow >= 0 && rowIdx === targetRow;
            const chevronGuided =
              isGuidedRow && (selectedIndex >= 0 || showGuidancePath || hasAssignedInZone);
            const isConflictPath =
              assignmentConflict &&
              hasAssignedInZone &&
              selectedIndex < 0;

            return (
              <div key={rowIdx} className="pf-croquis-row">
                <div className="pf-croquis-cell pf-croquis-cell-left">
                  {renderBay(leftSlot, false, rowIdx)}
                </div>

                <div
                  className="pf-croquis-lane-cell"
                  data-guided={String(chevronGuided)}
                  data-destination={String(isDestinationRow)}
                  data-conflict={String(Boolean(isConflictPath))}
                  aria-hidden="true"
                >
                  {isDestinationRow ? (
                    <span
                      className="pf-lane-turn-indicator"
                      data-direction={targetIsRightBlock ? "right" : "left"}
                      data-conflict={String(Boolean(isConflictPath))}
                    >
                      {targetIsRightBlock ? (
                        <ArrowRightIcon size={16} strokeWidth={2.3} />
                      ) : (
                        <ArrowLeftIcon size={16} strokeWidth={2.3} />
                      )}
                    </span>
                  ) : (
                    <span
                      className="pf-lane-chevron"
                      style={
                        chevronGuided
                          ? { animationDelay: `${rowIdx * 110}ms` }
                          : undefined
                      }
                    >
                      <ChevronDownIcon size={16} strokeWidth={2.2} />
                    </span>
                  )}
                </div>

                <div className="pf-croquis-cell pf-croquis-cell-right">
                  {renderBay(rightSlot, true, rowIdx)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                <small className="pf-detail-id">
                  ({technicalSlot.polygon_id})
                </small>
              </h3>
              {cameraId && (
                <small className="pf-detail-cam">Cámara: {cameraId}</small>
              )}
            </div>
            <span
              className="pf-state-pill"
              data-state={technicalSlot.state}
            >
              <span
                className="pf-legend-dot"
                style={{
                  backgroundColor:
                    STATE_BADGE_COLORS[technicalSlot.state] || "var(--text-muted)",
                }}
              />
              <span>{technicalSlot.state}</span>
            </span>
          </div>

          <div className="pf-detail-grid">
            <div className="pf-detail-item">
              <strong>Vehículo</strong>
              <span>
                {technicalSlot.vehicle_type
                  ? VEHICLE_LABELS[technicalSlot.vehicle_type] ||
                    technicalSlot.vehicle_type
                  : "Sin vehículo (null)"}
              </span>
            </div>
            <div className="pf-detail-item">
              <strong>Estado</strong>
              <span>{technicalSlot.state}</span>
            </div>
            <div className="pf-detail-item">
              <strong>Intersección (IoU)</strong>
              <span className="tabular-nums">
                {((technicalSlot.iou_ratio || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="pf-detail-item">
              <strong>Confianza YOLO</strong>
              <span className="tabular-nums">
                {((technicalSlot.confidence || 0) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </article>
      )}

      {/* Barra flotante contextual sobre la navbar (Reservar / Confirmar / Liberar) */}
      {shouldShowContextBar && (
        <div
          className="pf-context-bar-wrapper"
          role="region"
          aria-live="polite"
          aria-label="Acción rápida sobre cajón"
        >
          <div
            key={
              isSelectingAssigned || (!explicitSlot && hasAssignedInZone)
                ? "reserved"
                : `selected-${explicitSlot?.polygon_id || "none"}`
            }
            className="pf-context-bar"
            data-mode={
              isSelectingAssigned || (!explicitSlot && hasAssignedInZone)
                ? "reserved"
                : "selected"
            }
          >
            {(isSelectingAssigned || (!explicitSlot && hasAssignedInZone)) &&
            assignment ? (
              <>
                <div className="pf-context-info">
                  <span className="pf-context-eyebrow">
                    {effectiveStatus === "conflict" ? (
                      <>
                        <AlertTriangleIcon size={12} />
                        <span>Conflicto en {assignment.slot_name}</span>
                      </>
                    ) : effectiveStatus === "arrived" ? (
                      <>
                        <CheckIcon size={12} />
                        <span>Estacionado · {assignment.slot_name}</span>
                      </>
                    ) : (
                      <>
                        <ClockIcon size={12} />
                        <span className="tabular-nums">
                          {assignment.slot_name} · {formattedTime}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="pf-context-sub">
                    {assignment.zone_name}
                  </span>
                </div>

                <div className="pf-context-actions">
                  {effectiveStatus !== "arrived" && onConfirmArrival && (
                    <button
                      type="button"
                      className="pf-context-btn pf-context-btn-primary"
                      onClick={() => onConfirmArrival()}
                    >
                      <CheckIcon size={14} />
                      <span>Confirmar</span>
                    </button>
                  )}
                  {onReleaseAssignment && (
                    <button
                      type="button"
                      className="pf-context-btn pf-context-btn-ghost"
                      onClick={() => {
                        onReleaseAssignment();
                        handleClearSelection();
                      }}
                    >
                      <span>Liberar</span>
                    </button>
                  )}
                  {onOpenGuidance && (
                    <button
                      type="button"
                      className="pf-context-icon-btn"
                      onClick={() => onOpenGuidance()}
                      aria-label="Abrir vista de guía"
                      title="Abrir vista de guía"
                    >
                      <NavigationIcon size={15} />
                    </button>
                  )}
                </div>
              </>
            ) : explicitSlot ? (
              <>
                <div className="pf-context-info">
                  <span className="pf-context-eyebrow">
                    <span
                      className="pf-legend-dot"
                      style={{
                        backgroundColor:
                          STATE_BADGE_COLORS[explicitSlot.state] ||
                          "var(--text-muted)",
                      }}
                    />
                    <span>
                      {explicitSlot.state} · Bloque{" "}
                      {selectedIndex % 2 === 1 ? "B" : "A"} · Fila{" "}
                      {Math.floor(Math.max(0, selectedIndex) / 2) + 1}
                    </span>
                  </span>
                  <strong className="pf-context-title tabular-nums">
                    Cajón {explicitSlot.slot_name}
                  </strong>
                </div>

                <div className="pf-context-actions">
                  {explicitSlot.state === "Libre" && onReserveSlot && (
                    <button
                      type="button"
                      className="pf-context-btn pf-context-btn-primary"
                      disabled={isStaffRestricted || isRequesting}
                      onClick={() => onReserveSlot(explicitSlot)}
                    >
                      <NavigationIcon size={14} />
                      <span>
                        {isRequesting
                          ? "Reservando..."
                          : isStaffRestricted
                            ? "Solo personal"
                            : "Reservar (15 min)"}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="pf-context-icon-btn"
                    onClick={handleClearSelection}
                    aria-label="Cerrar selección de cajón"
                  >
                    <XIcon size={15} />
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export const ParkingSvgMap = ParkingGrid;
