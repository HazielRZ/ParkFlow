/**
 * Modelo jerárquico de estacionamientos, zonas y cajones reales del TecNM Campus Morelia (RNF-05 / INT-SW-01).
 * Estructura: lot -> zones[] -> spots[] + adaptador para listas planas de WebSocket.
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

const SATURATION_THRESHOLD = 0.9;

function buildSpot({
  polygonId,
  zoneId,
  slotName,
  state,
  confidence,
  iouRatio,
  vehicleType = null,
}) {
  return {
    polygon_id: polygonId,
    zone_id: zoneId,
    slot_name: slotName,
    state,
    confidence,
    iou_ratio: iouRatio,
    vehicle_type: state === "Libre" ? null : vehicleType || "car",
  };
}

/**
 * Genera cajones de demostración deterministas por zona (12 a 16 cajones)
 * respetando el contrato INT-SW-01 (Libre, En maniobra, Ocupado).
 */
function generateZoneSpots({
  zoneId,
  prefix,
  total,
  freeCount,
  maneuverCount,
  startNumber = 1,
  seedOffset = 0,
}) {
  const occupiedCount = Math.max(0, total - freeCount - maneuverCount);
  const vehicleCycle = ["car", "car", "truck", "motorcycle", "car", "bus"];
  const slots = [];

  // Distribución intercalada para que el croquis refleje ocupación realista
  const states = [];
  let f = freeCount;
  let m = maneuverCount;
  let o = occupiedCount;

  while (states.length < total) {
    if (f > 0) {
      states.push("Libre");
      f -= 1;
    }
    if (o > 0 && states.length < total) {
      states.push("Ocupado");
      o -= 1;
    }
    if (m > 0 && states.length < total) {
      states.push("En maniobra");
      m -= 1;
    }
    if (o > 0 && f === 0 && m === 0 && states.length < total) {
      states.push("Ocupado");
      o -= 1;
    }
  }

  for (let i = 0; i < total; i += 1) {
    const num = String(startNumber + i).padStart(2, "0");
    const state = states[i] || "Ocupado";
    const isFree = state === "Libre";
    const isManeuver = state === "En maniobra";

    slots.push(
      buildSpot({
        polygonId: `poly-${zoneId.toLowerCase()}-${num}`,
        zoneId,
        slotName: `${prefix}-${num}`,
        state,
        confidence: Number((0.88 + ((i + seedOffset) % 10) * 0.01).toFixed(2)),
        iouRatio: isFree
          ? Number((0.01 + (i % 5) * 0.01).toFixed(2))
          : isManeuver
            ? Number((0.29 + (i % 4) * 0.04).toFixed(2))
            : Number((0.74 + (i % 6) * 0.03).toFixed(2)),
        vehicleType: isFree
          ? null
          : vehicleCycle[(i + seedOffset) % vehicleCycle.length],
      })
    );
  }

  return slots;
}

export function computeZoneCounts(spots = []) {
  const totalCount = spots.length;
  const freeCount = spots.filter((s) => s.state === "Libre").length;
  const maneuverCount = spots.filter((s) => s.state === "En maniobra").length;
  const occupiedCount = spots.filter((s) => s.state === "Ocupado").length;
  const occupancyRatio =
    totalCount > 0 ? Number((occupiedCount / totalCount).toFixed(4)) : 0;

  return {
    free_count: freeCount,
    maneuver_count: maneuverCount,
    occupied_count: occupiedCount,
    total_count: totalCount,
    occupancy_ratio: occupancyRatio,
  };
}

function hydrateZone(zoneConfig) {
  const spots = zoneConfig.spots.map((spot) => ({
    ...spot,
    zone_id: spot.zone_id || zoneConfig.id,
  }));
  return {
    ...zoneConfig,
    spots,
    ...computeZoneCounts(spots),
  };
}

export function getZoneTrafficLight(zone) {
  if (!zone) {
    return "full";
  }
  const occupancyRatio =
    typeof zone.occupancy_ratio === "number"
      ? zone.occupancy_ratio
      : zone.total_count > 0
        ? zone.occupied_count / zone.total_count
        : 1;

  if (occupancyRatio >= SATURATION_THRESHOLD || zone.free_count === 0) {
    return "full";
  }
  if (zone.free_count <= 3 || occupancyRatio >= 0.7) {
    return "limited";
  }
  return "available";
}

