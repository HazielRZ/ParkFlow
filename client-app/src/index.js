export {
  CAMPUS_LOTS,
  CAMPUS_ZONES,
  adaptFlatPolygonsToLot,
  groupSpotsByZone,
  computeZoneCounts,
  getLotMetrics,
  getBestZoneForLot,
  getNearestGeneralLot,
  getZoneTrafficLight,
  applyHighOccupancySimulation,
} from "./data/campusLots.js";
export {
  buildAvailabilityAnnouncement,
  speakAvailability,
  stopAvailabilitySpeech,
  isSpeechSupported,
} from "./utils/speechAvailability.js";
export { ZoneSchematicMap } from "./components/ZoneSchematicMap.jsx";
export {
  ParkingGrid,
  ParkingSvgMap,
  STATE_BADGE_COLORS,
  STATE_CONFIG,
} from "./components/ParkingGrid.jsx";
export {
  useParkingSocket,
  mergePolygonsById,
  computeMetricsFromPolygons,
  resolveDefaultWsUrl,
} from "./hooks/useParkingSocket.js";
export { DashboardView } from "./views/DashboardView.jsx";
