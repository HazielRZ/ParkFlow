import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPUS_LOTS,
  adaptFlatPolygonsToLot,
  applyHighOccupancySimulation,
  computeZoneCounts,
  getBestZoneForLot,
  getLotMetrics,
  getNearestGeneralLot,
  getZoneTrafficLight,
  groupSpotsByZone,
} from "../src/data/campusLots.js";
import { buildAvailabilityAnnouncement } from "../src/utils/speechAvailability.js";

const ALLOWED_STATES = new Set(["Libre", "Ocupado", "En maniobra"]);
const ALLOWED_VEHICLES = new Set(["car", "truck", "motorcycle", "bus", null]);

test("CAMPUS_LOTS define los 4 estacionamientos con 12 a 16 cajones por zona y estados INT-SW-01 válidos", () => {
  assert.equal(CAMPUS_LOTS.length, 4);

  const byId = new Map(CAMPUS_LOTS.map((lot) => [lot.id, lot]));
  assert.equal(byId.get("ITM-CAMPUS1-EST-NORTE")?.layout_type, "l_shape");
  assert.equal(byId.get("ITM-CAMPUS1-EST-NORTE")?.access_type, "general");
  assert.equal(byId.get("ITM-CAMPUS1-EST-SUR")?.layout_type, "linear");
  assert.equal(byId.get("ITM-CAMPUS1-EST-EDIF-L")?.access_type, "staff_only");
  assert.equal(byId.get("ITM-CAMPUS2-EST-CENTRAL")?.access_type, "general");

  for (const lot of CAMPUS_LOTS) {
    assert.ok(lot.zones.length >= 2, `${lot.id} debe tener al menos 2 zonas`);
    for (const zone of lot.zones) {
      assert.ok(zone.camera_id, `${zone.id} requiere camera_id`);
      assert.ok(zone.landmark, `${zone.id} requiere landmark`);
      assert.ok(
        zone.spots.length >= 12 && zone.spots.length <= 16,
        `${zone.id} tiene ${zone.spots.length} cajones (esperado 12–16)`
      );

      for (const spot of zone.spots) {
        assert.ok(ALLOWED_STATES.has(spot.state), `Estado inválido: ${spot.state}`);
        assert.ok(
          ALLOWED_VEHICLES.has(spot.vehicle_type),
          `Vehículo inválido: ${spot.vehicle_type}`
        );
      }

      const counts = computeZoneCounts(zone.spots);
      assert.equal(zone.free_count, counts.free_count);
      assert.equal(zone.maneuver_count, counts.maneuver_count);
      assert.equal(zone.occupied_count, counts.occupied_count);
      assert.equal(zone.total_count, counts.total_count);
    }
  }
});

test("groupSpotsByZone y adaptFlatPolygonsToLot agrupan listas planas por zone_id, polygon_id y camera_id", () => {
  const northLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");

  const flatIncoming = [
    // 1. Por zone_id explícito (incluso en zona dinámica)
    {
      polygon_id: "poly-dyn-1",
      zone_id: "C1N-Z2",
      slot_name: "O-99",
      state: "Libre",
      confidence: 0.96,
      iou_ratio: 0.02,
      vehicle_type: null,
    },
    // 2. Por coincidencia de polygon_id existente en C1N-Z1
    {
      polygon_id: "poly-itm-a01",
      slot_name: "A-01",
      state: "Ocupado",
      confidence: 0.94,
      iou_ratio: 0.82,
      vehicle_type: "car",
    },
    // 3. Por coincidencia de camera_id con C1N-Z3
    {
      polygon_id: "poly-ws-cam3-01",
      camera_id: northLot.zones[2].camera_id,
      slot_name: "E-99",
      state: "En maniobra",
      confidence: 0.89,
      iou_ratio: 0.37,
      vehicle_type: "car",
    },
  ];

  const adapted = adaptFlatPolygonsToLot(northLot, flatIncoming);
  const z1 = adapted.zones.find((z) => z.id === "C1N-Z1");
  const z2 = adapted.zones.find((z) => z.id === "C1N-Z2");
  const z3 = adapted.zones.find((z) => z.id === "C1N-Z3");

  assert.equal(z1.occupied_count, 1);
  assert.equal(z1.total_count, 1);
  assert.equal(z2.free_count, 1);
  assert.equal(z2.total_count, 1);
  assert.equal(z3.maneuver_count, 1);
  assert.equal(z3.total_count, 1);

  // Zona dinámica si llega un zone_id desconocido
  const dynamicZones = groupSpotsByZone(
    [
      {
        polygon_id: "poly-extra-1",
        zone_id: "ZONA-EXTRA",
        slot_name: "X-01",
        state: "Libre",
        confidence: 0.95,
        iou_ratio: 0.03,
        vehicle_type: null,
      },
    ],
    northLot.zones
  );
  const extra = dynamicZones.find((z) => z.id === "ZONA-EXTRA");
  assert.ok(extra);
  assert.equal(extra.free_count, 1);
});