export function getLotMetrics(lot) {
  const zones = Array.isArray(lot?.zones) ? lot.zones : [];
  let totalSlots = 0;
  let free = 0;
  let occupied = 0;
  let inManeuver = 0;

  for (const zone of zones) {
    const counts =
      typeof zone.total_count === "number"
        ? zone
        : computeZoneCounts(zone.spots || []);
    totalSlots += counts.total_count;
    free += counts.free_count;
    occupied += counts.occupied_count;
    inManeuver += counts.maneuver_count;
  }

  const occupancyRatio =
    totalSlots > 0 ? Number((occupied / totalSlots).toFixed(4)) : 0;

  return {
    total_slots: totalSlots,
    free,
    occupied,
    in_maneuver: inManeuver,
    occupancy_ratio: occupancyRatio,
    high_occupancy_alert: occupancyRatio >= SATURATION_THRESHOLD,
  };
}

export function getBestZoneForLot(lot) {
  const zones = Array.isArray(lot?.zones) ? lot.zones : [];
  if (zones.length === 0) {
    return null;
  }

  return [...zones].sort((a, b) => {
    if (b.free_count !== a.free_count) {
      return b.free_count - a.free_count;
    }
    const ratioA = a.occupancy_ratio ?? 1;
    const ratioB = b.occupancy_ratio ?? 1;
    if (ratioA !== ratioB) {
      return ratioA - ratioB;
    }
    return (b.maneuver_count || 0) - (a.maneuver_count || 0);
  })[0];
}

export function getNearestGeneralLot(lots = [], currentLotId = null) {
  const currentLot = lots.find((l) => l.id === currentLotId) || null;
  const candidates = lots.filter(
    (lot) => lot.id !== currentLotId && lot.access_type === "general"
  );
  if (candidates.length === 0) {
    return null;
  }

  const ranked = candidates
    .map((lot) => ({
      lot,
      metrics: getLotMetrics(lot),
      sameCampus: currentLot ? lot.campus === currentLot.campus : false,
    }))
    .sort((a, b) => {
      const aHasFree = a.metrics.free > 0 ? 1 : 0;
      const bHasFree = b.metrics.free > 0 ? 1 : 0;
      if (a.sameCampus !== b.sameCampus) {
        return a.sameCampus ? -1 : 1;
      }
      if (bHasFree !== aHasFree) {
        return bHasFree - aHasFree;
      }
      return b.metrics.free - a.metrics.free;
    });

  return ranked[0]?.lot || null;
}

export function applyHighOccupancySimulation(lot) {
  if (!lot) {
    return lot;
  }
  let keptOneFree = false;
  const simulatedZones = (lot.zones || []).map((zone) => {
    const total = zone.spots.length;
    const canKeepOne = !keptOneFree && total > 0 && (total - 1) / total >= SATURATION_THRESHOLD;
    if (canKeepOne) {
      keptOneFree = true;
    }
    const spots = zone.spots.map((spot, idx) => {
      if (canKeepOne && idx === 0) {
        return {
          ...spot,
          state: "Libre",
          vehicle_type: null,
          iou_ratio: 0.03,
          confidence: 0.96,
        };
      }
      return {
        ...spot,
        state: "Ocupado",
        vehicle_type: spot.vehicle_type || "car",
        iou_ratio: 0.85,
        confidence: 0.95,
      };
    });
    return {
      ...zone,
      spots,
      ...computeZoneCounts(spots),
    };
  });

  return {
    ...lot,
    zones: simulatedZones,
  };
}

