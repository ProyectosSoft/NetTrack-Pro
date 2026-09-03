import { getPointProgress, getPointPhaseProgress } from "./pointProgress";

const STATUS_LABELS = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  con_observaciones: "Con observaciones",
};
const DEVICE_LABELS = { ethernet: "Ethernet", camara: "Cámara", access_point: "AP WiFi" };

function cell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Exports one row per point (denormalized with floor/space names) as a CSV that
// Excel opens with correct accents (UTF-8 BOM). A client-facing deliverable.
export function exportPointsCsv(project, floors, spaces, points) {
  const floorMap = Object.fromEntries(floors.map((f) => [f.id, f]));
  const spaceMap = Object.fromEntries(spaces.map((s) => [s.id, s.name]));

  const ordered = [...points].sort((a, b) => {
    const fa = floorMap[a.floor_id]?.order ?? 0;
    const fb = floorMap[b.floor_id]?.order ?? 0;
    if (fa !== fb) return fa - fb;
    const sa = spaceMap[a.space_id] || "";
    const sb = spaceMap[b.space_id] || "";
    if (sa !== sb) return sa.localeCompare(sb, undefined, { numeric: true });
    return (a.name || "").localeCompare(b.name || "", undefined, { numeric: true });
  });

  const headers = [
    "Proyecto", "Piso", "Espacio", "Punto", "Descripción", "Tipo", "Estado",
    "Avance %", "Fase Piso %", "Fase Rack %", "Técnico",
    "Patch Panel", "Switch", "VLAN", "Observaciones",
  ];

  const rows = ordered.map((p) => {
    const ph = getPointPhaseProgress(p);
    return [
      project?.project_name || "",
      floorMap[p.floor_id]?.name || "",
      spaceMap[p.space_id] || "",
      p.name || "",
      p.description || "",
      DEVICE_LABELS[p.device_type] || p.device_type || "",
      STATUS_LABELS[p.status] || p.status || "",
      getPointProgress(p),
      ph.piso.pct,
      ph.rack.pct,
      p.technician || "",
      p.puerto_patch_panel || "",
      p.puerto_switch || "",
      p.vlan || "",
      p.observaciones || "",
    ];
  });

  const csv = [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `puntos-${(project?.project_name || "proyecto").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
