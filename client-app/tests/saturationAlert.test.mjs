import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPUS_LOTS,
  applyFullOccupancySimulation,
  applyHighOccupancySimulation,
  computeZoneCounts,
} from "../src/data/campusLots.js";
import {
  SATURATION_MESSAGES,
  getAlternativeZone,
  getCampusMetrics,
  getSaturationStatus,
  resolveActiveSaturationAlert,
  shouldTriggerSaturationNotification,
} from "../src/utils/saturationLogic.js";
import { buildSaturationAlertAnnouncement } from "../src/utils/speechAvailability.js";

function cloneLots() {
  return structuredClone(CAMPUS_LOTS);
}

function saturateZoneSpots(zone, freeCount = 0) {
  const total = zone.spots.length;
  const spots = zone.spots.map((spot, idx) => ({
    ...spot,
    state: idx < freeCount ? "Libre" : "Ocupado",
    vehicle_type: idx < freeCount ? null : spot.vehicle_type || "car",
  }));
  return {
    ...zone,
    spots,
    ...computeZoneCounts(spots),
    total_count: total,
  };
}

test("getSaturationStatus clasifica <90%, 90%-99%, 100% y 0 cajones", () => {
  const normal = getSaturationStatus({
    occupancy_ratio: 0.89,
    free: 3,
    total_slots: 28,
  });
  assert.equal(normal.level, "normal");
  assert.equal(normal.isVisible, false);
  assert.equal(normal.title, "");

  const warning = getSaturationStatus({
    occupancy_ratio: 0.92,
    free: 2,
    total_slots: 25,
    in_maneuver: 1,
  });
  assert.equal(warning.level, "warning");
  assert.equal(warning.isVisible, true);
  assert.equal(warning.isWarning, true);
  assert.equal(warning.isCritical, false);
  assert.equal(warning.title, SATURATION_MESSAGES.warning);
  assert.equal(warning.title, "ESTACIONAMIENTO CASI LLENO");
  assert.equal(warning.occupancyPercentage, 92);
  assert.equal(warning.freeSpots, 2);

  // Evita mostrar 100% cuando aún hay libres en estado warning
  const warningRounded = getSaturationStatus({
    occupancy_ratio: 0.996,
    free: 1,
    total_slots: 250,
  });
  assert.equal(warningRounded.level, "warning");
  assert.equal(warningRounded.occupancyPercentage, 99);

  const critical = getSaturationStatus({
    occupancy_ratio: 1,
    free: 0,
    total_slots: 20,
  });
  assert.equal(critical.level, "critical");
  assert.equal(critical.isVisible, true);
  assert.equal(critical.isCritical, true);
  assert.equal(critical.title, SATURATION_MESSAGES.critical);
  assert.equal(critical.title, "ESTACIONAMIENTO LLENO");
  assert.equal(critical.occupancyPercentage, 100);

  const emptyTotal = getSaturationStatus({
    occupancy_ratio: 0,
    free: 0,
    total_slots: 0,
  });
  assert.equal(emptyTotal.level, "normal");
  assert.equal(emptyTotal.isVisible, false);
});

test("getCampusMetrics respeta roles student vs staff al agregar ocupación", () => {
  const lots = cloneLots().map((lot) => {
    if (lot.id === "ITM-CAMPUS1-EST-NORTE" || lot.id === "ITM-CAMPUS1-EST-SUR") {
      return applyFullOccupancySimulation(lot);
    }
    return lot;
  });

  // Para estudiante, Campus 1 solo cuenta Norte + Sur (ambos al 100%)
  const studentC1 = getCampusMetrics(lots, "Campus 1", "student");
  assert.equal(studentC1.lotCount, 2);
  assert.equal(studentC1.free, 0);
  assert.equal(studentC1.occupancy_ratio, 1);
  assert.equal(studentC1.high_occupancy_alert, true);

  // Para personal, incluye C1 • Edif. L que aún tiene lugares libres y baja la ocupación total < 100%
  const staffC1 = getCampusMetrics(lots, "Campus 1", "staff");
  assert.equal(staffC1.lotCount, 3);
  assert.ok(staffC1.free > 0);
  assert.ok(staffC1.occupancy_ratio < 1);
  assert.ok(staffC1.occupancy_ratio < studentC1.occupancy_ratio);
});

