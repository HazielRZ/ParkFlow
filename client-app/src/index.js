export {
  ParkingGrid,
  ParkingSvgMap,
  CAMPUS_ZONES,
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
