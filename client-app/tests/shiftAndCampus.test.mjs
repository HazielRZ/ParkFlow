import test from "node:test";
import assert from "node:assert/strict";

import { CAMPUS_LOTS } from "../src/data/campusLots.js";
import {
  SHIFT_AFTERNOON,
  SHIFT_MORNING,
  SHIFT_NONE,
  detectCurrentShift,
} from "../src/utils/shiftDetection.js";
import {
  CAMPUS_STORAGE_KEY,
  DEFAULT_CAMPUS,
  filterLotsByCampus,
  readStoredCampus,
  storeCampus,
} from "../src/utils/campusPreference.js";

const at = (h, m, s = 0) => new Date(2026, 10, 18, h, m, s);

test("detectCurrentShift respeta los límites exactos de horario", () => {
  assert.equal(detectCurrentShift(at(6, 49, 59)), SHIFT_NONE);
  assert.equal(detectCurrentShift(at(6, 50, 0)), SHIFT_MORNING);
  assert.equal(detectCurrentShift(at(13, 59, 59)), SHIFT_MORNING);
  assert.equal(detectCurrentShift(at(14, 0, 0)), SHIFT_AFTERNOON);
  assert.equal(detectCurrentShift(at(21, 0, 0)), SHIFT_AFTERNOON);
  assert.equal(detectCurrentShift(at(21, 0, 1)), SHIFT_NONE);
});

test("detectCurrentShift cubre madrugada y medianoche", () => {
  assert.equal(detectCurrentShift(at(0, 0, 0)), SHIFT_NONE);
  assert.equal(detectCurrentShift(at(23, 59, 59)), SHIFT_NONE);
  assert.equal(detectCurrentShift(at(7, 0)), SHIFT_MORNING);
});

test("filterLotsByCampus devuelve 3 estacionamientos para Campus 1 y 1 para Campus 2", () => {
  const c1 = filterLotsByCampus(CAMPUS_LOTS, "Campus 1");
  const c2 = filterLotsByCampus(CAMPUS_LOTS, "Campus 2");

  assert.deepEqual(
    c1.map((lot) => lot.id),
    [
      "ITM-CAMPUS1-EST-NORTE",
      "ITM-CAMPUS1-EST-SUR",
      "ITM-CAMPUS1-EST-EDIF-L",
    ]
  );
  assert.deepEqual(
    c2.map((lot) => lot.id),
    ["ITM-CAMPUS2-EST-CENTRAL"]
  );
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

test("la preferencia de campus se guarda y se recupera", () => {
  const storage = fakeStorage();
  assert.equal(readStoredCampus(storage), DEFAULT_CAMPUS);
  assert.equal(storeCampus("Campus 2", storage), true);
  assert.equal(storage.getItem(CAMPUS_STORAGE_KEY), "Campus 2");
  assert.equal(readStoredCampus(storage), "Campus 2");
});

test("la preferencia cae a Campus 1 con valores inválidos o storage con fallas", () => {
  assert.equal(
    readStoredCampus(fakeStorage({ [CAMPUS_STORAGE_KEY]: "Campus 9" })),
    DEFAULT_CAMPUS
  );
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readStoredCampus(broken), DEFAULT_CAMPUS);
  assert.equal(storeCampus("Campus 2", broken), false);
  assert.equal(storeCampus("Campus 9", fakeStorage()), false);
  assert.equal(readStoredCampus(null), DEFAULT_CAMPUS);
});
