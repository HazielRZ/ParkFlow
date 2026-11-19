/**
 * Lógica pura de asignación temporal de cajones (15 min), sincronización en vivo
 * y generación de rutas internas paso a paso (Client-App / RNF-05 / INT-SW-01).
 * Sin dependencias externas ni de DOM para permitir pruebas unitarias directas.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

export const ASSIGNMENT_TTL_MS = 15 * 60 * 1000;
export const ASSIGNMENT_WARNING_MS = 3 * 60 * 1000;
export const ASSIGNMENT_CRITICAL_MS = 60 * 1000;

export function getEligibleLots(lots = [], userRole = "student") {
  if (!Array.isArray(lots)) {
    return [];
  }
  if (userRole === "staff") {
    return lots;
  }
  return lots.filter((lot) => lot && lot.access_type === "general");
}

function getZoneEligibleFreeSpots(zone, excludeSet) {
  const spots = Array.isArray(zone?.spots) ? zone.spots : [];
  const matches = [];
  for (let idx = 0; idx < spots.length; idx += 1) {
    const spot = spots[idx];
    if (
      spot &&
      spot.state === "Libre" &&
      spot.polygon_id &&
      !excludeSet.has(spot.polygon_id)
    ) {
      matches.push({ spot, idx });
    }
  }
  return matches;
}

function getLotEligibleFreeCount(lot, excludeSet) {
  const zones = Array.isArray(lot?.zones) ? lot.zones : [];
  let total = 0;
  for (const zone of zones) {
    total += getZoneEligibleFreeSpots(zone, excludeSet).length;
  }
  return total;
}

/**
 * Selecciona automáticamente el mejor cajón libre disponible según rol y preferencias.
 * Nunca asigna lotes `staff_only` si `userRole === "student"`.
 */
export function selectBestSpotForAssignment({
  lots = [],
  preferredLotId = null,
  userRole = "student",
  excludePolygonIds = [],
} = {}) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return null;
  }

  const excludeSet = new Set(
    Array.isArray(excludePolygonIds) ? excludePolygonIds.filter(Boolean) : []
  );
  const eligibleLots = getEligibleLots(lots, userRole);
  if (eligibleLots.length === 0) {
    return null;
  }

  const preferredRawLot = preferredLotId
    ? lots.find((lot) => lot.id === preferredLotId) || null
    : null;
  const preferredEligibleLot = preferredLotId
    ? eligibleLots.find((lot) => lot.id === preferredLotId) || null
    : null;

  let chosenLot = null;

  if (
    preferredEligibleLot &&
    getLotEligibleFreeCount(preferredEligibleLot, excludeSet) > 0
  ) {
    chosenLot = preferredEligibleLot;
  } else {
    const candidates = eligibleLots
      .map((lot, index) => ({
        lot,
        index,
        freeCount: getLotEligibleFreeCount(lot, excludeSet),
        sameCampus: preferredRawLot
          ? lot.campus === preferredRawLot.campus
          : false,
      }))
      .filter((entry) => entry.freeCount > 0)
      .sort((a, b) => {
        if (a.sameCampus !== b.sameCampus) {
          return a.sameCampus ? -1 : 1;
        }
        if (b.freeCount !== a.freeCount) {
          return b.freeCount - a.freeCount;
        }
        return a.index - b.index;
      });

    chosenLot = candidates[0]?.lot || null;
  }

  if (!chosenLot) {
    return null;
  }

  const zoneCandidates = (chosenLot.zones || [])
    .map((zone, zoneIndex) => ({
      zone,
      zoneIndex,
      eligibleSpots: getZoneEligibleFreeSpots(zone, excludeSet),
    }))
    .filter((entry) => entry.eligibleSpots.length > 0)
    .sort((a, b) => {
      if (b.eligibleSpots.length !== a.eligibleSpots.length) {
        return b.eligibleSpots.length - a.eligibleSpots.length;
      }
      const ratioA =
        typeof a.zone.occupancy_ratio === "number" ? a.zone.occupancy_ratio : 1;
      const ratioB =
        typeof b.zone.occupancy_ratio === "number" ? b.zone.occupancy_ratio : 1;
      if (ratioA !== ratioB) {
        return ratioA - ratioB;
      }
      return a.zoneIndex - b.zoneIndex;
    });

  const bestCandidate = zoneCandidates[0];
  if (!bestCandidate || bestCandidate.eligibleSpots.length === 0) {
    return null;
  }

  // El índice más bajo corresponde al cajón más cercano al acceso del carril en el croquis
  const chosenSpotEntry = bestCandidate.eligibleSpots[0];
  const redirectedFromLotId =
    preferredLotId && chosenLot.id !== preferredLotId ? preferredLotId : null;

  return {
    lot: chosenLot,
    zone: bestCandidate.zone,
    spot: chosenSpotEntry.spot,
    spotIndex: chosenSpotEntry.idx,
    redirectedFromLotId,
  };
}

export function findSpotInLots(lots = [], polygonId, preferredLotId = null) {
  if (!Array.isArray(lots) || !polygonId) {
    return null;
  }

  const orderedLots = preferredLotId
    ? [
        ...lots.filter((lot) => lot.id === preferredLotId),
        ...lots.filter((lot) => lot.id !== preferredLotId),
      ]
    : lots;

  for (const lot of orderedLots) {
    for (const zone of lot?.zones || []) {
      const spots = Array.isArray(zone?.spots) ? zone.spots : [];
      for (let idx = 0; idx < spots.length; idx += 1) {
        if (spots[idx]?.polygon_id === polygonId) {
          return {
            lot,
            zone,
            spot: spots[idx],
            spotIndex: idx,
          };
        }
      }
    }
  }

  return null;
}

