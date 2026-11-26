import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
  "http://localhost:8000";

function buildLocalFallbackReport({ fechaInicio, fechaFin, campus, turno }) {
  const c1 = campus === "CAMPUS-1";
  const c2 = campus === "CAMPUS-2";
  const cajones = c1 ? 180 : c2 ? 110 : 290;
  const baseHours = [
    { hora: "07:00", turno: "Matutino", ocupacion_pct: 58, vehiculos_estimados: Math.round(cajones * 0.58) },
    { hora: "09:00", turno: "Matutino", ocupacion_pct: 92, vehiculos_estimados: Math.round(cajones * 0.92) },
    { hora: "11:00", turno: "Matutino", ocupacion_pct: 86, vehiculos_estimados: Math.round(cajones * 0.86) },
    { hora: "13:00", turno: "Matutino", ocupacion_pct: 74, vehiculos_estimados: Math.round(cajones * 0.74) },
    { hora: "15:00", turno: "Vespertino", ocupacion_pct: 65, vehiculos_estimados: Math.round(cajones * 0.65) },
    { hora: "17:00", turno: "Vespertino", ocupacion_pct: 91, vehiculos_estimados: Math.round(cajones * 0.91) },
    { hora: "19:00", turno: "Vespertino", ocupacion_pct: 76, vehiculos_estimados: Math.round(cajones * 0.76) },
  ].filter((h) => turno === "TODOS" || h.turno === turno);

  const top = baseHours.reduce((a, b) => (b.ocupacion_pct > a.ocupacion_pct ? b : a), baseHours[0]);
  const avg = Math.round(
    (baseHours.reduce((acc, item) => acc + item.ocupacion_pct, 0) / baseHours.length) * 10
  ) / 10;

  return {
    filtros: { fecha_inicio: fechaInicio, fecha_fin: fechaFin, campus, turno, dias_analizados: 7 },
    resumen: {
      cajones_totales: cajones,
      ocupacion_promedio_pct: avg,
      hora_pico: top.hora,
      ocupacion_hora_pico_pct: top.ocupacion_pct,
      estancia_promedio_min: turno === "Vespertino" ? 126 : 142,
      indice_rotacion_vehicular: Number(((avg / 100) * 3.38).toFixed(2)),
      total_movimientos_periodo: Math.round(cajones * 2.6 * 7),
    },
    horas_pico: baseHours,
    serie_diaria: [
      { fecha: fechaInicio, ocupacion_pct: 81.2, estancia_promedio_min: 140, indice_rotacion: 2.75 },
      { fecha: fechaFin, ocupacion_pct: 84.5, estancia_promedio_min: 138, indice_rotacion: 2.86 },
    ],
  };
}