test("getAlternativeZone sugiere zona hermana en micro, lote del mismo campus, respeta staff_only, cruza campus y maneja 100% global", () => {
  const lots = cloneLots();

  // (a) Vista micro en zona saturada C1N-Z4 dentro de C1 • Norte -> sugiere mejor zona hermana (C1N-Z2)
  const microAlt = getAlternativeZone({
    lots,
    currentLotId: "ITM-CAMPUS1-EST-NORTE",
    currentZoneId: "C1N-Z4",
    userRole: "student",
  });
  assert.equal(microAlt?.type, "zone");
  assert.equal(microAlt?.zoneId, "C1N-Z2");
  assert.equal(microAlt?.lotId, "ITM-CAMPUS1-EST-NORTE");
  assert.ok(microAlt.freeSpots > 0);

  // (b) Lote C1 • Norte saturado -> sugiere C1 • Sur (mismo campus, general), nunca C1 • Edif. L para estudiante
  const lotsNorthSaturated = lots.map((lot) =>
    lot.id === "ITM-CAMPUS1-EST-NORTE" ? applyFullOccupancySimulation(lot) : lot
  );
  const mesoAltStudent = getAlternativeZone({
    lots: lotsNorthSaturated,
    currentLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
  });
  assert.equal(mesoAltStudent?.type, "lot");
  assert.equal(mesoAltStudent?.lotId, "ITM-CAMPUS1-EST-SUR");
  assert.equal(mesoAltStudent?.sameCampus, true);

  // (c) Con Campus 1 general saturado: estudiante omite C1 • Edif. L y salta a C2 • Central
  const lotsC1GeneralFull = lots.map((lot) =>
    lot.campus === "Campus 1" && lot.access_type === "general"
      ? applyFullOccupancySimulation(lot)
      : lot
  );
  const crossCampusStudent = getAlternativeZone({
    lots: lotsC1GeneralFull,
    currentLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "student",
  });
  assert.equal(crossCampusStudent?.lotId, "ITM-CAMPUS2-EST-CENTRAL");
  assert.equal(crossCampusStudent?.sameCampus, false);

  // Personal sí puede recibir C1 • Edif. L dentro del mismo campus
  const sameCampusStaff = getAlternativeZone({
    lots: lotsC1GeneralFull,
    currentLotId: "ITM-CAMPUS1-EST-NORTE",
    userRole: "staff",
  });
  assert.equal(sameCampusStaff?.lotId, "ITM-CAMPUS1-EST-EDIF-L");
  assert.equal(sameCampusStaff?.sameCampus, true);

  // (d) Caso borde: 100% global -> null
  const lotsAllFull = lots.map((lot) => applyFullOccupancySimulation(lot));
  assert.equal(
    getAlternativeZone({
      lots: lotsAllFull,
      currentLotId: "ITM-CAMPUS1-EST-NORTE",
      userRole: "student",
    }),
    null
  );
  assert.equal(
    getAlternativeZone({
      lots: lotsAllFull,
      currentLotId: "ITM-CAMPUS1-EST-NORTE",
      userRole: "staff",
    }),
    null
  );
});