export function groupSpotsByZone(flatSpots = [], zoneTemplates = []) {
  const buckets = new Map();
  const templateById = new Map();
  const zoneIdByPolygonId = new Map();
  const zoneIdByCameraId = new Map();

  for (const tpl of zoneTemplates) {
    templateById.set(tpl.id, tpl);
    buckets.set(tpl.id, []);
    if (tpl.camera_id) {
      zoneIdByCameraId.set(tpl.camera_id, tpl.id);
    }
    for (const spot of tpl.spots || []) {
      if (spot.polygon_id) {
        zoneIdByPolygonId.set(spot.polygon_id, tpl.id);
      }
    }
  }

  const dynamicMeta = new Map();

  for (const rawSpot of flatSpots) {
    if (!rawSpot || !rawSpot.polygon_id) {
      continue;
    }

    let targetZoneId = null;

    if (rawSpot.zone_id) {
      targetZoneId = rawSpot.zone_id;
    } else if (zoneIdByPolygonId.has(rawSpot.polygon_id)) {
      targetZoneId = zoneIdByPolygonId.get(rawSpot.polygon_id);
    } else if (rawSpot.camera_id && zoneIdByCameraId.has(rawSpot.camera_id)) {
      targetZoneId = zoneIdByCameraId.get(rawSpot.camera_id);
    } else {
      const normalizedPoly = String(rawSpot.polygon_id).toLowerCase();
      const matchedTpl = zoneTemplates.find((tpl) => {
        const normZone = tpl.id.toLowerCase();
        return (
          normalizedPoly.includes(normZone) ||
          normalizedPoly.includes(normZone.replace(/-/g, ""))
        );
      });
      if (matchedTpl) {
        targetZoneId = matchedTpl.id;
      } else if (zoneTemplates.length > 0) {
        targetZoneId = zoneTemplates[0].id;
      } else {
        targetZoneId = "ZONA-1";
      }
    }

    if (!buckets.has(targetZoneId)) {
      buckets.set(targetZoneId, []);
      dynamicMeta.set(targetZoneId, {
        id: targetZoneId,
        shortLabel: targetZoneId,
        camera_id: rawSpot.camera_id || null,
        name: rawSpot.zone_name || `Zona ${targetZoneId}`,
        landmark: rawSpot.landmark || "Sector conectado en vivo",
        layout_slot: "center",
        laneLabel: "ENTRADA ITM",
      });
    }

    buckets.get(targetZoneId).push({
      ...rawSpot,
      zone_id: targetZoneId,
    });
  }

  const zones = [];
  for (const [zoneId, spots] of buckets.entries()) {
    const base = templateById.get(zoneId) || dynamicMeta.get(zoneId);
    zones.push({
      ...base,
      spots,
      ...computeZoneCounts(spots),
    });
  }

  return zones;
}

export function adaptFlatPolygonsToLot(lotTemplate, flatPolygons = []) {
  if (!lotTemplate) {
    return null;
  }
  if (!Array.isArray(flatPolygons) || flatPolygons.length === 0) {
    return {
      ...lotTemplate,
      zones: (lotTemplate.zones || []).map((z) => ({
        ...z,
        ...computeZoneCounts(z.spots || []),
      })),
    };
  }
  return {
    ...lotTemplate,
    zones: groupSpotsByZone(flatPolygons, lotTemplate.zones || []),
  };
}

