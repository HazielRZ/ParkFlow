/**
 * Lógica pura de detección de saturación (>= 90% / 100%) y recomendación dinámica
 * de zonas o accesos alternos (RF-04 • CU-03 • RNF-05).
 * Sin dependencias de DOM para permitir pruebas unitarias directas.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import { getBestZoneForLot, getLotMetrics } from "../data/campusLots.js";
import { getEligibleLots } from "./assignmentLogic.js";

export const SATURATION_WARNING_THRESHOLD = 0.9;
export const SATURATION_CRITICAL_THRESHOLD = 1.0;

export const SATURATION_MESSAGES = {
  warning: "ESTACIONAMIENTO CASI LLENO",
  critical: "ESTACIONAMIENTO LLENO",
};

const SEVERITY_RANK = {
  normal: 0,
  warning: 1,
  critical: 2,
};

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Clasifica el estado de saturación a partir de un ratio (0..1), porcentaje (0..100)
 * o métricas de zona/lote/campus.
 */
export function getSaturationStatus(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    const normalized = input > 1 ? input / 100 : input;
    const ratio = Math.max(0, Math.min(1, normalized));
    return buildStatusFromValues({ occupancyRatio: ratio });
  }

  if (!input || typeof input !== "object") {
    return buildStatusFromValues({ occupancyRatio: 0, totalSpots: 0 });
  }

  const totalSpots =
    toFiniteNumber(input.totalSpots) ??
    toFiniteNumber(input.total_slots) ??
    toFiniteNumber(input.total_count) ??
    toFiniteNumber(input.total);

  const freeSpots =
    toFiniteNumber(input.freeSpots) ??
    toFiniteNumber(input.free_count) ??
    toFiniteNumber(input.free);

  const occupiedSpots =
    toFiniteNumber(input.occupiedSpots) ??
    toFiniteNumber(input.occupied_count) ??
    toFiniteNumber(input.occupied);

  const inManeuverSpots =
    toFiniteNumber(input.inManeuverSpots) ??
    toFiniteNumber(input.inManeuver) ??
    toFiniteNumber(input.in_maneuver) ??
    0;

  if (totalSpots === 0) {
    return buildStatusFromValues({
      occupancyRatio: 0,
      freeSpots: freeSpots ?? 0,
      totalSpots: 0,
      occupiedSpots: occupiedSpots ?? 0,
      inManeuverSpots,
    });
  }

  const explicitPct = toFiniteNumber(input.occupancyPercentage);
  const explicitRatio =
    toFiniteNumber(input.occupancyRatio) ?? toFiniteNumber(input.occupancy_ratio);

  let rawRatio = 0;
  if (explicitPct !== null) {
    rawRatio = explicitPct / 100;
  } else if (explicitRatio !== null) {
    rawRatio = explicitRatio;
  } else if (totalSpots !== null && totalSpots > 0 && occupiedSpots !== null) {
    rawRatio = occupiedSpots / totalSpots;
  } else if (totalSpots !== null && totalSpots > 0 && freeSpots !== null) {
    rawRatio = (totalSpots - freeSpots) / totalSpots;
  }

  return buildStatusFromValues({
    occupancyRatio: Math.max(0, Math.min(1, Number.isFinite(rawRatio) ? rawRatio : 0)),
    freeSpots,
    totalSpots,
    occupiedSpots,
    inManeuverSpots,
  });
}

function buildStatusFromValues({
  occupancyRatio,
  freeSpots = null,
  totalSpots = null,
  occupiedSpots = null,
  inManeuverSpots = 0,
}) {
  if (totalSpots === 0) {
    return {
      level: "normal",
      isVisible: false,
      isWarning: false,
      isCritical: false,
      title: "",
      occupancyRatio: 0,
      occupancyPercentage: 0,
      freeSpots: freeSpots ?? 0,
      totalSpots: 0,
      inManeuverSpots: Math.max(0, inManeuverSpots || 0),
    };
  }

  const isCriticalByCounts =
    totalSpots !== null &&
    totalSpots > 0 &&
    occupiedSpots !== null &&
    occupiedSpots >= totalSpots &&
    (freeSpots === null || freeSpots === 0);

  const isCritical =
    occupancyRatio >= SATURATION_CRITICAL_THRESHOLD || isCriticalByCounts;
  const isWarning = !isCritical && occupancyRatio >= SATURATION_WARNING_THRESHOLD;

  let level = "normal";
  let title = "";
  let occupancyPercentage = Math.min(
    89,
    Math.max(0, Math.round(occupancyRatio * 100))
  );

  if (isCritical) {
    level = "critical";
    title = SATURATION_MESSAGES.critical;
    occupancyPercentage = 100;
  } else if (isWarning) {
    level = "warning";
    title = SATURATION_MESSAGES.warning;
    occupancyPercentage = Math.min(
      99,
      Math.max(90, Math.round(occupancyRatio * 100))
    );
  }

  return {
    level,
    isVisible: level !== "normal",
    isWarning,
    isCritical,
    title,
    occupancyRatio,
    occupancyPercentage,
    freeSpots: freeSpots ?? 0,
    totalSpots: totalSpots ?? 0,
    inManeuverSpots: Math.max(0, inManeuverSpots || 0),
  };
}