test("getZoneTrafficLight clasifica semáforo verde, ámbar y rojo (>=90% o 0 libres)", () => {
  assert.equal(
    getZoneTrafficLight({
      free_count: 8,
      occupied_count: 4,
      total_count: 14,
      occupancy_ratio: 0.2857,
    }),
    "available"
  );
  assert.equal(
    getZoneTrafficLight({
      free_count: 3,
      occupied_count: 10,
      total_count: 14,
      occupancy_ratio: 0.7143,
    }),
    "limited"
  );
  assert.equal(
    getZoneTrafficLight({
      free_count: 1,
      occupied_count: 11,
      total_count: 12,
      occupancy_ratio: 0.9167,
    }),
    "full"
  );
  assert.equal(
    getZoneTrafficLight({
      free_count: 0,
      occupied_count: 8,
      total_count: 12,
      occupancy_ratio: 0.6667,
    }),
    "full"
  );
});

test("applyHighOccupancySimulation fuerza ocupación >= 90% y dispara alerta RF-04", () => {
  for (const lot of CAMPUS_LOTS) {
    const saturated = applyHighOccupancySimulation(lot);
    const metrics = getLotMetrics(saturated);
    assert.equal(metrics.high_occupancy_alert, true);
    assert.ok(
      metrics.occupancy_ratio >= 0.9,
      `${lot.id} tuvo ocupación ${metrics.occupancy_ratio}`
    );
    for (const zone of saturated.zones) {
      assert.equal(getZoneTrafficLight(zone), "full");
    }
  }
});

test("getBestZoneForLot elige la zona con más libres y getNearestGeneralLot redirige desde C1 • Edif. L", () => {
  const northLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");
  const bestNorth = getBestZoneForLot(northLot);
  assert.equal(bestNorth?.id, "C1N-Z2");
  assert.equal(bestNorth?.free_count, 8);

  const staffLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-EDIF-L");
  const suggested = getNearestGeneralLot(CAMPUS_LOTS, staffLot.id);
  assert.ok(suggested);
  assert.equal(suggested.access_type, "general");
  assert.equal(suggested.campus, "Campus 1");
  assert.equal(suggested.id, "ITM-CAMPUS1-EST-NORTE");
});

test("buildAvailabilityAnnouncement genera mensajes claros en español para normal, restricción y saturación", () => {
  const northLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-NORTE");
  const northMetrics = getLotMetrics(northLot);
  const northBest = getBestZoneForLot(northLot);

  const normalText = buildAvailabilityAnnouncement({
    lot: northLot,
    lotMetrics: northMetrics,
    bestZone: northBest,
    userRole: "student",
  });
  assert.match(normalText, /Estacionamiento Norte/);
  assert.match(normalText, new RegExp(`${northMetrics.free} cajones libres`));
  assert.match(normalText, /Pasillo Oeste/);

  const staffLot = CAMPUS_LOTS.find((l) => l.id === "ITM-CAMPUS1-EST-EDIF-L");
  const suggested = getNearestGeneralLot(CAMPUS_LOTS, staffLot.id);
  const restrictedText = buildAvailabilityAnnouncement({
    lot: staffLot,
    lotMetrics: getLotMetrics(staffLot),
    bestZone: getBestZoneForLot(staffLot),
    userRole: "student",
    suggestedGeneralLot: suggested,
  });
  assert.match(restrictedText, /exclusivo para personal/i);
  assert.match(restrictedText, /Estacionamiento Norte/);

  const saturatedLot = applyHighOccupancySimulation(northLot);
  const saturatedText = buildAvailabilityAnnouncement({
    lot: saturatedLot,
    lotMetrics: getLotMetrics(saturatedLot),
    bestZone: getBestZoneForLot(saturatedLot),
    userRole: "student",
    suggestedGeneralLot: CAMPUS_LOTS.find(
      (l) => l.id === "ITM-CAMPUS1-EST-SUR"
    ),
  });
  assert.match(saturatedText, /Alerta/);
  assert.match(saturatedText, /por ciento/);
});
