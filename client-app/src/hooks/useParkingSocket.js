/**
 * Hook de suscripción en tiempo real al Gateway WebSocket de `/api-backend`.
 * Cumple con el aislamiento de capas RNF-05 (sin importar código de backend o cv-service).
 */

import { useEffect, useState } from "react";

export function useParkingSocket(wsUrl = "ws://localhost:8000/ws/parking-states") {
  const [parkingState, setParkingState] = useState({
    parkingLotId: "ITM-CAMPUS1-EST-NORTE",
    polygons: [],
    metrics: {
      total_slots: 0,
      free: 0,
      occupied: 0,
      in_maneuver: 0,
      occupancy_ratio: 0,
      high_occupancy_alert: false,
    },
    connected: false,
  });

  useEffect(() => {
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setParkingState((prev) => ({ ...prev, connected: true }));
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.event === "parking_state_updated") {
          setParkingState({
            parkingLotId: payload.parking_lot_id,
            polygons: payload.polygons || [],
            metrics: payload.metrics || prevMetricsFallback(),
            connected: true,
          });
        }
      } catch {
        // Ignorar tramas no conformes
      }
    };

    socket.onclose = () => {
      setParkingState((prev) => ({ ...prev, connected: false }));
    };

    return () => {
      socket.close();
    };
  }, [wsUrl]);

  return parkingState;
}

function prevMetricsFallback() {
  return {
    total_slots: 0,
    free: 0,
    occupied: 0,
    in_maneuver: 0,
    occupancy_ratio: 0,
    high_occupancy_alert: false,
  };
}
