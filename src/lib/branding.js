// Per-project branding + terminology helpers.

// Converts a hex color to the "H S% L%" channel format Tailwind expects for
// `hsl(var(--primary))`. Returns null for invalid input.
export function hexToHslChannels(hex) {
  if (!hex) return null;
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = lum > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

// Overrides (or clears) the app's primary brand color at runtime.
export function applyBrandColor(hex) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const ch = hexToHslChannels(hex);
  if (ch) root.style.setProperty("--primary", ch);
  else root.style.removeProperty("--primary");
}

// Converts a hex color to an [r, g, b] triplet. Falls back to slate.
export function hexToRgb(hex) {
  let h = String(hex || "").replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return [100, 116, 139];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Converts a hex color to `rgba(...)` with the given alpha (0-1).
export function hexToRgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Floor-plan pins -------------------------------------------------------

// Default pin palette: the app's status colors.
export const PIN_STATUS_COLORS = {
  pendiente: "#94a3b8",
  en_proceso: "#f59e0b",
  finalizado: "#22c55e",
  con_observaciones: "#ef4444",
};

export const DEFAULT_PIN_OPACITY = 100;
export const DEFAULT_PIN_BORDER_OPACITY = 100;

// Whether the exported plan prints the point name next to each pin. Off by
// default: most CAD plans already carry their own labels, and the overlay would
// duplicate them. The app always shows the name on hover, regardless.
export function showPinLabelsInPdf(project) {
  return project?.pin_labels_pdf === true;
}

export function isHexColor(value) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || "").trim());
}

export function normalizePinOpacity(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : DEFAULT_PIN_OPACITY;
}

// How a plan pin should be painted for a given point: the project's fixed color
// when one is set, otherwise the point's status color. Fill and contour carry
// their own opacity, so a pin can be translucent, contour-only, fill-only or
// anything in between, to avoid hiding the drawing underneath.
export function resolvePinStyle(project, status) {
  const color = isHexColor(project?.pin_color)
    ? project.pin_color.trim()
    : (PIN_STATUS_COLORS[status] || PIN_STATUS_COLORS.pendiente);
  const opacity = normalizePinOpacity(project?.pin_opacity ?? DEFAULT_PIN_OPACITY);
  const borderOpacity = normalizePinOpacity(project?.pin_border_opacity ?? DEFAULT_PIN_BORDER_OPACITY);
  return {
    color,
    opacity,
    borderOpacity,
    rgb: hexToRgb(color),
    fill: hexToRgba(color, opacity / 100),
    border: hexToRgba(color, borderOpacity / 100),
  };
}

// --- Terminology -----------------------------------------------------------

export const DEFAULT_TERMS = {
  project: "Proyecto", projects: "Proyectos",
  floor: "Piso", floors: "Pisos",
  space: "Espacio", spaces: "Espacios",
  point: "Punto", points: "Puntos",
};

export const TERM_FIELDS = [
  { key: "floors", label: "Pisos (plural)" },
  { key: "floor", label: "Piso (singular)" },
  { key: "spaces", label: "Espacios (plural)" },
  { key: "space", label: "Espacio (singular)" },
  { key: "points", label: "Puntos (plural)" },
  { key: "point", label: "Punto (singular)" },
];

export function resolveTerms(project) {
  const t = project?.terminology || {};
  const out = { ...DEFAULT_TERMS };
  for (const k of Object.keys(DEFAULT_TERMS)) {
    if (t[k] && String(t[k]).trim()) out[k] = String(t[k]).trim();
  }
  return out;
}

// --- Modules ---------------------------------------------------------------

// Modules that can be hidden per project. Dashboard, Proyectos and
// Configuración are core and always visible.
export const TOGGLEABLE_MODULES = [
  { key: "puntos", label: "Puntos" },
  { key: "checklist_masivo", label: "Checklist masivo" },
  { key: "materiales", label: "Materiales" },
  { key: "evidencia", label: "Evidencia" },
  { key: "rotulos", label: "Rótulos" },
  { key: "plantillas", label: "Plantillas" },
];

export function isModuleHidden(project, key) {
  return Array.isArray(project?.hidden_modules) && project.hidden_modules.includes(key);
}
