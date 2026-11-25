import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPUS_LOTS,
  applyHighOccupancySimulation,
  computeZoneCounts,
} from "../src/data/campusLots.js";
import {
  ASSIGNMENT_CRITICAL_MS,
  ASSIGNMENT_TTL_MS,
  ASSIGNMENT_WARNING_MS,
  buildExternalMapLinks,
  buildGuidanceRoute,
  computeRemainingMs,
  evaluateAssignmentSync,
  formatCountdown,
  getCountdownUrgency,
  selectBestSpotForAssignment,
} from "../src/utils/assignmentLogic.js";
import {
  ASSIGNMENT_STORAGE_KEY,
  cancelParkingAssignment,
  confirmAssignmentArrival,
  loadActiveAssignment,
  reassignParkingSpot,
  requestParkingSpot,
} from "../src/services/parkingAssignmentService.js";
import { buildGuidanceAnnouncement } from "../src/utils/speechAvailability.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function makeAllOccupiedLots(lots = CAMPUS_LOTS) {
  return lots.map((lot) => ({
    ...lot,
    zones: lot.zones.map((zone) => {
      const spots = zone.spots.map((spot) => ({
        ...spot,
        state: "Ocupado",
        vehicle_type: "car",
        iou_ratio: 0.85,
      }));
      return {
        ...zone,
        spots,
        ...computeZoneCounts(spots),
      };
    }),
  }));
}

test("selectBestSpotForAssignment elige mejor zona/cajón cercano al acceso, respeta roles y excluye cajones", () => {
  const northSelection = selectBestSpotForAssignment({
    lots: CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
  });
  assert.ok(northSelection);
  assert.equal(northSelection.lot.id, "ITM-CAMPUS1-EST-NORTE");
  assert.equal(northSelection.zone.id, "C1N-Z2");
  assert.equal(northSelection.spot.state, "Libre");
  assert.equal(northSelection.spotIndex, 0);
  assert.equal(northSelection.redirectedFromLotId, null);

  // Un estudiante que solicita Edif. L (staff_only) es redirigido a un lote general de Campus 1
  const studentStaffLotAttempt = selectBestSpotForAssignment({
    lots: CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-EDIF-L",
    userRole: "student",
  });
  assert.ok(studentStaffLotAttempt);
  assert.equal(studentStaffLotAttempt.lot.access_type, "general");
  assert.equal(studentStaffLotAttempt.lot.campus, "Campus 1");
  assert.equal(
    studentStaffLotAttempt.redirectedFromLotId,
    "ITM-CAMPUS1-EST-EDIF-L"
  );

  // Personal ITM sí puede recibir Edif. L
  const staffAttempt = selectBestSpotForAssignment({
    lots: CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-EDIF-L",
    userRole: "staff",
  });
  assert.ok(staffAttempt);
  assert.equal(staffAttempt.lot.id, "ITM-CAMPUS1-EST-EDIF-L");
  assert.equal(staffAttempt.redirectedFromLotId, null);

  // Fallback cuando el lote preferido está completamente ocupado
  const lotsWithFullNorth = CAMPUS_LOTS.map((lot) =>
    lot.id === "ITM-CAMPUS1-EST-NORTE" ? makeAllOccupiedLots([lot])[0] : lot
  );
  const fallbackSelection = selectBestSpotForAssignment({
    lots: lotsWithFullNorth,
    preferredLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
  });
  assert.ok(fallbackSelection);
  assert.notEqual(fallbackSelection.lot.id, "ITM-CAMPUS1-EST-NORTE");
  assert.equal(fallbackSelection.lot.access_type, "general");
  assert.equal(fallbackSelection.redirectedFromLotId, "ITM-CAMPUS1-EST-NORTE");

  // Exclusión en reasignación evita el cajón previo
  const excludedId = northSelection.spot.polygon_id;
  const secondChoice = selectBestSpotForAssignment({
    lots: CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
    excludePolygonIds: [excludedId],
  });
  assert.ok(secondChoice);
  assert.notEqual(secondChoice.spot.polygon_id, excludedId);

  // Si todos los lotes están ocupados, retorna null
  const saturatedAll = makeAllOccupiedLots(CAMPUS_LOTS);
  const emptySelection = selectBestSpotForAssignment({
    lots: saturatedAll,
    preferredLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
  });
  assert.equal(emptySelection, null);
});

