// Shared layout math + presets for the label (rótulos) sheet generator.
// Both the on-screen preview and the jsPDF export consume computeLayout() so
// the printed sheet matches what the user sees.

// Sheet sizes in millimetres (portrait: width x height).
export const SHEET_PRESETS = {
  a4: { label: "A4 (210 × 297 mm)", w: 210, h: 297 },
  carta: { label: "Carta (216 × 279 mm)", w: 215.9, h: 279.4 },
  a5: { label: "A5 (148 × 210 mm)", w: 148, h: 210 },
  a3: { label: "A3 (297 × 420 mm)", w: 297, h: 420 },
  custom: { label: "Personalizado", w: 210, h: 297 },
};

export const DEVICE_LABELS = {
  ethernet: "Ethernet",
  camara: "Cámara CCTV",
  access_point: "AP WiFi",
};

// Default per-device text colours (match the app's DeviceIcon palette).
export const DEVICE_COLORS = {
  ethernet: "#2563eb",
  camara: "#9333ea",
  access_point: "#16a34a",
};

// Fields that can optionally be shown on each label, in render order.
export const LABEL_FIELDS = [
  { key: "floor", label: "Piso" },
  { key: "space", label: "Espacio" },
  { key: "deviceType", label: "Tipo de dispositivo" },
  { key: "patchPanel", label: "Puerto patch panel" },
  { key: "switchPort", label: "Puerto switch" },
  { key: "vlan", label: "VLAN" },
  { key: "technician", label: "Técnico" },
];

export const DEFAULT_CONFIG = {
  // Sheet
  sheet: "a4",
  customW: 210,
  customH: 297,
  orientation: "portrait", // portrait | landscape

  // Page margins (mm)
  marginTop: 10,
  marginRight: 10,
  marginBottom: 10,
  marginLeft: 10,

  // Grid: labels per page
  columns: 3,
  rows: 8,
  gapX: 3,
  gapY: 3,
  copies: 1, // copies of each point

  // Print order of the selected points.
  // selection | name | floor | device | floor_device | device_floor | space
  sortBy: "selection",

  // Box (recuadro)
  showBorder: true,
  borderWidth: 0.3, // mm
  borderColor: "#1d4ed8",
  cornerRadius: 2, // mm
  bgColor: "#ffffff",
  padding: 3, // inner padding (mm)

  // Text
  textColor: "#0f172a",
  nameFontSize: 12, // pt
  metaFontSize: 8, // pt
  bold: true,
  align: "center", // left | center | right

  // Per-device text colour: when on, each label's text uses deviceColors[type]
  colorByDevice: false,
  deviceColors: { ...DEVICE_COLORS },

  // Device-type icon (camera / wifi / ethernet)
  showIcon: false,
  iconPosition: "start", // start | end (relative to the name)

  // Which extra fields to include
  fields: {
    floor: false,
    space: true,
    deviceType: false,
    patchPanel: false,
    switchPort: false,
    vlan: false,
    technician: false,
  },
};

// Numeric config keys, used to coerce values that inputs may leave as "".
const NUMERIC_KEYS = [
  "customW", "customH", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "columns", "rows", "gapX", "gapY", "copies", "borderWidth", "cornerRadius",
  "padding", "nameFontSize", "metaFontSize",
];

// Merges a partial/stored config onto the defaults and coerces numeric fields,
// so a loaded template or an in-progress edit is always safe to render/export.
export function sanitizeConfig(input = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...input,
    fields: { ...DEFAULT_CONFIG.fields, ...(input.fields || {}) },
    deviceColors: { ...DEFAULT_CONFIG.deviceColors, ...(input.deviceColors || {}) },
  };
  for (const key of NUMERIC_KEYS) {
    const n = Number(merged[key]);
    merged[key] = Number.isFinite(n) ? n : DEFAULT_CONFIG[key];
  }
  return merged;
}

// The text colour to use for a given point, honouring the per-device option.
export function resolveTextColor(point, config) {
  if (config.colorByDevice) {
    return (config.deviceColors || {})[point.device_type] || config.textColor;
  }
  return config.textColor;
}

// Returns the effective page dimensions (mm) taking orientation into account.
export function getPageSize(config) {
  const preset = SHEET_PRESETS[config.sheet] || SHEET_PRESETS.a4;
  let w = config.sheet === "custom" ? Number(config.customW) || 210 : preset.w;
  let h = config.sheet === "custom" ? Number(config.customH) || 297 : preset.h;
  if (config.orientation === "landscape") {
    return { w: Math.max(w, h), h: Math.min(w, h) };
  }
  return { w: Math.min(w, h), h: Math.max(w, h) };
}

// Computes label dimensions and the (x, y) origin of each cell in mm.
export function computeLayout(config) {
  const { w: pageW, h: pageH } = getPageSize(config);
  const cols = Math.max(1, Math.floor(config.columns));
  const rows = Math.max(1, Math.floor(config.rows));
  const gapX = Math.max(0, config.gapX);
  const gapY = Math.max(0, config.gapY);

  const usableW = pageW - config.marginLeft - config.marginRight - gapX * (cols - 1);
  const usableH = pageH - config.marginTop - config.marginBottom - gapY * (rows - 1);
  const labelW = usableW / cols;
  const labelH = usableH / rows;

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: config.marginLeft + c * (labelW + gapX),
        y: config.marginTop + r * (labelH + gapY),
      });
    }
  }

  return {
    pageW,
    pageH,
    cols,
    rows,
    labelW: Math.max(0, labelW),
    labelH: Math.max(0, labelH),
    perPage: cols * rows,
    cells,
    valid: labelW > 0 && labelH > 0,
  };
}

// Builds the list of text lines for a single point given the config.
// floorMap / spaceMap resolve the *_id fields to human names.
export function buildLabelLines(point, config, { floorMap = {}, spaceMap = {} } = {}) {
  const meta = [];
  const f = config.fields;
  if (f.floor && floorMap[point.floor_id]) meta.push(floorMap[point.floor_id]);
  if (f.space && spaceMap[point.space_id]) meta.push(spaceMap[point.space_id]);
  if (f.deviceType && DEVICE_LABELS[point.device_type]) meta.push(DEVICE_LABELS[point.device_type]);
  if (f.patchPanel && point.puerto_patch_panel) meta.push(`PP: ${point.puerto_patch_panel}`);
  if (f.switchPort && point.puerto_switch) meta.push(`SW: ${point.puerto_switch}`);
  if (f.vlan && point.vlan) meta.push(`VLAN: ${point.vlan}`);
  if (f.technician && point.technician) meta.push(point.technician);
  return { name: point.name || "", meta };
}

// Expands the selected points into the flat sequence to place on the sheet,
// honouring the "copies per point" setting.
export function expandPoints(points, copies) {
  const n = Math.max(1, Math.floor(copies) || 1);
  const out = [];
  for (const p of points) {
    for (let i = 0; i < n; i++) out.push(p);
  }
  return out;
}
