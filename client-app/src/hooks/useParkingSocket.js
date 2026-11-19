/**
 * Hook de suscripción en tiempo real al Gateway WebSocket de `/api-backend` (PF-19).
 * Cumple con el aislamiento de capas RNF-05 (sin importar código de backend o cv-service)
 * y con el contrato INT-SW-01 / INT-UI-01.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import { useEffect, useRef, useState } from "react";

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;
const SATURATION_THRESHOLD = 0.9;

export function resolveDefaultWsUrl(explicitUrl) {
  if (explicitUrl) {
    return explicitUrl;
  }
  const envUrl =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_WS_URL || import.meta.env.VITE_BACKEND_WS_URL
      : undefined;
  if (envUrl) {
    return envUrl;
  }
  if (typeof window !== "undefined" && window.location?.hostname) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.hostname}:8000/ws/parking-states`;
  }
  return "ws://localhost:8000/ws/parking-states";
}

export function computeMetricsFromPolygons(polygons = [], serverMetrics = null) {
  const totalFromPolygons = polygons.length;
  const free = polygons.filter((p) => p.state === "Libre").length;
  const occupied = polygons.filter((p) => p.state === "Ocupado").length;
  const inManeuver = polygons.filter((p) => p.state === "En maniobra").length;

  const totalSlots =
    serverMetrics && typeof serverMetrics.total_slots === "number"
      ? Math.max(serverMetrics.total_slots, totalFromPolygons)
      : totalFromPolygons;

  const occupancyRatio =
    totalSlots > 0 ? Number((occupied / totalSlots).toFixed(4)) : 0;
  const highOccupancyAlert =
    Boolean(serverMetrics?.high_occupancy_alert) ||
    occupancyRatio >= SATURATION_THRESHOLD;

  return {
    total_slots: totalSlots,
    free,
    occupied,
    in_maneuver: inManeuver,
    occupancy_ratio: occupancyRatio,
    high_occupancy_alert: highOccupancyAlert,
  };
}

export function mergePolygonsById(existingPolygons = [], incomingPolygons = []) {
  if (!Array.isArray(incomingPolygons) || incomingPolygons.length === 0) {
    return existingPolygons;
  }
  const mapById = new Map(
    existingPolygons.map((poly) => [poly.polygon_id, poly])
  );
  for (const incoming of incomingPolygons) {
    if (incoming && incoming.polygon_id) {
      const prev = mapById.get(incoming.polygon_id) || {};
      mapById.set(incoming.polygon_id, { ...prev, ...incoming });
    }
  }
  return Array.from(mapById.values());
}

export function useParkingSocket(wsUrl) {
  const resolvedUrl = resolveDefaultWsUrl(wsUrl);
  const [parkingState, setParkingState] = useState(() => ({
    parkingLotId: "ITM-CAMPUS1-EST-NORTE",
    polygons: [],
    polygonsByLot: {},
    metrics: computeMetricsFromPolygons([]),
    connected: false,
    reconnecting: false,
    attempt: 0,
    lastUpdated: null,
    wsUrl: resolvedUrl,
  }));

  const reconnectTimerRef = useRef(null);
  const socketRef = useRef(null);
  const attemptRef = useRef(0);

  useEffect(() => {
    let isUnmounted = false;

    function clearReconnectTimer() {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function scheduleReconnect() {
      if (isUnmounted) {
        return;
      }
      clearReconnectTimer();
      const nextAttempt = attemptRef.current + 1;
      attemptRef.current = nextAttempt;
      const delay = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, nextAttempt - 1),
        MAX_BACKOFF_MS
      );

      setParkingState((prev) => ({
        ...prev,
        connected: false,
        reconnecting: true,
        attempt: nextAttempt,
      }));

      reconnectTimerRef.current = setTimeout(() => {
        if (!isUnmounted) {
          connectSocket();
        }
      }, delay);
    }

    function connectSocket() {
      if (isUnmounted || typeof WebSocket === "undefined") {
        return;
      }

      let socket;
      try {
        socket = new WebSocket(resolvedUrl);
        socketRef.current = socket;
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (isUnmounted) {
          return;
        }
        clearReconnectTimer();
        attemptRef.current = 0;
        setParkingState((prev) => ({
          ...prev,
          connected: true,
          reconnecting: false,
          attempt: 0,
        }));
      };

      socket.onmessage = (event) => {
        if (isUnmounted) {
          return;
        }
        try {
          const payload = JSON.parse(event.data);
          if (payload.event === "parking_state_updated") {
            const lotId = payload.parking_lot_id || "ITM-CAMPUS1-EST-NORTE";
            const rawPolygons = Array.isArray(payload.polygons)
              ? payload.polygons
              : [];
            const incomingPolygons = rawPolygons.map((poly) =>
              poly && payload.camera_id && !poly.camera_id
                ? { ...poly, camera_id: payload.camera_id }
                : poly
            );

            setParkingState((prev) => {
              const previousLotPolygons = prev.polygonsByLot[lotId] || [];
              const mergedPolygons = mergePolygonsById(
                previousLotPolygons,
                incomingPolygons
              );
              const nextByLot = {
                ...prev.polygonsByLot,
                [lotId]: mergedPolygons,
              };
              const metrics = computeMetricsFromPolygons(
                mergedPolygons,
                payload.metrics
              );

              return {
                ...prev,
                parkingLotId: lotId,
                polygons: mergedPolygons,
                polygonsByLot: nextByLot,
                metrics,
                connected: true,
                reconnecting: false,
                attempt: 0,
                lastUpdated: payload.timestamp || new Date().toISOString(),
              };
            });
          }
        } catch {
          // Ignorar tramas no conformes con el contrato INT-SW-01
        }
      };

      socket.onerror = () => {
        if (!isUnmounted && socket.readyState !== WebSocket.OPEN) {
          try {
            socket.close();
          } catch {
            // Ignorar error al cerrar socket fallido
          }
        }
      };

      socket.onclose = () => {
        if (!isUnmounted) {
          scheduleReconnect();
        }
      };
    }

    connectSocket();

    return () => {
      isUnmounted = true;
      clearReconnectTimer();
      if (socketRef.current) {
        try {
          socketRef.current.onclose = null;
          socketRef.current.close();
        } catch {
          // Ignorar error en limpieza
        }
        socketRef.current = null;
      }
    };
  }, [resolvedUrl]);

  return parkingState;
}