test("computeRemainingMs, formatCountdown y getCountdownUrgency manejan 15:00, umbrales y 00:00", () => {
  const baseNow = Date.parse("2026-11-19T15:00:00.000Z");
  const assignment = {
    assigned_at: new Date(baseNow).toISOString(),
    expires_at: new Date(baseNow + ASSIGNMENT_TTL_MS).toISOString(),
    ttl_seconds: 900,
    status: "active",
  };

  const fullRemaining = computeRemainingMs(assignment, baseNow);
  assert.equal(fullRemaining, ASSIGNMENT_TTL_MS);
  assert.equal(formatCountdown(fullRemaining), "15:00");
  assert.equal(getCountdownUrgency(fullRemaining), "normal");

  assert.equal(formatCountdown(ASSIGNMENT_WARNING_MS), "03:00");
  assert.equal(getCountdownUrgency(ASSIGNMENT_WARNING_MS), "warning");

  assert.equal(formatCountdown(ASSIGNMENT_CRITICAL_MS), "01:00");
  assert.equal(getCountdownUrgency(ASSIGNMENT_CRITICAL_MS), "critical");

  assert.equal(formatCountdown(500), "00:01");
  assert.equal(getCountdownUrgency(500), "critical");

  const expiredRemaining = computeRemainingMs(
    assignment,
    baseNow + ASSIGNMENT_TTL_MS + 1000
  );
  assert.equal(expiredRemaining, 0);
  assert.equal(formatCountdown(expiredRemaining), "00:00");
  assert.equal(getCountdownUrgency(expiredRemaining), "expired");
});

test("evaluateAssignmentSync detecta active, maneuvering, conflict y expired", () => {
  const now = Date.parse("2026-11-19T15:00:00.000Z");
  const assignment = {
    assignment_id: "asg-1",
    status: "active",
    ttl_seconds: 900,
    expires_at: new Date(now + ASSIGNMENT_TTL_MS).toISOString(),
  };

  const freeSync = evaluateAssignmentSync(assignment, { state: "Libre" }, now);
  assert.equal(freeSync.effectiveStatus, "active");
  assert.equal(freeSync.conflict, false);
  assert.equal(freeSync.maneuvering, false);
  assert.equal(freeSync.progressRatio, 1);

  const maneuverSync = evaluateAssignmentSync(
    assignment,
    { state: "En maniobra" },
    now + 60_000
  );
  assert.equal(maneuverSync.effectiveStatus, "active");
  assert.equal(maneuverSync.maneuvering, true);
  assert.equal(maneuverSync.conflict, false);

  const conflictSync = evaluateAssignmentSync(
    assignment,
    { state: "Ocupado" },
    now + 120_000
  );
  assert.equal(conflictSync.effectiveStatus, "conflict");
  assert.equal(conflictSync.conflict, true);
  assert.equal(conflictSync.maneuvering, false);

  const expiredSync = evaluateAssignmentSync(
    assignment,
    { state: "Libre" },
    now + ASSIGNMENT_TTL_MS + 100
  );
  assert.equal(expiredSync.effectiveStatus, "expired");
  assert.equal(expiredSync.remainingMs, 0);
  assert.equal(expiredSync.progressRatio, 0);

  const arrivedSync = evaluateAssignmentSync(
    { ...assignment, status: "arrived" },
    { state: "Ocupado" },
    now
  );
  assert.equal(arrivedSync.effectiveStatus, "arrived");
  assert.equal(arrivedSync.conflict, false);
});