/**
 * Calcula las métricas agregadas de ocupación de un campus respetando el rol del usuario.
 */
export function getCampusMetrics(lots = [], campus = null, userRole = "student") {
  const eligibleLots = getEligibleLots(lots, userRole);
  const scopedLots = campus
    ? eligibleLots.filter((lot) => lot.campus === campus)
    : eligibleLots;

  let totalSlots = 0;
  let free = 0;
  let occupied = 0;
  let inManeuver = 0;

  for (const lot of scopedLots) {
    const metrics = getLotMetrics(lot);
    totalSlots += metrics.total_slots;
    free += metrics.free;
    occupied += metrics.occupied;
    inManeuver += metrics.in_maneuver;
  }

  const occupancyRatio =
    totalSlots > 0 ? Number((occupied / totalSlots).toFixed(4)) : 0;

  return {
    campus,
    lotCount: scopedLots.length,
    total_slots: totalSlots,
    free,
    occupied,
    in_maneuver: inManeuver,
    occupancy_ratio: occupancyRatio,
    high_occupancy_alert: occupancyRatio >= SATURATION_WARNING_THRESHOLD,
  };
}

function getCandidateTier(candidate) {
  if (candidate.sameLot && candidate.isUnderThreshold) {
    return 0;
  }
  if (candidate.sameCampus && !candidate.sameLot && candidate.isUnderThreshold) {
    return 1;
  }
  if (!candidate.sameCampus && candidate.isUnderThreshold) {
    return 2;
  }
  if (candidate.sameLot && !candidate.isUnderThreshold) {
    return 3;
  }
  if (candidate.sameCampus && !candidate.sameLot && !candidate.isUnderThreshold) {
    return 4;
  }
  return 5;
}

/**
 * Selecciona dinámicamente la mejor zona o estacionamiento alterno con lugares libres:
 * - Excluye la zona/lote actual y cualquier opción al 100%.
 * - Respeta restricciones `staff_only` según `userRole`.
 * - Prioriza primero zonas del mismo lote/campus (< 90% y menor ocupación),
 *   luego opciones en otro campus si el campus actual está saturado.
 */
