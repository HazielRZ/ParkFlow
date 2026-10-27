/**
 * Componente visualizador de cajones por estado (Libre, En maniobra, Ocupado).
 */

const STATE_BADGE_COLORS = {
  Libre: "#16a34a",
  "En maniobra": "#d97706",
  Ocupado: "#dc2626",
};

export function ParkingGrid({ polygons = [] }) {
  return (
    <section aria-label="Mapa de Cajones de Estacionamiento">
      {polygons.map((slot) => (
        <article
          key={slot.polygon_id}
          data-slot-state={slot.state}
          style={{
            borderLeft: `6px solid ${STATE_BADGE_COLORS[slot.state] || "#64748b"}`,
            padding: "0.75rem",
            marginBottom: "0.5rem",
          }}
        >
          <strong>{slot.slot_name}</strong> — <span>{slot.state}</span>
          <small style={{ display: "block" }}>
            IoU: {(slot.iou_ratio * 100).toFixed(0)}% | Confianza:{" "}
            {(slot.confidence * 100).toFixed(0)}%
          </small>
        </article>
      ))}
    </section>
  );
}