export const CAMPUS_LOTS = [
  {
    id: "ITM-CAMPUS1-EST-NORTE",
    shortName: "C1 • Norte",
    name: "Campus 1 — Estacionamiento Norte",
    accessLabel: "Caseta Principal / C. Raza Maya",
    campus: "Campus 1",
    layout_type: "l_shape",
    access_type: "general",
    zones: [
      hydrateZone({
        id: "C1N-Z1",
        shortLabel: "Raza Maya",
        camera_id: "e6f4776b-3122-4a0b-857e-3c22db92dcb1",
        name: "Acceso Raza Maya",
        landmark: "Frente a Edif. CH • Caseta",
        layout_slot: "top",
        laneLabel: "CASETA RAZA MAYA",
        // Conserva los 12 polygon_id originales para compatibilidad con CV/backend
        spots: [
          buildSpot({ polygonId: "poly-itm-a01", zoneId: "C1N-Z1", slotName: "A-01", state: "Libre", confidence: 0.96, iouRatio: 0.04 }),
          buildSpot({ polygonId: "poly-itm-a02", zoneId: "C1N-Z1", slotName: "A-02", state: "Ocupado", confidence: 0.94, iouRatio: 0.78, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-itm-a03", zoneId: "C1N-Z1", slotName: "A-03", state: "Libre", confidence: 0.97, iouRatio: 0.02 }),
          buildSpot({ polygonId: "poly-itm-a04", zoneId: "C1N-Z1", slotName: "A-04", state: "Ocupado", confidence: 0.91, iouRatio: 0.81, vehicleType: "truck" }),
          buildSpot({ polygonId: "poly-itm-b01", zoneId: "C1N-Z1", slotName: "B-01", state: "En maniobra", confidence: 0.88, iouRatio: 0.36, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-itm-b02", zoneId: "C1N-Z1", slotName: "B-02", state: "Libre", confidence: 0.95, iouRatio: 0.05 }),
          buildSpot({ polygonId: "poly-itm-b03", zoneId: "C1N-Z1", slotName: "B-03", state: "Ocupado", confidence: 0.93, iouRatio: 0.74, vehicleType: "motorcycle" }),
          buildSpot({ polygonId: "poly-itm-b04", zoneId: "C1N-Z1", slotName: "B-04", state: "Libre", confidence: 0.98, iouRatio: 0.01 }),
          buildSpot({ polygonId: "poly-itm-001", zoneId: "C1N-Z1", slotName: "C-01", state: "En maniobra", confidence: 0.89, iouRatio: 0.38, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-itm-002", zoneId: "C1N-Z1", slotName: "C-02", state: "Ocupado", confidence: 0.95, iouRatio: 0.84, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-itm-003", zoneId: "C1N-Z1", slotName: "C-03", state: "Libre", confidence: 0.96, iouRatio: 0.03 }),
          buildSpot({ polygonId: "poly-itm-004", zoneId: "C1N-Z1", slotName: "C-04", state: "Ocupado", confidence: 0.92, iouRatio: 0.79, vehicleType: "car" }),
        ],
      }),
      hydrateZone({
        id: "C1N-Z2",
        shortLabel: "Pasillo Oeste",
        camera_id: "e6f4776b-3122-4a0b-857e-3c22db92dcb2",
        name: "Pasillo Oeste",
        landmark: "Edif. CH / Edif. C",
        layout_slot: "left",
        laneLabel: "PASILLO OESTE",
        spots: generateZoneSpots({
          zoneId: "C1N-Z2",
          prefix: "O",
          total: 14,
          freeCount: 8,
          maneuverCount: 2,
          seedOffset: 1,
        }),
      }),
      hydrateZone({
        id: "C1N-Z3",
        shortLabel: "Pasillo Este",
        camera_id: "e6f4776b-3122-4a0b-857e-3c22db92dcb3",
        name: "Pasillo Este",
        landmark: "Edif. AG / Estadio",
        layout_slot: "right",
        laneLabel: "PASILLO ESTE",
        spots: generateZoneSpots({
          zoneId: "C1N-Z3",
          prefix: "E",
          total: 14,
          freeCount: 3,
          maneuverCount: 1,
          seedOffset: 3,
        }),
      }),
      hydrateZone({
        id: "C1N-Z4",
        shortLabel: "Fondo Sur",
        camera_id: "e6f4776b-3122-4a0b-857e-3c22db92dcb4",
        name: "Fondo Sur",
        landmark: "Edif. E / Canchas",
        layout_slot: "bottom",
        laneLabel: "FONDO SUR",
        spots: generateZoneSpots({
          zoneId: "C1N-Z4",
          prefix: "F",
          total: 12,
          freeCount: 1,
          maneuverCount: 0,
          seedOffset: 5,
        }),
      }),
    ],
  },
  {
    id: "ITM-CAMPUS1-EST-SUR",
    shortName: "C1 • Sur",
    name: "Campus 1 — Estacionamiento Sur",
    accessLabel: "Perif. Revolución / Auditorio",
    campus: "Campus 1",
    layout_type: "linear",
    access_type: "general",
    zones: [
      hydrateZone({
        id: "C1S-Z1",
        shortLabel: "Auditorio",
        camera_id: "b4c9210a-5122-4a0b-857e-3c22db92dc01",
        name: "Auditorio Heber Soto",
        landmark: "Gimnasio Pony • Escaleras",
        layout_slot: "west",
        laneLabel: "ACCESO AUDITORIO",
        spots: [
          buildSpot({ polygonId: "poly-sur-d01", zoneId: "C1S-Z1", slotName: "D-01", state: "Ocupado", confidence: 0.95, iouRatio: 0.82, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-sur-d02", zoneId: "C1S-Z1", slotName: "D-02", state: "Ocupado", confidence: 0.93, iouRatio: 0.77, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-sur-d03", zoneId: "C1S-Z1", slotName: "D-03", state: "Libre", confidence: 0.97, iouRatio: 0.03 }),
          buildSpot({ polygonId: "poly-sur-d04", zoneId: "C1S-Z1", slotName: "D-04", state: "En maniobra", confidence: 0.86, iouRatio: 0.34, vehicleType: "truck" }),
          buildSpot({ polygonId: "poly-sur-e01", zoneId: "C1S-Z1", slotName: "E-01", state: "Libre", confidence: 0.96, iouRatio: 0.04 }),
          buildSpot({ polygonId: "poly-sur-e02", zoneId: "C1S-Z1", slotName: "E-02", state: "Ocupado", confidence: 0.91, iouRatio: 0.75, vehicleType: "motorcycle" }),
          buildSpot({ polygonId: "poly-sur-e03", zoneId: "C1S-Z1", slotName: "E-03", state: "Libre", confidence: 0.98, iouRatio: 0.02 }),
          buildSpot({ polygonId: "poly-sur-e04", zoneId: "C1S-Z1", slotName: "E-04", state: "Libre", confidence: 0.95, iouRatio: 0.05 }),
          buildSpot({ polygonId: "poly-sur-d05", zoneId: "C1S-Z1", slotName: "D-05", state: "Libre", confidence: 0.96, iouRatio: 0.02 }),
          buildSpot({ polygonId: "poly-sur-d06", zoneId: "C1S-Z1", slotName: "D-06", state: "Ocupado", confidence: 0.92, iouRatio: 0.79, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-sur-e05", zoneId: "C1S-Z1", slotName: "E-05", state: "Libre", confidence: 0.97, iouRatio: 0.03 }),
          buildSpot({ polygonId: "poly-sur-e06", zoneId: "C1S-Z1", slotName: "E-06", state: "Ocupado", confidence: 0.94, iouRatio: 0.81, vehicleType: "car" }),
        ],
      }),
      hydrateZone({
        id: "C1S-Z2",
        shortLabel: "Corredor Central",
        camera_id: "b4c9210a-5122-4a0b-857e-3c22db92dc02",
        name: "Corredor Central",
        landmark: "Edif. AC / AD • Periférico",
        layout_slot: "center",
        laneLabel: "CORREDOR CENTRAL",
        spots: generateZoneSpots({
          zoneId: "C1S-Z2",
          prefix: "M",
          total: 14,
          freeCount: 4,
          maneuverCount: 2,
          seedOffset: 2,
        }),
      }),
      hydrateZone({
        id: "C1S-Z3",
        shortLabel: "Extremo Este",
        camera_id: "b4c9210a-5122-4a0b-857e-3c22db92dc03",
        name: "Extremo Este",
        landmark: "Talleres / Fondo",
        layout_slot: "east",
        laneLabel: "EXTREMO ESTE",
        spots: generateZoneSpots({
          zoneId: "C1S-Z3",
          prefix: "T",
          total: 12,
          freeCount: 2,
          maneuverCount: 1,
          seedOffset: 4,
        }),
      }),
    ],
  },
  {
    id: "ITM-CAMPUS1-EST-EDIF-L",
    shortName: "C1 • Edif. L",
    name: "Campus 1 — Edificio L",
    accessLabel: "Av. Tecnológico • Solo personal",
    campus: "Campus 1",
    layout_type: "compact",
    access_type: "staff_only",
    zones: [
      hydrateZone({
        id: "C1L-Z1",
        shortLabel: "Norte Edif. L",
        camera_id: "d2e8451c-6122-4a0b-857e-3c22db92dc01",
        name: "Acceso Av. Tecnológico",
        landmark: "Frente a Edif. L • Sec. Norte",
        layout_slot: "north",
        laneLabel: "AV. TECNOLÓGICO",
        spots: generateZoneSpots({
          zoneId: "C1L-Z1",
          prefix: "L",
          total: 12,
          freeCount: 5,
          maneuverCount: 1,
          seedOffset: 1,
        }),
      }),
      hydrateZone({
        id: "C1L-Z2",
        shortLabel: "Sur Edif. L",
        camera_id: "d2e8451c-6122-4a0b-857e-3c22db92dc02",
        name: "Edif. L • Sección Sur",
        landmark: "Lateral Edif. L / Oficinas",
        layout_slot: "south",
        laneLabel: "SECCIÓN SUR L",
        spots: generateZoneSpots({
          zoneId: "C1L-Z2",
          prefix: "LS",
          total: 12,
          freeCount: 3,
          maneuverCount: 1,
          seedOffset: 3,
        }),
      }),
    ],
  },
  {
    id: "ITM-CAMPUS2-EST-CENTRAL",
    shortName: "C2 • Central",
    name: "Campus 2 — Estacionamiento Central",
    accessLabel: "Acceso Principal Campus 2",
    campus: "Campus 2",
    layout_type: "linear",
    access_type: "general",
    zones: [
      hydrateZone({
        id: "C2C-Z1",
        shortLabel: "Acceso C2",
        camera_id: "c9a7123d-7122-4a0b-857e-3c22db92dc01",
        name: "Acceso Principal",
        landmark: "Caseta C2 / Edif. A",
        layout_slot: "west",
        laneLabel: "CASETA CAMPUS 2",
        spots: [
          buildSpot({ polygonId: "poly-c2-n01", zoneId: "C2C-Z1", slotName: "N-01", state: "Libre", confidence: 0.97, iouRatio: 0.02 }),
          buildSpot({ polygonId: "poly-c2-n02", zoneId: "C2C-Z1", slotName: "N-02", state: "Libre", confidence: 0.96, iouRatio: 0.04 }),
          buildSpot({ polygonId: "poly-c2-n03", zoneId: "C2C-Z1", slotName: "N-03", state: "Ocupado", confidence: 0.92, iouRatio: 0.79, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-c2-n04", zoneId: "C2C-Z1", slotName: "N-04", state: "Libre", confidence: 0.98, iouRatio: 0.01 }),
          buildSpot({ polygonId: "poly-c2-s01", zoneId: "C2C-Z1", slotName: "S-01", state: "En maniobra", confidence: 0.87, iouRatio: 0.31, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-c2-s02", zoneId: "C2C-Z1", slotName: "S-02", state: "Ocupado", confidence: 0.94, iouRatio: 0.83, vehicleType: "bus" }),
          buildSpot({ polygonId: "poly-c2-s03", zoneId: "C2C-Z1", slotName: "S-03", state: "Libre", confidence: 0.95, iouRatio: 0.06 }),
          buildSpot({ polygonId: "poly-c2-s04", zoneId: "C2C-Z1", slotName: "S-04", state: "Libre", confidence: 0.97, iouRatio: 0.02 }),
          buildSpot({ polygonId: "poly-c2-n05", zoneId: "C2C-Z1", slotName: "N-05", state: "Libre", confidence: 0.96, iouRatio: 0.03 }),
          buildSpot({ polygonId: "poly-c2-n06", zoneId: "C2C-Z1", slotName: "N-06", state: "Ocupado", confidence: 0.93, iouRatio: 0.78, vehicleType: "car" }),
          buildSpot({ polygonId: "poly-c2-s05", zoneId: "C2C-Z1", slotName: "S-05", state: "Libre", confidence: 0.95, iouRatio: 0.04 }),
          buildSpot({ polygonId: "poly-c2-s06", zoneId: "C2C-Z1", slotName: "S-06", state: "Ocupado", confidence: 0.91, iouRatio: 0.76, vehicleType: "truck" }),
        ],
      }),
      hydrateZone({
        id: "C2C-Z2",
        shortLabel: "Pasillo Central",
        camera_id: "c9a7123d-7122-4a0b-857e-3c22db92dc02",
        name: "Pasillo Central",
        landmark: "Laboratorios / Edif. B",
        layout_slot: "center",
        laneLabel: "PASILLO CENTRAL C2",
        spots: generateZoneSpots({
          zoneId: "C2C-Z2",
          prefix: "P",
          total: 12,
          freeCount: 5,
          maneuverCount: 1,
          seedOffset: 2,
        }),
      }),
      hydrateZone({
        id: "C2C-Z3",
        shortLabel: "Zona Poniente",
        camera_id: "c9a7123d-7122-4a0b-857e-3c22db92dc03",
        name: "Zona Poniente",
        landmark: "Biblioteca / Explanada",
        layout_slot: "east",
        laneLabel: "ZONA PONIENTE C2",
        spots: generateZoneSpots({
          zoneId: "C2C-Z3",
          prefix: "Z",
          total: 12,
          freeCount: 2,
          maneuverCount: 1,
          seedOffset: 5,
        }),
      }),
    ],
  },
];

// Export retrocompatible aplanado para módulos heredados
export const CAMPUS_ZONES = CAMPUS_LOTS.map((lot) => ({
  id: lot.id,
  shortName: lot.shortName,
  name: lot.name,
  access_type: lot.access_type,
  bays: lot.zones.map((z) => z.name),
  defaultSlots: lot.zones.flatMap((z) => z.spots),
}));