export function AnalyticsReportsView({ onBack }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const [fechaInicio, setFechaInicio] = useState(weekAgo);
  const [fechaFin, setFechaFin] = useState(today);
  const [campus, setCampus] = useState("TODOS");
  const [turno, setTurno] = useState("TODOS");
  const [reporte, setReporte] = useState(() =>
    buildLocalFallbackReport({ fechaInicio: weekAgo, fechaFin: today, campus: "TODOS", turno: "TODOS" })
  );
  const [loading, setLoading] = useState(false);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      campus,
      turno,
    });
    return params.toString();
  }, [fechaInicio, fechaFin, campus, turno]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API_BASE}/api/reportes/analitica?${queryParams}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("API no disponible"))))
      .then((data) => {
        if (active) setReporte(data);
      })
      .catch(() => {
        if (active) {
          setReporte(buildLocalFallbackReport({ fechaInicio, fechaFin, campus, turno }));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [queryParams, fechaInicio, fechaFin, campus, turno]);

  const handleDownloadCsv = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reportes/exportar/csv?${queryParams}`);
      if (!res.ok) throw new Error("Fallback CSV");
      const blob = await res.blob();
      triggerDownload(blob, `parkflow_reporte_${campus.toLowerCase()}.csv`);
    } catch {
      const rows = [
        ["Hora", "Turno", "Ocupacion (%)", "Vehiculos"],
        ...reporte.horas_pico.map((h) => [h.hora, h.turno, h.ocupacion_pct, h.vehiculos_estimados]),
      ];
      const csvText = rows.map((r) => r.join(",")).join("\n");
      triggerDownload(new Blob([csvText], { type: "text/csv;charset=utf-8" }), "parkflow_reporte.csv");
    }
  };

  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reportes/exportar/pdf?${queryParams}`);
      if (!res.ok) throw new Error("Fallback PDF");
      const blob = await res.blob();
      triggerDownload(blob, `parkflow_ejecutivo_${campus.toLowerCase()}.pdf`);
    } catch {
      window.print();
    }
  };

  const { resumen, horas_pico: horasPico } = reporte;

  return (
    <section className="pf-summary-float-card" aria-label="Módulo de reportes analíticos e históricos">
      <div className="pf-headline-row" style={{ marginBottom: "1rem" }}>
        <div>
          <h2 className="pf-section-headline">
            Analítica e <em className="pf-italic-accent">históricos</em> (CU-04)
          </h2>
          <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.25rem" }}>
            Horas pico, estancia promedio y rotación vehicular por campus y turno
          </p>
        </div>
        <button type="button" className="pf-back-btn" onClick={onBack}>
          ← Volver al monitor
        </button>
      </div>

      {/* Filtros por fecha, campus y turno */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.25rem" }}>
          <span>Desde</span>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-subtle, #cbd5e1)" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.25rem" }}>
          <span>Hasta</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-subtle, #cbd5e1)" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.25rem" }}>
          <span>Campus</span>
          <select
            value={campus}
            onChange={(e) => setCampus(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-subtle, #cbd5e1)" }}
          >
            <option value="TODOS">Todos (Campus 1 y 2)</option>
            <option value="CAMPUS-1">Campus 1 (Av. Tec)</option>
            <option value="CAMPUS-2">Campus 2 (Salamanca)</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.25rem" }}>
          <span>Turno</span>
          <select
            value={turno}
            onChange={(e) => setTurno(e.target.value)}
            style={{ padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-subtle, #cbd5e1)" }}
          >
            <option value="TODOS">Todos los turnos</option>
            <option value="Matutino">Matutino (07:00 - 14:59)</option>
            <option value="Vespertino">Vespertino (15:00 - 21:00)</option>
          </select>
        </label>
      </div>

      {/* KPIs principales */}
      <div className="pf-kpi-strip" style={{ marginBottom: "1.25rem" }}>
        <div className="pf-kpi-cell">
          <span className="pf-kpi-value" style={{ color: "var(--accent-text)" }}>
            {resumen.hora_pico}
          </span>
          <span className="pf-kpi-label">Hora pico ({resumen.ocupacion_hora_pico_pct}%)</span>
        </div>

        <div className="pf-kpi-cell">
          <span className="pf-kpi-value" style={{ color: "var(--status-warning)" }}>
            {resumen.estancia_promedio_min} min
          </span>
          <span className="pf-kpi-label">Estancia promedio</span>
        </div>

        <div className="pf-kpi-cell">
          <span className="pf-kpi-value" style={{ color: "var(--status-success)" }}>
            {resumen.indice_rotacion_vehicular}x
          </span>
          <span className="pf-kpi-label">Rotación diaria/cajón</span>
        </div>
      </div>

      {/* Gráfica de barras por franja horaria */}
      <div style={{ marginBottom: "1.25rem" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.65rem" }}>
          Ocupación por franja horaria {loading ? "(actualizando...)" : ""}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {horasPico.map((item) => (
            <div
              key={item.hora}
              style={{ display: "grid", gridTemplateColumns: "55px 1fr 68px", alignItems: "center", gap: "0.5rem" }}
            >
              <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{item.hora}</span>
              <div
                style={{
                  height: "14px",
                  background: "rgba(148, 163, 184, 0.25)",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, item.ocupacion_pct)}%`,
                    height: "100%",
                    background: item.ocupacion_pct >= 88 ? "#dc2626" : "#1b396a",
                    borderRadius: "999px",
                  }}
                />
              </div>
              <span style={{ fontSize: "0.8rem", textAlign: "right" }}>{item.ocupacion_pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Botones de exportación PDF y CSV */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="pf-primary-btn" onClick={handleDownloadPdf}>
          📄 Descargar PDF Ejecutivo
        </button>
        <button type="button" className="pf-banner-cta" onClick={handleDownloadCsv}>
          📊 Exportar Datos CSV
        </button>
      </div>
    </section>
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}