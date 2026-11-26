/**
 * Detección automática del turno en curso (RF-02).
 * Usa la hora local del dispositivo. Función pura y sin dependencias.
 *
 *  - Matutino:   06:50:00 inclusive  a  13:59:59
 *  - Vespertino: 14:00:00 inclusive  a  21:00:00 inclusive
 *  - Fuera de horario: "Sin turno activo"
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

export const SHIFT_MORNING = "Matutino";
export const SHIFT_AFTERNOON = "Vespertino";
export const SHIFT_NONE = "Sin turno activo";

const MORNING_START = 6 * 3600 + 50 * 60; // 06:50:00
const AFTERNOON_START = 14 * 3600; // 14:00:00
const AFTERNOON_END = 21 * 3600; // 21:00:00 (inclusive)

export function detectCurrentShift(date = new Date()) {
  const seconds =
    date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

  if (seconds >= MORNING_START && seconds < AFTERNOON_START) {
    return SHIFT_MORNING;
  }
  if (seconds >= AFTERNOON_START && seconds <= AFTERNOON_END) {
    return SHIFT_AFTERNOON;
  }
  return SHIFT_NONE;
}