export function computeRemainingMs(assignment, nowMs = Date.now()) {
  if (!assignment || !assignment.expires_at) {
    return 0;
  }
  const expiresMs = Date.parse(assignment.expires_at);
  if (!Number.isFinite(expiresMs)) {
    return 0;
  }
  return Math.max(0, expiresMs - nowMs);
}

export function getCountdownUrgency(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "expired";
  }
  if (remainingMs <= ASSIGNMENT_CRITICAL_MS) {
    return "critical";
  }
  if (remainingMs <= ASSIGNMENT_WARNING_MS) {
    return "warning";
  }
  return "normal";
}

export function formatCountdown(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return "00:00";
  }
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function evaluateAssignmentSync(
  assignment,
  liveSpot = null,
  nowMs = Date.now()
) {
  if (!assignment) {
    return {
      effectiveStatus: null,
      remainingMs: 0,
      progressRatio: 0,
      liveSpotState: null,
      conflict: false,
      maneuvering: false,
    };
  }

  const liveSpotState = liveSpot?.state || null;

  if (assignment.status !== "active") {
    return {
      effectiveStatus: assignment.status,
      remainingMs: 0,
      progressRatio: 0,
      liveSpotState,
      conflict: false,
      maneuvering: false,
    };
  }

  const remainingMs = computeRemainingMs(assignment, nowMs);
  const totalMs = Math.max(1000, (assignment.ttl_seconds || 900) * 1000);
  const progressRatio = Math.max(0, Math.min(1, remainingMs / totalMs));

  if (remainingMs <= 0) {
    return {
      effectiveStatus: "expired",
      remainingMs: 0,
      progressRatio: 0,
      liveSpotState,
      conflict: false,
      maneuvering: false,
    };
  }

  if (liveSpotState === "Ocupado") {
    return {
      effectiveStatus: "conflict",
      remainingMs,
      progressRatio,
      liveSpotState,
      conflict: true,
      maneuvering: false,
    };
  }

  if (liveSpotState === "En maniobra") {
    return {
      effectiveStatus: "active",
      remainingMs,
      progressRatio,
      liveSpotState,
      conflict: false,
      maneuvering: true,
    };
  }

  return {
    effectiveStatus: "active",
    remainingMs,
    progressRatio,
    liveSpotState: liveSpotState || "Libre",
    conflict: false,
    maneuvering: false,
  };
}

export function buildExternalMapLinks(lot) {
  const lat = lot?.coordinates?.lat;
  const lng = lot?.coordinates?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }
  const coords = `${lat},${lng}`;
  return {
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}&travelmode=driving`,
    wazeUrl: `https://waze.com/ul?ll=${encodeURIComponent(coords)}&navigate=yes`,
  };
}

export function buildGuidanceRoute({ lot, zone, spot, spotIndex = 0 } = {}) {
  const safeIndex = Math.max(0, Number.isFinite(spotIndex) ? spotIndex : 0);
  const isRightBlock = safeIndex % 2 === 1;
  const rowNumber = Math.floor(safeIndex / 2) + 1;
  const blockName = isRightBlock ? "Bloque B" : "Bloque A";
  const turnDirection = isRightBlock ? "derecha" : "izquierda";
  const turnSymbol = isRightBlock ? "→" : "←";

  const entryGate = lot?.entryGate || lot?.accessLabel || "Acceso principal del campus";
  const lotName = lot?.name || lot?.shortName || "Estacionamiento ITM";
  const zoneName = zone?.name || "Zona asignada";
  const laneLabel = zone?.laneLabel || "el carril central";
  const slotName = spot?.slot_name || "Cajón asignado";
  const zoneRouteText =
    Array.isArray(zone?.routeFromEntry) && zone.routeFromEntry.length > 0
      ? zone.routeFromEntry.join(" ")
      : `Sigue hacia ${zone?.landmark || zoneName}.`;

  const steps = [
    {
      id: "gate",
      icon: "🚗",
      title: `Ingresa por ${entryGate}`,
      description: `Dirígete a ${lotName}.`,
    },
    {
      id: "zone",
      icon: "🧭",
      title: `Ve hacia ${zoneName}`,
      description: zoneRouteText,
    },
    {
      id: "aisle",
      icon: turnSymbol,
      title: `Avanza por ${laneLabel}`,
      description: `Ubica la fila ${rowNumber} en el ${blockName} (lado ${turnDirection}).`,
    },
    {
      id: "park",
      icon: "🅿",
      title: `Estaciónate en ${slotName}`,
      description: "Al terminar tu maniobra, pulsa «Ya me estacioné».",
    },
  ];

  const summary = `Ingresa por ${entryGate}, dirígete a ${zoneName} y ubica el cajón ${slotName} en el ${blockName}, fila ${rowNumber} a la ${turnDirection}.`;

  return {
    summary,
    blockName,
    rowNumber,
    turnDirection,
    turnSymbol,
    isRightBlock,
    externalLinks: buildExternalMapLinks(lot),
    steps,
  };
}
