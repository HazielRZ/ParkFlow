/**
 * Adaptador desacoplado de asignación temporal de cajones (TTL 15 min) con
 * persistencia local (`localStorage`) y soporte opcional para API REST futura (`RNF-05`).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import {
  ASSIGNMENT_TTL_MS,
  computeRemainingMs,
  findSpotInLots,
  getEligibleLots,
  selectBestSpotForAssignment,
} from "../utils/assignmentLogic.js";

export const ASSIGNMENT_STORAGE_KEY = "parkflow.active_assignment.v1";

export function resolveAssignmentApiUrl(explicitUrl) {
  if (explicitUrl) {
    return String(explicitUrl).replace(/\/+$/, "");
  }
  const envUrl =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_ASSIGNMENT_API_URL
      : undefined;
  return envUrl ? String(envUrl).replace(/\/+$/, "") : "";
}

function getDefaultStorage(explicitStorage) {
  if (explicitStorage !== undefined) {
    return explicitStorage;
  }
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveFetch(explicitFetch) {
  if (typeof explicitFetch === "function") {
    return explicitFetch;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

function generateAssignmentId(nowMs) {
  try {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Usar identificador alternativo
  }
  return `asg-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
}

export function saveActiveAssignment(assignment, { storage } = {}) {
  const store = getDefaultStorage(storage);
  if (!store || !assignment) {
    return assignment;
  }
  try {
    store.setItem(ASSIGNMENT_STORAGE_KEY, JSON.stringify(assignment));
  } catch {
    // Ignorar errores de cuota o modo privado
  }
  return assignment;
}

export function clearActiveAssignment({ storage } = {}) {
  const store = getDefaultStorage(storage);
  if (!store) {
    return;
  }
  try {
    store.removeItem(ASSIGNMENT_STORAGE_KEY);
  } catch {
    // Ignorar errores de acceso a almacenamiento
  }
}

export function loadActiveAssignment({ storage, nowMs = Date.now() } = {}) {
  const store = getDefaultStorage(storage);
  if (!store) {
    return null;
  }

  let raw = null;
  try {
    raw = store.getItem(ASSIGNMENT_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.assignment_id ||
      !parsed.polygon_id
    ) {
      clearActiveAssignment({ storage: store });
      return null;
    }

    if (
      parsed.status === "active" &&
      computeRemainingMs(parsed, nowMs) <= 0
    ) {
      const expired = {
        ...parsed,
        status: "expired",
        expired_at: new Date(nowMs).toISOString(),
      };
      saveActiveAssignment(expired, { storage: store });
      return expired;
    }

    return parsed;
  } catch {
    clearActiveAssignment({ storage: store });
    return null;
  }
}

export async function requestParkingSpot({
  lots = [],
  preferredLotId = null,
  preferredPolygonId = null,
  userRole = "student",
  excludePolygonIds = [],
  ttlMs = ASSIGNMENT_TTL_MS,
  reassignedFrom = null,
  nowMs = Date.now(),
  storage,
  apiBaseUrl,
  fetchImpl,
} = {}) {
  const baseUrl = resolveAssignmentApiUrl(apiBaseUrl);
  const fetcher = resolveFetch(fetchImpl);
  const safeExcludes = Array.from(
    new Set(
      (Array.isArray(excludePolygonIds) ? excludePolygonIds : []).filter(Boolean)
    )
  );

  if (baseUrl && fetcher) {
    try {
      const response = await fetcher(`${baseUrl}/api/v1/assignments/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_lot_id: preferredLotId,
          preferred_polygon_id: preferredPolygonId,
          user_role: userRole,
          exclude_polygon_ids: safeExcludes,
          ttl_seconds: Math.round(ttlMs / 1000),
          reassigned_from: reassignedFrom,
        }),
      });

      if (response && response.ok) {
        const remote = await response.json();
        if (remote && remote.polygon_id && remote.expires_at) {
          const assignment = {
            ...remote,
            excluded_polygon_ids: remote.excluded_polygon_ids || safeExcludes,
            source: "api",
          };
          saveActiveAssignment(assignment, { storage });
          return { ok: true, assignment };
        }
      }
    } catch {
      // Fallback transparente al motor local si el endpoint aún no existe o está sin red
    }
  }

  let selection = null;

  if (preferredPolygonId) {
    const directMatch = findSpotInLots(lots, preferredPolygonId, preferredLotId);
    const eligibleLotIds = new Set(
      getEligibleLots(lots, userRole).map((lot) => lot.id)
    );
    if (
      directMatch &&
      directMatch.spot?.state === "Libre" &&
      eligibleLotIds.has(directMatch.lot.id)
    ) {
      selection = {
        lot: directMatch.lot,
        zone: directMatch.zone,
        spot: directMatch.spot,
        spotIndex: directMatch.spotIndex,
        redirectedFromLotId:
          preferredLotId && directMatch.lot.id !== preferredLotId
            ? preferredLotId
            : null,
      };
    }
  }

  if (!selection) {
    selection = selectBestSpotForAssignment({
      lots,
      preferredLotId,
      userRole,
      excludePolygonIds: safeExcludes,
    });
  }

  if (!selection) {
    return {
      ok: false,
      reason: "NO_FREE_SPOTS",
    };
  }

  const assignment = {
    assignment_id: generateAssignmentId(nowMs),
    parking_lot_id: selection.lot.id,
    lot_short_name: selection.lot.shortName,
    lot_name: selection.lot.name,
    zone_id: selection.zone.id,
    zone_name: selection.zone.name,
    zone_landmark: selection.zone.landmark,
    polygon_id: selection.spot.polygon_id,
    slot_name: selection.spot.slot_name,
    spot_index: selection.spotIndex,
    user_role: userRole,
    status: "active",
    assigned_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + ttlMs).toISOString(),
    ttl_seconds: Math.round(ttlMs / 1000),
    reassigned_from: reassignedFrom,
    redirected_from_lot_id: selection.redirectedFromLotId,
    excluded_polygon_ids: safeExcludes,
    source: "local",
  };

  saveActiveAssignment(assignment, { storage });
  return { ok: true, assignment };
}

export async function reassignParkingSpot({
  currentAssignment,
  lots = [],
  userRole,
  ttlMs = ASSIGNMENT_TTL_MS,
  nowMs = Date.now(),
  storage,
  apiBaseUrl,
  fetchImpl,
} = {}) {
  const previousExcludes = Array.isArray(currentAssignment?.excluded_polygon_ids)
    ? currentAssignment.excluded_polygon_ids
    : [];
  const nextExcludes = Array.from(
    new Set(
      [...previousExcludes, currentAssignment?.polygon_id].filter(Boolean)
    )
  );

  return requestParkingSpot({
    lots,
    preferredLotId: currentAssignment?.parking_lot_id || null,
    userRole: userRole || currentAssignment?.user_role || "student",
    excludePolygonIds: nextExcludes,
    ttlMs,
    reassignedFrom: currentAssignment?.slot_name || null,
    nowMs,
    storage,
    apiBaseUrl,
    fetchImpl,
  });
}

export async function confirmAssignmentArrival(
  assignment,
  { nowMs = Date.now(), storage, apiBaseUrl, fetchImpl } = {}
) {
  if (!assignment) {
    return null;
  }

  const baseUrl = resolveAssignmentApiUrl(apiBaseUrl);
  const fetcher = resolveFetch(fetchImpl);
  if (baseUrl && fetcher && assignment.source === "api") {
    try {
      await fetcher(
        `${baseUrl}/api/v1/assignments/${encodeURIComponent(assignment.assignment_id)}/confirm`,
        { method: "POST" }
      );
    } catch {
      // Continuar con confirmación local
    }
  }

  const arrived = {
    ...assignment,
    status: "arrived",
    arrived_at: new Date(nowMs).toISOString(),
  };
  saveActiveAssignment(arrived, { storage });
  return arrived;
}

export async function cancelParkingAssignment(
  assignment,
  { storage, apiBaseUrl, fetchImpl } = {}
) {
  const baseUrl = resolveAssignmentApiUrl(apiBaseUrl);
  const fetcher = resolveFetch(fetchImpl);
  if (baseUrl && fetcher && assignment?.assignment_id && assignment.source === "api") {
    try {
      await fetcher(
        `${baseUrl}/api/v1/assignments/${encodeURIComponent(assignment.assignment_id)}`,
        { method: "DELETE" }
      );
    } catch {
      // Continuar limpiando estado local
    }
  }

  clearActiveAssignment({ storage });
  return { ok: true };
}

export function expireParkingAssignment(
  assignment,
  { nowMs = Date.now(), storage } = {}
) {
  if (!assignment) {
    return null;
  }
  const expired = {
    ...assignment,
    status: "expired",
    expired_at: new Date(nowMs).toISOString(),
  };
  saveActiveAssignment(expired, { storage });
  return expired;
}