test("resolveActiveSaturationAlert prioriza zona, luego lote, luego campus y oculta bajo 90%", () => {
  const baseLots = cloneLots();
  const north = baseLots.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");

  // C1N-Z4 en datos demo tiene 11/12 ocupados (91.67%) -> dispara alerta en nivel micro
  const z4 = north.zones.find((z) => z.id === "C1N-Z4");
  const zoneAlert = resolveActiveSaturationAlert({
    lots: baseLots,
    activeLot: north,
    activeZone: z4,
    userRole: "student",
  });
  assert.equal(zoneAlert?.scope, "zone");
  assert.equal(zoneAlert?.status.level, "warning");
  assert.equal(zoneAlert?.alternative?.zoneId, "C1N-Z2");

  // En vista de lote normal (< 90%) sin zona seleccionada -> null
  assert.equal(
    resolveActiveSaturationAlert({
      lots: baseLots,
      activeLot: north,
      activeZone: null,
      userRole: "student",
    }),
    null
  );

  // Lote al >=90% -> scope lot warning
  const warnLots = baseLots.map((lot) =>
    lot.id === north.id ? applyHighOccupancySimulation(lot) : lot
  );
  const warnNorth = warnLots.find((l) => l.id === north.id);
  const lotWarning = resolveActiveSaturationAlert({
    lots: warnLots,
    activeLot: warnNorth,
    activeZone: null,
    userRole: "student",
  });
  assert.equal(lotWarning?.scope, "lot");
  assert.equal(lotWarning?.status.level, "warning");
  assert.equal(lotWarning?.status.title, "ESTACIONAMIENTO CASI LLENO");
  assert.equal(lotWarning?.alternative?.lotId, "ITM-CAMPUS1-EST-SUR");

  // Lote Norte bajo 90% (45/52 = 86.5%), pero Campus 1 agregado >= 90% (83/90 = 92.2%) por C1 • Sur al 100%
  const campusWarnLots = baseLots.map((lot) => {
    if (lot.id === "ITM-CAMPUS1-EST-NORTE") {
      return {
        ...lot,
        zones: lot.zones.map((z, idx) =>
          idx === 0 ? saturateZoneSpots(z, 7) : saturateZoneSpots(z, 0)
        ),
      };
    }
    if (lot.id === "ITM-CAMPUS1-EST-SUR") {
      return applyFullOccupancySimulation(lot);
    }
    return lot;
  });
  const northUnder90 = campusWarnLots.find((l) => l.id === north.id);
  const campusAlert = resolveActiveSaturationAlert({
    lots: campusWarnLots,
    activeLot: northUnder90,
    activeZone: null,
    userRole: "student",
  });
  assert.equal(campusAlert?.scope, "campus");
  assert.equal(campusAlert?.status.isVisible, true);
  assert.equal(campusAlert?.alternative?.lotId, "ITM-CAMPUS2-EST-CENTRAL");
});

test("shouldTriggerSaturationNotification solo dispara en escalamientos de umbral", () => {
  assert.equal(shouldTriggerSaturationNotification("normal", "warning"), true);
  assert.equal(shouldTriggerSaturationNotification("normal", "critical"), true);
  assert.equal(shouldTriggerSaturationNotification("warning", "critical"), true);

  // Ticks repetidos en el mismo nivel o descensos NO disparan notificación
  assert.equal(shouldTriggerSaturationNotification("normal", "normal"), false);
  assert.equal(shouldTriggerSaturationNotification("warning", "warning"), false);
  assert.equal(shouldTriggerSaturationNotification("critical", "critical"), false);
  assert.equal(shouldTriggerSaturationNotification("critical", "warning"), false);
  assert.equal(shouldTriggerSaturationNotification("warning", "normal"), false);
});

test("buildSaturationAlertAnnouncement redacta avisos de voz claros para >=90%, 100% y saturación global", () => {
  const warningVoice = buildSaturationAlertAnnouncement({
    status: getSaturationStatus({ occupancy_ratio: 0.94, free: 3, total_slots: 50 }),
    targetName: "C1 • Norte",
    alternative: { displayName: "C1 • Sur", freeSpots: 12 },
  });
  assert.match(warningVoice, /Estacionamiento casi lleno/i);
  assert.match(warningVoice, /94 por ciento/i);
  assert.match(warningVoice, /C1 • Sur/);

  const globalFullVoice = buildSaturationAlertAnnouncement({
    status: getSaturationStatus({ occupancy_ratio: 1, free: 0, total_slots: 50 }),
    targetName: "C1 • Norte",
    alternative: null,
  });
  assert.match(globalFullVoice, /Estacionamiento lleno/i);
  assert.match(globalFullVoice, /No hay cajones disponibles en el campus/i);
});
