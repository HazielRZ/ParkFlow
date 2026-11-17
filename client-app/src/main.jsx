/**
 * Punto de entrada móvil/PWA de ParkFlow (/client-app — PF-19).
 * Licencia: PolyForm Noncommercial License 1.0.0
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { DashboardView } from "./views/DashboardView.jsx";
import "./tokens.css";
import "./styles.css";

function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Fallo silencioso en entornos de desarrollo sin HTTPS
    });
  });
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <DashboardView />
    </React.StrictMode>
  );
}

registerServiceWorker();
