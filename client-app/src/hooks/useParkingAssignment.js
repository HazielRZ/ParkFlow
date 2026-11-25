/**
 * Hook de ciclo de vida de asignación temporal (15 min), cuenta regresiva real,
 * sincronización en vivo con cámaras y controles de simulación en modo demo.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeZoneCounts } from "../data/campusLots.js";
import {
  buildGuidanceRoute,
  computeRemainingMs,
  evaluateAssignmentSync,
  findSpotInLots,
  formatCountdown,
  getCountdownUrgency,
} from "../utils/assignmentLogic.js";
import {
  cancelParkingAssignment,
  clearActiveAssignment,
  confirmAssignmentArrival,
  expireParkingAssignment,
  loadActiveAssignment,
  reassignParkingSpot,
  requestParkingSpot,
  saveActiveAssignment,
} from "../services/parkingAssignmentService.js";

export function applyDemoOccupiedOverrides(lots = [], overridePolygonIds = []) {
  if (!Array.isArray(lots) || !Array.isArray(overridePolygonIds) || overridePolygonIds.length === 0) {
    return lots;
  }
  const overrideSet = new Set(overridePolygonIds.filter(Boolean));
  if (overrideSet.size === 0) {
    return lots;
  }

  return lots.map((lot) => ({
    ...lot,
    zones: (lot.zones || []).map((zone) => {
      let modified = false;
      const nextSpots = (zone.spots || []).map((spot) => {
        if (spot && overrideSet.has(spot.polygon_id) && spot.state !== "Ocupado") {
          modified = true;
          return {
            ...spot,
            state: "Ocupado",
            vehicle_type: spot.vehicle_type || "car",
            iou_ratio: 0.86,
            confidence: 0.96,
          };
        }
        return spot;
      });
      if (!modified) {
        return zone;
      }
      return {
        ...zone,
        spots: nextSpots,
        ...computeZoneCounts(nextSpots),
      };
    }),
  }));
}

export function useParkingAssignment({ lots = [], connected = false } = {}) {
  const [assignment, setAssignment] = useState(() => loadActiveAssignment());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isRequesting, setIsRequesting] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [demoOccupiedOverrides, setDemoOccupiedOverrides] = useState([]);

  useEffect(() => {
    if (connected) {
      setDemoOccupiedOverrides([]);
    }
  }, [connected]);

  useEffect(() => {
    if (!assignment || assignment.status !== "active") {
      return undefined;
    }
    setNowMs(Date.now());
    const intervalId = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [assignment?.assignment_id, assignment?.status, assignment?.expires_at]);

  useEffect(() => {
    if (!assignment || assignment.status !== "active") {
      return;
    }
    if (computeRemainingMs(assignment, nowMs) <= 0) {
      const expired = expireParkingAssignment(assignment, { nowMs });
      setAssignment(expired);
    }
  }, [assignment, nowMs]);

  const effectiveLots = useMemo(() => {
    if (connected || demoOccupiedOverrides.length === 0) {
      return lots;
    }
    return applyDemoOccupiedOverrides(lots, demoOccupiedOverrides);
  }, [lots, connected, demoOccupiedOverrides]);

  const spotMatch = useMemo(() => {
    if (!assignment?.polygon_id) {
      return null;
    }
    return findSpotInLots(
      effectiveLots,
      assignment.polygon_id,
      assignment.parking_lot_id
    );
  }, [effectiveLots, assignment]);

  const sync = useMemo(
    () =>
      evaluateAssignmentSync(assignment, spotMatch?.spot || null, nowMs),
    [assignment, spotMatch, nowMs]
  );

  const urgency = useMemo(
    () => getCountdownUrgency(sync.remainingMs),
    [sync.remainingMs]
  );

  const formattedTime = useMemo(
    () => formatCountdown(sync.remainingMs),
    [sync.remainingMs]
  );

  const route = useMemo(() => {
    if (!assignment) {
      return null;
    }
    const fallbackLot = {
      id: assignment.parking_lot_id,
      name: assignment.lot_name,
      shortName: assignment.lot_short_name,
    };
    const fallbackZone = {
      id: assignment.zone_id,
      name: assignment.zone_name,
      landmark: assignment.zone_landmark,
    };
    const fallbackSpot = {
      polygon_id: assignment.polygon_id,
      slot_name: assignment.slot_name,
    };

    return buildGuidanceRoute({
      lot: spotMatch?.lot || fallbackLot,
      zone: spotMatch?.zone || fallbackZone,
      spot: spotMatch?.spot || fallbackSpot,
      spotIndex:
        spotMatch !== null ? spotMatch.spotIndex : assignment.spot_index || 0,
    });
  }, [assignment, spotMatch]);

  const requestSpot = useCallback(
    async ({ preferredLotId = null, userRole = "student" } = {}) => {
      setIsRequesting(true);
      setAssignmentError("");
      try {
        const result = await requestParkingSpot({
          lots: effectiveLots,
          preferredLotId,
          userRole,
        });
        if (!result.ok) {
          setAssignmentError(
            "No hay cajones libres disponibles para tu rol en este momento."
          );
          return result;
        }
        setNowMs(Date.now());
        setAssignment(result.assignment);
        return result;
      } finally {
        setIsRequesting(false);
      }
    },
    [effectiveLots]
  );

  const reassignSpot = useCallback(
    async ({ userRole } = {}) => {
      if (!assignment) {
        return { ok: false, reason: "NO_ASSIGNMENT" };
      }
      setIsRequesting(true);
      setAssignmentError("");
      try {
        const result = await reassignParkingSpot({
          currentAssignment: assignment,
          lots: effectiveLots,
          userRole,
        });
        if (!result.ok) {
          setAssignmentError(
            "No quedan otros cajones libres disponibles para reasignar."
          );
          return result;
        }
        setNowMs(Date.now());
        setAssignment(result.assignment);
        return result;
      } finally {
        setIsRequesting(false);
      }
    },
    [assignment, effectiveLots]
  );

  const confirmArrival = useCallback(async () => {
    if (!assignment) {
      return null;
    }
    const arrived = await confirmAssignmentArrival(assignment);
    setAssignmentError("");
    setAssignment(arrived);
    return arrived;
  }, [assignment]);

  const cancelAssignment = useCallback(async () => {
    await cancelParkingAssignment(assignment);
    setAssignment(null);
    setAssignmentError("");
    setDemoOccupiedOverrides([]);
  }, [assignment]);

  const dismissAssignment = useCallback(() => {
    clearActiveAssignment();
    setAssignment(null);
    setAssignmentError("");
    setDemoOccupiedOverrides([]);
  }, []);

  const simulateShortTimer = useCallback(
    (seconds = 10) => {
      if (!assignment || assignment.status !== "active") {
        return null;
      }
      const now = Date.now();
      const updated = {
        ...assignment,
        expires_at: new Date(now + seconds * 1000).toISOString(),
      };
      saveActiveAssignment(updated);
      setNowMs(now);
      setAssignment(updated);
      return updated;
    },
    [assignment]
  );

  const simulateExternalOccupancy = useCallback(() => {
    if (!assignment?.polygon_id) {
      return;
    }
    setDemoOccupiedOverrides((prev) =>
      prev.includes(assignment.polygon_id)
        ? prev
        : [...prev, assignment.polygon_id]
    );
  }, [assignment?.polygon_id]);

  const clearDemoOverrides = useCallback(() => {
    setDemoOccupiedOverrides([]);
  }, []);

  return {
    effectiveLots,
    assignment,
    assignedLot: spotMatch?.lot || null,
    assignedZone: spotMatch?.zone || null,
    liveSpot: spotMatch?.spot || null,
    effectiveStatus: sync.effectiveStatus,
    remainingMs: sync.remainingMs,
    progressRatio: sync.progressRatio,
    urgency,
    formattedTime,
    conflict: sync.conflict,
    maneuvering: sync.maneuvering,
    route,
    isRequesting,
    assignmentError,
    demoOccupiedOverrides,
    requestSpot,
    reassignSpot,
    confirmArrival,
    cancelAssignment,
    dismissAssignment,
    simulateShortTimer,
    simulateExternalOccupancy,
    clearDemoOverrides,
  };
}
