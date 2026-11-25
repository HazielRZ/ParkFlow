/**
 * Selector de campus y persistencia local de la preferencia (RF-02).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

export const CAMPUS_OPTIONS = ["Campus 1", "Campus 2"];
export const DEFAULT_CAMPUS = "Campus 1";
export const CAMPUS_STORAGE_KEY = "parkflow.selectedCampus";

function getDefaultStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Devuelve solo los estacionamientos del campus indicado. */
export function filterLotsByCampus(lots = [], campus = DEFAULT_CAMPUS) {
  return lots.filter((lot) => lot.campus === campus);
}

/** Lee el campus guardado; ante cualquier fallo o valor inválido usa "Campus 1". */
export function readStoredCampus(storage = getDefaultStorage()) {
  try {
    const value = storage?.getItem(CAMPUS_STORAGE_KEY);
    return CAMPUS_OPTIONS.includes(value) ? value : DEFAULT_CAMPUS;
  } catch {
    return DEFAULT_CAMPUS;
  }
}

/** Guarda el campus elegido. Devuelve true si se pudo persistir. */
export function storeCampus(campus, storage = getDefaultStorage()) {
  if (!CAMPUS_OPTIONS.includes(campus)) {
    return false;
  }
  try {
    storage?.setItem(CAMPUS_STORAGE_KEY, campus);
    return Boolean(storage);
  } catch {
    return false;
  }
}
