/**
 * Utilidad nativa de lectura por voz (Web Speech API en es-MX) para seguridad vial (Driver-First).
 * Sin dependencias externas (PolyForm Noncommercial License 1.0.0).
 */

import { getLotMetrics } from "../data/campusLots.js";

export function isSpeechSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

function resolveLotFreeCount(lotOrSummary) {
  if (!lotOrSummary) {
    return 0;
  }
  if (typeof lotOrSummary.free_count === "number") {
    return lotOrSummary.free_count;
  }
  if (typeof lotOrSummary.free === "number") {
    return lotOrSummary.free;
  }
  if (Array.isArray(lotOrSummary.zones)) {
    return getLotMetrics(lotOrSummary).free;
  }
  return 0;
}

export function buildAvailabilityAnnouncement({
  lot,
  lotMetrics,
  bestZone,
  userRole = "student",
  suggestedGeneralLot = null,
}) {
  if (!lot) {
    return "No hay información de estacionamiento disponible en este momento.";
  }

  const metrics = lotMetrics || getLotMetrics(lot);

  if (lot.access_type === "staff_only" && userRole === "student") {
    const altFree = resolveLotFreeCount(suggestedGeneralLot);
    if (suggestedGeneralLot) {
      return `${lot.name} es de acceso exclusivo para personal del I T M. Te recomendamos ${suggestedGeneralLot.name}, con ${altFree} ${altFree === 1 ? "cajón libre" : "cajones libres"}.`;
    }
    return `${lot.name} es de acceso exclusivo para personal del I T M. Selecciona un estacionamiento de acceso general.`;
  }

  const occupancyPct = Math.round((metrics.occupancy_ratio || 0) * 100);
  const altFree = resolveLotFreeCount(suggestedGeneralLot);

  if (metrics.high_occupancy_alert || metrics.free === 0) {
    const baseMsg = `Alerta en ${lot.name}: ${occupancyPct} por ciento de ocupación y ${metrics.free} ${metrics.free === 1 ? "cajón libre" : "cajones libres"}.`;
    if (bestZone && bestZone.free_count > 0) {
      return `${baseMsg} Zona con espacio: ${bestZone.name}, ${bestZone.landmark}, con ${bestZone.free_count} ${bestZone.free_count === 1 ? "lugar" : "lugares"}.`;
    }
    if (suggestedGeneralLot && altFree > 0) {
      return `${baseMsg} Alternativa recomendada: ${suggestedGeneralLot.name} con ${altFree} cajones libres.`;
    }
    return `${baseMsg} Se recomienda buscar un estacionamiento alterno.`;
  }

  const maneuverText =
    metrics.in_maneuver > 0
      ? ` y ${metrics.in_maneuver} en maniobra`
      : "";
  const bestZoneText = bestZone
    ? ` Mejor zona recomendada: ${bestZone.name}, ${bestZone.landmark}, con ${bestZone.free_count} ${bestZone.free_count === 1 ? "lugar libre" : "lugares libres"}.`
    : "";

  return `${lot.name}. ${metrics.free} ${metrics.free === 1 ? "cajón libre" : "cajones libres"}${maneuverText}.${bestZoneText}`;
}

export function buildGuidanceAnnouncement({
  assignment,
  route,
  remainingMs = 0,
  conflict = false,
} = {}) {
  if (!assignment) {
    return "No hay un cajón asignado en este momento.";
  }

  if (conflict) {
    return `Atención: la cámara detectó un vehículo ocupando el cajón ${assignment.slot_name} en ${assignment.zone_name}. Si ya te estacionaste, pulsa Ya me estacioné; de lo contrario, pulsa Reasignar otro lugar.`;
  }

  const mins = Math.max(1, Math.ceil((remainingMs || 0) / 60000));
  const minLabel = mins === 1 ? "1 minuto" : `${mins} minutos`;
  const lotLabel = assignment.lot_name || assignment.lot_short_name || "estacionamiento";
  const stepsText = Array.isArray(route?.steps) && route.steps.length > 0
    ? route.steps
        .map((step, idx) => `Paso ${idx + 1}: ${step.title}. ${step.description}`)
        .join(" ")
    : route?.summary || "";

  return `Cajón asignado ${assignment.slot_name} en ${lotLabel}, zona ${assignment.zone_name}. Tienes ${minLabel} antes de que caduque. ${stepsText}`.trim();
}

export function stopAvailabilitySpeech() {
  if (!isSpeechSupported()) {
    return;
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignorar errores en navegadores con síntesis bloqueada
  }
}

export function speakAvailability(
  text,
  { onStart, onEnd, onError } = {}
) {
  if (!isSpeechSupported() || !text) {
    if (onError) {
      onError(new Error("Web Speech API no disponible"));
    }
    return () => {};
  }

  const synth = window.speechSynthesis;
  stopAvailabilitySpeech();

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = "es-MX";
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  try {
    const voices = synth.getVoices ? synth.getVoices() : [];
    const mxVoice =
      voices.find((v) => v.lang && v.lang.toLowerCase() === "es-mx") ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("es"));
    if (mxVoice) {
      utterance.voice = mxVoice;
    }
  } catch {
    // Usar voz predeterminada del navegador
  }

  let finished = false;
  const finishOnce = (cb) => {
    if (!finished) {
      finished = true;
      if (cb) {
        cb();
      }
    }
  };

  utterance.onstart = () => {
    if (onStart) {
      onStart();
    }
  };
  utterance.onend = () => finishOnce(onEnd);
  utterance.onerror = (err) => finishOnce(() => onError && onError(err));

  try {
    if (onStart) {
      onStart();
    }
    synth.speak(utterance);
  } catch (err) {
    finishOnce(() => onError && onError(err));
  }

  return () => {
    finished = true;
    stopAvailabilitySpeech();
  };
}
