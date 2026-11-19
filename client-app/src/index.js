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
  buildGuidanceAnnouncement,
  speakAvailability,
  stopAvailabilitySpeech,
  isSpeechSupported,
} from "./utils/speechAvailability.js";
export {
  ASSIGNMENT_TTL_MS,
  ASSIGNMENT_WARNING_MS,
  ASSIGNMENT_CRITICAL_MS,
  getEligibleLots,
  selectBestSpotForAssignment,
  findSpotInLots,
  computeRemainingMs,
  getCountdownUrgency,
  formatCountdown,
  evaluateAssignmentSync,
  buildExternalMapLinks,
  buildGuidanceRoute,
} from "./utils/assignmentLogic.js";
export {
  ASSIGNMENT_STORAGE_KEY,
  resolveAssignmentApiUrl,
  loadActiveAssignment,
  saveActiveAssignment,
  clearActiveAssignment,
  requestParkingSpot,
  reassignParkingSpot,
  confirmAssignmentArrival,
  cancelParkingAssignment,
  expireParkingAssignment,
} from "./services/parkingAssignmentService.js";
export { ZoneSchematicMap } from "./components/ZoneSchematicMap.jsx";
export {
  ParkingGrid,
  ParkingSvgMap,
  STATE_BADGE_COLORS,
  STATE_CONFIG,
  computeCentralLaneSlotGeometry,
} from "./components/ParkingGrid.jsx";
export { SpotGuidanceView } from "./components/SpotGuidanceView.jsx";
export {
  useParkingSocket,
  mergePolygonsById,
  computeMetricsFromPolygons,
  resolveDefaultWsUrl,
} from "./hooks/useParkingSocket.js";
export {
  useParkingAssignment,
  applyDemoOccupiedOverrides,
} from "./hooks/useParkingAssignment.js";
export { DashboardView } from "./views/DashboardView.jsx";