export function getAlternativeZone({
  lots = [],
  currentLotId = null,
  currentZoneId = null,
  currentCampus = null,
  userRole = "student",
} = {}) {
  if (!Array.isArray(lots) || lots.length === 0) {
    return null;
  }

  const eligibleLots = getEligibleLots(lots, userRole);
  if (eligibleLots.length === 0) {
    return null;
  }

  const resolvedCampus =
    currentCampus ||
    lots.find((lot) => lot && lot.id === currentLotId)?.campus ||
    null;

  const currentEligibleLot = currentLotId
    ? eligibleLots.find((lot) => lot.id === currentLotId) || null
    : null;

  const candidates = [];

  if (currentZoneId && currentEligibleLot) {
    for (const zone of currentEligibleLot.zones || []) {
      if (!zone || zone.id === currentZoneId) {
        continue;
      }
      const totalSpots =
        typeof zone.total_count === "number"
          ? zone.total_count
          : Array.isArray(zone.spots)
            ? zone.spots.length
            : 0;
      const freeSpots =
        typeof zone.free_count === "number" ? zone.free_count : 0;
      const occupancyRatio =
        typeof zone.occupancy_ratio === "number"
          ? zone.occupancy_ratio
          : totalSpots > 0
            ? (zone.occupied_count || 0) / totalSpots
            : 1;

      if (freeSpots <= 0 || occupancyRatio >= SATURATION_CRITICAL_THRESHOLD) {
        continue;
      }

      candidates.push({
        type: "zone",
        sameLot: true,
        sameCampus: true,
        lotId: currentEligibleLot.id,
        lotName: currentEligibleLot.name,
        lotShortName: currentEligibleLot.shortName,
        zoneId: zone.id,
        displayName: zone.name,
        landmark: zone.landmark || currentEligibleLot.accessLabel || "",
        campus: currentEligibleLot.campus,
        freeSpots,
        totalSpots,
        occupancyRatio,
        occupancyPercentage: Math.round(occupancyRatio * 100),
        isUnderThreshold: occupancyRatio < SATURATION_WARNING_THRESHOLD,
        bestZoneName: zone.name,
        originalIndex: candidates.length,
      });
    }
  }

  for (const lot of eligibleLots) {
    if (!lot || lot.id === currentLotId) {
      continue;
    }
    const metrics = getLotMetrics(lot);
    if (
      metrics.free <= 0 ||
      metrics.occupancy_ratio >= SATURATION_CRITICAL_THRESHOLD
    ) {
      continue;
    }

    const sameCampus = resolvedCampus ? lot.campus === resolvedCampus : false;
    const bestZone = getBestZoneForLot(lot);

    candidates.push({
      type: "lot",
      sameLot: false,
      sameCampus,
      lotId: lot.id,
      lotName: lot.name,
      lotShortName: lot.shortName,
      zoneId: null,
      displayName: lot.shortName,
      landmark: lot.accessLabel || "",
      campus: lot.campus,
      freeSpots: metrics.free,
      totalSpots: metrics.total_slots,
      occupancyRatio: metrics.occupancy_ratio,
      occupancyPercentage: Math.round(metrics.occupancy_ratio * 100),
      isUnderThreshold: metrics.occupancy_ratio < SATURATION_WARNING_THRESHOLD,
      bestZoneName: bestZone?.name || null,
      originalIndex: candidates.length,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    const tierDiff = getCandidateTier(a) - getCandidateTier(b);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    if (a.occupancyRatio !== b.occupancyRatio) {
      return a.occupancyRatio - b.occupancyRatio;
    }
    if (b.freeSpots !== a.freeSpots) {
      return b.freeSpots - a.freeSpots;
    }
    return a.originalIndex - b.originalIndex;
  });

  const { originalIndex: _ignored, ...winner } = candidates[0];
  return winner;
}

/**
 * Resuelve la alerta de saturación prioritaria según el nivel de vista actual
 * (zona específica → lote actual → vista agregada de campus).
 */
export function resolveActiveSaturationAlert({
  lots = [],
  activeLot = null,
  activeZone = null,
  userRole = "student",
} = {}) {
  const zoneStatus = activeZone ? getSaturationStatus(activeZone) : null;
  if (activeZone && zoneStatus?.isVisible) {
    return {
      scope: "zone",
      transitionKey: `zone:${activeZone.id}`,
      targetId: activeZone.id,
      targetName: activeLot?.shortName
        ? `${activeZone.name} • ${activeLot.shortName}`
        : activeZone.name,
      targetFullName: activeZone.name,
      status: zoneStatus,
      alternative: getAlternativeZone({
        lots,
        currentLotId: activeLot?.id || null,
        currentZoneId: activeZone.id,
        currentCampus: activeLot?.campus || null,
        userRole,
      }),
    };
  }

  const lotMetrics = activeLot ? getLotMetrics(activeLot) : null;
  const lotStatus = lotMetrics ? getSaturationStatus(lotMetrics) : null;
  if (activeLot && lotStatus?.isVisible) {
    return {
      scope: "lot",
      transitionKey: `lot:${activeLot.id}`,
      targetId: activeLot.id,
      targetName: activeLot.shortName,
      targetFullName: activeLot.name,
      status: lotStatus,
      alternative: getAlternativeZone({
        lots,
        currentLotId: activeLot.id,
        currentZoneId: null,
        currentCampus: activeLot.campus || null,
        userRole,
      }),
    };
  }

  const campusName = activeLot?.campus || null;
  const campusMetrics =
    lots.length > 0 ? getCampusMetrics(lots, campusName, userRole) : null;
  const campusStatus = campusMetrics ? getSaturationStatus(campusMetrics) : null;
  if (campusMetrics && campusStatus?.isVisible) {
    const resolvedCampusLabel = campusName || "Campus ITM";
    return {
      scope: "campus",
      transitionKey: `campus:${resolvedCampusLabel}`,
      targetId: resolvedCampusLabel,
      targetName: resolvedCampusLabel,
      targetFullName: resolvedCampusLabel,
      status: campusStatus,
      alternative: getAlternativeZone({
        lots,
        currentLotId: activeLot?.id || null,
        currentZoneId: null,
        currentCampus: campusName,
        userRole,
      }),
    };
  }

  return null;
}

/**
 * Determina si debe dispararse una notificación/lectura por voz en transición de umbral
 * (solo escalamientos: <90% → >=90%, <90% → 100%, o >=90% → 100%).
 */
export function shouldTriggerSaturationNotification(
  prevLevel = "normal",
  nextLevel = "normal"
) {
  const prevRank = SEVERITY_RANK[prevLevel] ?? 0;
  const nextRank = SEVERITY_RANK[nextLevel] ?? 0;
  return nextRank > prevRank;
}