test("buildGuidanceRoute y buildExternalMapLinks calculan Bloque A/B, fila, 4 pasos y enlaces", () => {
  const northLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");
  const westZone = northLot.zones.find((z) => z.id === "C1N-Z2");

  const leftRoute = buildGuidanceRoute({
    lot: northLot,
    zone: westZone,
    spot: westZone.spots[0],
    spotIndex: 0,
  });
  assert.equal(leftRoute.blockName, "Bloque A");
  assert.equal(leftRoute.rowNumber, 1);
  assert.equal(leftRoute.turnDirection, "izquierda");
  assert.equal(leftRoute.turnSymbol, "←");
  assert.equal(leftRoute.steps.length, 4);
  assert.deepEqual(
    leftRoute.steps.map((s) => s.id),
    ["gate", "zone", "aisle", "park"]
  );
  assert.match(leftRoute.steps[0].title, /Caseta Principal/);
  assert.match(leftRoute.steps[2].description, /fila 1.*Bloque A/i);

  const rightRoute = buildGuidanceRoute({
    lot: northLot,
    zone: westZone,
    spot: westZone.spots[3],
    spotIndex: 3,
  });
  assert.equal(rightRoute.blockName, "Bloque B");
  assert.equal(rightRoute.rowNumber, 2);
  assert.equal(rightRoute.turnDirection, "derecha");
  assert.equal(rightRoute.turnSymbol, "→");

  const links = buildExternalMapLinks(northLot);
  assert.ok(links);
  assert.match(links.googleMapsUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.match(links.wazeUrl, /^https:\/\/waze\.com\/ul\?ll=/);
});

test("buildGuidanceAnnouncement genera mensajes en español para ruta normal y conflicto", () => {
  const northLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");
  const westZone = northLot.zones.find((z) => z.id === "C1N-Z2");
  const spot = westZone.spots[0];
  const route = buildGuidanceRoute({
    lot: northLot,
    zone: westZone,
    spot,
    spotIndex: 0,
  });

  const assignment = {
    slot_name: spot.slot_name,
    lot_name: northLot.name,
    zone_name: westZone.name,
  };

  const activeSpeech = buildGuidanceAnnouncement({
    assignment,
    route,
    remainingMs: 14 * 60 * 1000 + 20 * 1000,
    conflict: false,
  });
  assert.match(activeSpeech, new RegExp(spot.slot_name));
  assert.match(activeSpeech, /15 minutos/);
  assert.match(activeSpeech, /Paso 1/);

  const conflictSpeech = buildGuidanceAnnouncement({
    assignment,
    route,
    remainingMs: 10 * 60 * 1000,
    conflict: true,
  });
  assert.match(conflictSpeech, /detectó un vehículo ocupando/i);
  assert.match(conflictSpeech, /Reasignar otro lugar/i);
});

test("parkingAssignmentService ejecuta ciclo completo: request -> reload -> expire -> reassign -> confirm -> cancel", async () => {
  const storage = createMemoryStorage();
  const t0 = Date.parse("2026-11-19T16:00:00.000Z");

  const reqResult = await requestParkingSpot({
    lots: CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
    nowMs: t0,
    storage,
  });
  assert.equal(reqResult.ok, true);
  assert.equal(reqResult.assignment.status, "active");
  assert.equal(reqResult.assignment.ttl_seconds, 900);
  assert.equal(reqResult.assignment.source, "local");
  assert.ok(storage.getItem(ASSIGNMENT_STORAGE_KEY));

  // Recarga antes de vencer
  const loadedActive = loadActiveAssignment({
    storage,
    nowMs: t0 + 5 * 60 * 1000,
  });
  assert.equal(loadedActive?.status, "active");
  assert.equal(loadedActive?.polygon_id, reqResult.assignment.polygon_id);

  // Reasignación excluye el cajón previo y reinicia 15 min
  const t1 = t0 + 6 * 60 * 1000;
  const reassignResult = await reassignParkingSpot({
    currentAssignment: loadedActive,
    lots: CAMPUS_LOTS,
    userRole: "student",
    nowMs: t1,
    storage,
  });
  assert.equal(reassignResult.ok, true);
  assert.notEqual(
    reassignResult.assignment.polygon_id,
    reqResult.assignment.polygon_id
  );
  assert.equal(
    reassignResult.assignment.reassigned_from,
    reqResult.assignment.slot_name
  );
  assert.ok(
    reassignResult.assignment.excluded_polygon_ids.includes(
      reqResult.assignment.polygon_id
    )
  );
  assert.equal(
    computeRemainingMs(reassignResult.assignment, t1),
    ASSIGNMENT_TTL_MS
  );

  // Recarga después de los 15 minutos marca caducidad automáticamente
  const loadedExpired = loadActiveAssignment({
    storage,
    nowMs: t1 + ASSIGNMENT_TTL_MS + 1000,
  });
  assert.equal(loadedExpired?.status, "expired");

  // Nueva solicitud + confirmación de llegada + cancelación
  const secondReq = await requestParkingSpot({
    lots: applyHighOccupancySimulation(CAMPUS_LOTS[0])
      ? CAMPUS_LOTS
      : CAMPUS_LOTS,
    preferredLotId: "ITM-CAMPUS1-EST-SUR",
    userRole: "student",
    nowMs: t1 + ASSIGNMENT_TTL_MS + 2000,
    storage,
  });
  assert.equal(secondReq.ok, true);

  const arrived = await confirmAssignmentArrival(secondReq.assignment, {
    nowMs: t1 + ASSIGNMENT_TTL_MS + 5000,
    storage,
  });
  assert.equal(arrived?.status, "arrived");
  assert.ok(arrived?.arrived_at);

  const reloadedArrived = loadActiveAssignment({ storage });
  assert.equal(reloadedArrived?.status, "arrived");

  await cancelParkingAssignment(reloadedArrived, { storage });
  assert.equal(loadActiveAssignment({ storage }), null);
});
