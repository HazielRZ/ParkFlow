/**
 * Vista principal de disponibilidad en tiempo real (RF-01 / RF-04 / RNF-05).
 */

import { ParkingGrid } from "../components/ParkingGrid.jsx";
import { useParkingSocket } from "../hooks/useParkingSocket.js";

export function DashboardView({ wsUrl }) {
  const { parkingLotId, polygons, metrics, connected } = useParkingSocket(wsUrl);

  return (
    <main>
      <header>
        <h1>ParkFlow — Monitoreo en Tiempo Real ({parkingLotId})</h1>
        <p>Estado de conexión: {connected ? "En línea" : "Reconectando..."}</p>
      </header>
      {metrics.high_occupancy_alert && (
        <div role="alert">
          Alerta RF-04: Ocupación superior al 90% de capacidad en {parkingLotId}.
        </div>
      )}
      <section>
        <p>
          Libres: {metrics.free} | En maniobra: {metrics.in_maneuver} | Ocupados:{" "}
          {metrics.occupied}
        </p>
      </section>
      <ParkingGrid polygons={polygons} />
    </main>
  );
}
