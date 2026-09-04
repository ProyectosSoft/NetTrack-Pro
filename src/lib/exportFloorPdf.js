import { getTemplate, FIELD_LABELS } from "./checklistTemplates";
import {
  getPointProgress,
  getPointPhaseProgress,
  aggregatePhaseProgress,
  getEquipmentFieldPhase,
  hasObservations,
} from "./pointProgress";
import { sortItems } from "./ordering";
import {
  C, STATUS_STYLE, STATUS_ORDER, DEVICE_STYLE, PHASE_STYLE,
  fill, stroke, ink, font, panel, line, clip, withAlpha,
  pill, pillWidth, bar, check, donut, ring, kpiCard, field, fieldBlock, fieldBlockHeight,
  loadPhoto, photoCell, setAccent, mixRgb, isLightColor,
} from "./pdfKit";
import { resolvePinStyle, isHexColor, showPinLabelsInPdf, hexToRgb } from "./branding";

// jsPDF (and its transitive deps) is ~580 kB, so load it on demand the first
// time the user actually exports, instead of on every page that can export.
async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.jsPDF;
}

// Best-effort fetch of a remote image (project logo) as a data URL for
// embedding. Returns null on CORS/network/format failure so the cover still
// renders without it.
async function fetchImageDataUrl(url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const MARGIN = 40;
const FOOTER = 44; // reserved bottom strip for the page number
const GAP = 9; // vertical gap between cards
const CARD_PAD = 32; // card chrome: title band above the body + bottom padding

const PONCHADO_LABELS = { na: "N/A", jack: "Jack (ETH)", z_plug: "Z-Plug" };

const DEVICE_LABELS = { ethernet: "Ethernet", camara: "Cámaras", access_point: "AP WiFi" };

const PROJECT_STATUS_LABELS = { activo: "Activo", en_pausa: "En pausa", finalizado: "Finalizado" };

function formatToday() {
  return new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("es");
}

// Report palette derived from the project's brand colour, so the cover and the
// progress marks match the app. Falls back to the app's blue.
function reportTheme(project) {
  const band = isHexColor(project?.primary_color) ? hexToRgb(project.primary_color) : C.primary;
  const light = isLightColor(band);
  return {
    band,
    // Decorative circles: darker over a dark brand, lighter over a pale one.
    bandAccent: light ? mixRgb(band, C.white, 0.4) : mixRgb(band, [0, 0, 0], 0.16),
    onBand: light ? C.ink : C.white,
    onBandSoft: light ? mixRgb(C.ink, band, 0.4) : mixRgb(band, C.white, 0.72),
    accent: light ? mixRgb(band, [0, 0, 0], 0.3) : band, // legible on white
    tint: mixRgb(band, C.white, 0.88), // section banners
    tintInk: mixRgb(band, [0, 0, 0], 0.35),
  };
}

function generatedBy(user) {
  return user?.full_name || user?.name || user?.email || null;
}

// --- Report scaffolding ----------------------------------------------------

function createReport(doc, title, meta = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const r = {
    doc,
    pageW,
    pageH,
    margin: MARGIN,
    contentW: pageW - MARGIN * 2,
    bottom: pageH - FOOTER,
    y: MARGIN,
    title,
    crumb: "",
    started: false,
    project: meta.project || null,
    user: meta.user || null,
    logoDataUrl: meta.logoDataUrl || null,
    theme: reportTheme(meta.project),
  };
  setAccent(r.theme.accent);
  r.newPage = () => {
    doc.addPage();
    r.started = true;
    r.y = MARGIN;
    drawPageTop(r);
  };
  // Starts a fresh page unless the document is still on its untouched first one.
  r.startPage = () => {
    if (r.started) doc.addPage();
    r.started = true;
    r.y = MARGIN;
    drawPageTop(r);
  };
  r.ensure = (h) => {
    if (r.y + h > r.bottom) r.newPage();
  };
  return r;
}

// Slim running head: brand on the left, current floor/space on the right.
function drawPageTop(r) {
  const { doc, margin, pageW, contentW } = r;
  const brand = r.project?.project_name || "NETTRACK PRO";
  line(doc, brand.toUpperCase(), margin, margin - 14, { size: 7, style: "bold", color: r.theme.accent, charSpace: 1.2, maxW: contentW * 0.5 });
  if (r.crumb) {
    line(doc, r.crumb, pageW - margin, margin - 14, { size: 7, color: C.faint, align: "right", maxW: contentW * 0.6 });
  }
  stroke(doc, C.border);
  doc.setLineWidth(0.6);
  doc.line(margin, margin - 4, pageW - margin, margin - 4);
  r.y = margin + 10;
}

// Stamped once at the end so the page count is known.
function stampFooters(r) {
  const { doc, margin, pageW, pageH } = r;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    stroke(doc, C.hairline);
    doc.setLineWidth(0.6);
    doc.line(margin, pageH - 32, pageW - margin, pageH - 32);
    line(doc, r.title, margin, pageH - 24, { size: 7, color: C.faint, maxW: r.contentW - 90 });
    line(doc, `Página ${i} de ${total}`, pageW - margin, pageH - 24, { size: 7, color: C.faint, align: "right" });
  }
  doc.setPage(total);
}

// Cover banner in the project's brand colour: the project name is the headline,
// with the report scope underneath and the logo on the right.
function drawCover(r, { kicker, title, scope }) {
  const { doc, margin, pageW, theme } = r;
  const bandH = 132;
  fill(doc, theme.band);
  doc.rect(0, 0, pageW, bandH, "F");
  // Subtle depth, without relying on transparency support.
  fill(doc, theme.bandAccent);
  doc.circle(pageW - 66, 40, 50, "F");
  doc.circle(pageW - 28, 112, 20, "F");

  // Project logo, top-right on a white chip so any logo keeps its contrast.
  let reserved = 60;
  if (r.logoDataUrl) {
    const s = 54;
    const lx = pageW - margin - s;
    const ly = 20;
    fill(doc, C.white);
    doc.roundedRect(lx - 5, ly - 5, s + 10, s + 10, 7, 7, "F");
    try { doc.addImage(r.logoDataUrl, lx, ly, s, s, undefined, "FAST"); } catch { /* unsupported format — skip */ }
    reserved = s + 30;
  }

  const textW = pageW - margin * 2 - reserved;
  line(doc, kicker.toUpperCase(), margin, 30, { size: 7.5, style: "bold", color: theme.onBandSoft, charSpace: 1.6, maxW: textW });
  line(doc, title, margin, 45, { size: 26, style: "bold", color: theme.onBand, maxW: textW });
  line(doc, scope, margin, 87, { size: 11, style: "bold", color: theme.onBand, maxW: textW });
  // Prefer the project's "Elaborado por" (responsible), then its contact person,
  // then the app user — so the cover names a real person, not "Usuario local".
  const who = (r.project?.prepared_by || "").trim() || (r.project?.contact_name || "").trim() || generatedBy(r.user);
  line(doc, `Generado el ${formatToday()}${who ? ` · por ${who}` : ""}`, margin, 105, {
    size: 8.5, color: theme.onBandSoft, maxW: textW,
  });

  r.started = true;
  r.y = bandH + 18;
  drawProjectMeta(r);
}

// The project's details laid out as a labelled grid, the way the app shows them
// in the project header — a single run-on line used to get truncated.
function drawProjectMeta(r) {
  const p = r.project;
  if (!p) return;
  const { doc, margin, contentW } = r;

  const items = [];
  if (p.client) items.push(["Cliente", p.client]);
  const address = [p.address, p.city].filter(Boolean).join(", ");
  if (address) items.push(["Dirección", address]);
  if (p.contact_name) items.push(["Contacto", p.contact_name]);
  if (p.phone) items.push(["Teléfono", p.phone]);
  if (p.email) items.push(["Correo", p.email]);
  if (p.url) items.push(["Sitio", p.url]);
  // En dash, not an arrow: the PDF core fonts only cover WinAnsi.
  const period = [formatDate(p.start_date), formatDate(p.end_date)].filter(Boolean).join(" – ");
  if (period) items.push(["Periodo", period]);
  if (p.status) items.push(["Estado", PROJECT_STATUS_LABELS[p.status] || p.status]);
  if (items.length === 0) return;

  const cols = 3;
  const gap = 14;
  const colW = (contentW - 24 - gap * (cols - 1)) / cols;
  // Values wrap to two lines at most, so one long address can't unbalance the grid.
  const wrap = (value) => {
    font(doc, "normal", 8.5);
    const lines = doc.splitTextToSize(String(value), colW);
    return lines.length > 2 ? [lines[0], clip(doc, lines.slice(1).join(" "), colW)] : lines;
  };
  const cells = items.map(([label, value]) => ({ label, lines: wrap(value) }));

  const rows = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const rowHeights = rows.map((row) => 10 + Math.max(...row.map((c) => c.lines.length)) * 11 + 8);
  const h = 12 + rowHeights.reduce((a, b) => a + b, 0);

  r.ensure(h);
  panel(doc, margin, r.y, contentW, h, { bg: C.soft, border: C.border });
  let y = r.y + 12;
  rows.forEach((row, i) => {
    row.forEach((cell, j) => {
      const x = margin + 12 + j * (colW + gap);
      line(doc, cell.label.toUpperCase(), x, y, { size: 6.5, style: "bold", color: C.faint, charSpace: 0.5 });
      cell.lines.forEach((ln, k) => {
        line(doc, ln, x, y + 11 + k * 11, { size: 8.5, color: C.ink });
      });
    });
    y += rowHeights[i];
  });
  r.y += h + GAP;
}

// Card frame with a bold title (+ optional phase badge). Returns the body box.
function openCard(r, bodyH, title, phase) {
  const height = bodyH + CARD_PAD;
  r.ensure(height);
  const { doc, margin, contentW } = r;
  panel(doc, margin, r.y, contentW, height, { bg: C.white, border: C.border });
  const tx = line(doc, title, margin + 14, r.y + 10, { size: 9, style: "bold", color: C.ink });
  if (phase) {
    const s = PHASE_STYLE[phase];
    pill(doc, tx + 8, r.y + 8, s.label.toUpperCase(), { fg: s.fg, bg: s.bg, size: 6.5, h: 11, padX: 5 });
  }
  return { x: margin + 14, y: r.y + 26, w: contentW - 28, top: r.y, height };
}

function closeCard(r, card) {
  r.y = card.top + card.height + GAP;
}

// Card of repeating rows that can span pages, continuing with a "(cont.)" title.
function drawRowsCard(r, title, items, rowH, drawRow, { header, headerH = 0 } = {}) {
  let index = 0;
  let first = true;
  while (index < items.length) {
    const avail = r.bottom - r.y - CARD_PAD - headerH;
    const fits = Math.floor(avail / rowH);
    const remaining = items.length - index;
    const atPageTop = r.y <= MARGIN + 10;
    // Don't leave an orphan card holding one or two rows at the foot of a page,
    // unless we are already at the top of a fresh page and can't do better.
    if (fits < Math.min(remaining, 3) && !(atPageTop && fits >= 1)) {
      r.newPage();
      continue;
    }
    const chunk = items.slice(index, index + Math.max(1, fits));
    const bodyH = headerH + chunk.length * rowH;
    const card = openCard(r, bodyH, first ? title : `${title} (cont.)`);
    let y = card.y;
    if (header) {
      header(card.x, y, card.w);
      y += headerH;
    }
    for (const item of chunk) {
      drawRow(item, card.x, y, card.w);
      y += rowH;
    }
    closeCard(r, card);
    index += chunk.length;
    first = false;
  }
}

// --- Aggregations ----------------------------------------------------------

function computeStats(points) {
  const byStatus = { pendiente: 0, en_proceso: 0, finalizado: 0, con_observaciones: 0 };
  for (const p of points) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const total = points.length;
  return {
    total,
    byStatus,
    finalizados: byStatus.finalizado,
    conObs: points.filter(hasObservations).length,
    pct: total ? points.reduce((sum, p) => sum + getPointProgress(p), 0) / total : 0,
  };
}

// Progress rows for a set of containers (spaces or floors).
function groupRows(containers, points, key) {
  return containers
    .map((c) => {
      const own = points.filter((p) => p[key] === c.id);
      return {
        id: c.id,
        name: c.name,
        total: own.length,
        done: own.filter((p) => p.status === "finalizado").length,
        pct: own.length ? Math.round(own.reduce((sum, p) => sum + getPointProgress(p), 0) / own.length) : 0,
      };
    })
    .filter((row) => row.total > 0);
}

function deviceRows(points) {
  return Object.entries(DEVICE_LABELS)
    .map(([type, name]) => {
      const own = points.filter((p) => p.device_type === type);
      return {
        name,
        total: own.length,
        done: own.filter((p) => p.status === "finalizado").length,
        pct: own.length ? Math.round(own.reduce((sum, p) => sum + getPointProgress(p), 0) / own.length) : 0,
      };
    })
    .filter((row) => row.total > 0);
}

// --- Summary blocks --------------------------------------------------------

// Hero: overall progress ring + status distribution donut with legend.
function drawHero(r, stats) {
  const { doc, margin, contentW } = r;
  const h = 132;
  r.ensure(h);
  const leftW = Math.round(contentW * 0.37);
  const rightX = margin + leftW + GAP;
  const rightW = contentW - leftW - GAP;

  panel(doc, margin, r.y, leftW, h, { bg: C.white, border: C.border });
  line(doc, "Avance general", margin + 14, r.y + 12, { size: 9, style: "bold", color: C.ink });
  ring(doc, margin + leftW / 2, r.y + 72, 38, 11, stats.pct, { labelSize: 16 });
  line(doc, `${stats.finalizados} de ${stats.total} puntos finalizados`, margin + leftW / 2, r.y + h - 16, {
    size: 7.5, color: C.muted, align: "center", maxW: leftW - 20,
  });

  panel(doc, rightX, r.y, rightW, h, { bg: C.white, border: C.border });
  line(doc, "Distribución por estado", rightX + 14, r.y + 12, { size: 9, style: "bold", color: C.ink });
  const segments = STATUS_ORDER
    .map((key) => ({ key, value: stats.byStatus[key] || 0, color: STATUS_STYLE[key].dot }))
    .filter((s) => s.value > 0);
  const cx = rightX + 62;
  const cy = r.y + 74;
  donut(doc, cx, cy, 36, 21, segments);
  line(doc, String(stats.total), cx, cy - 4, { size: 13, style: "bold", color: C.ink, align: "center", baseline: "middle" });
  line(doc, "puntos", cx, cy + 8, { size: 6.5, color: C.muted, align: "center", baseline: "middle" });

  const legendX = rightX + 112;
  const legendW = rightW - 112 - 14;
  let ly = r.y + 36;
  for (const key of STATUS_ORDER) {
    const s = STATUS_STYLE[key];
    const value = stats.byStatus[key] || 0;
    fill(doc, s.dot);
    doc.roundedRect(legendX, ly + 1.5, 6, 6, 2, 2, "F");
    line(doc, s.label, legendX + 12, ly, { size: 8, color: C.text, maxW: legendW - 60 });
    const share = stats.total ? Math.round((value / stats.total) * 100) : 0;
    line(doc, `${value}  ·  ${share}%`, legendX + legendW, ly, { size: 8, style: "bold", color: C.ink, align: "right" });
    ly += 19;
  }
  r.y += h + GAP;
}

function drawKpiRow(r, stats) {
  const { doc, margin, contentW } = r;
  const h = 58;
  r.ensure(h);
  const gap = 10;
  const w = (contentW - gap * 3) / 4;
  const cards = [
    { label: "Finalizados", value: stats.finalizados, sub: `de ${stats.total}`, color: C.green },
    { label: "En proceso", value: stats.byStatus.en_proceso, color: C.amber },
    { label: "Pendientes", value: stats.byStatus.pendiente, color: C.slate },
    { label: "Con observaciones", value: stats.conObs, color: C.red },
  ];
  cards.forEach((c, i) => kpiCard(doc, margin + i * (w + gap), r.y, w, h, c));
  r.y += h + GAP;
}

const PHASE_BOX_H = 46;

function phaseBox(doc, x, y, w, { label, data, style }) {
  panel(doc, x, y, w, PHASE_BOX_H, { bg: C.soft, border: C.hairline, r: 6 });
  ring(doc, x + 29, y + PHASE_BOX_H / 2, 16, 4.5, data.pct, { color: style.dot, labelSize: 7.5 });
  const tx = x + 54;
  const tw = w - 54 - 12;
  fill(doc, style.dot);
  doc.circle(tx + 3, y + 13, 3, "F");
  line(doc, label, tx + 10, y + 9, { size: 8.5, style: "bold", color: C.ink, maxW: tw - 10 });
  const pending = Math.max(0, data.total - data.done);
  line(doc, data.total ? `${data.done}/${data.total} ítems · faltan ${pending}` : "Sin ítems", tx, y + 21, {
    size: 7, color: C.muted, maxW: tw,
  });
  bar(doc, tx, y + 33, tw, data.pct, { color: style.dot });
}

function drawPhaseCard(r, phases) {
  const card = openCard(r, PHASE_BOX_H, "Avance por fase");
  const w = (card.w - GAP) / 2;
  phaseBox(r.doc, card.x, card.y, w, { label: "Fase Piso", data: phases.piso, style: PHASE_STYLE.piso });
  phaseBox(r.doc, card.x + w + GAP, card.y, w, { label: "Fase Rack", data: phases.rack, style: PHASE_STYLE.rack });
  closeCard(r, card);
}

function drawProgressRows(r, title, rows) {
  if (rows.length === 0) return;
  drawRowsCard(r, title, rows, 26, (row, x, y, w) => {
    const { doc } = r;
    line(doc, row.name, x, y, { size: 8.5, style: "bold", color: C.ink, maxW: w - 110 });
    line(doc, `${row.done}/${row.total} · ${row.pct}%`, x + w, y, { size: 7.5, color: C.muted, align: "right" });
    bar(doc, x, y + 13, w, row.pct, { h: 4 });
  });
}

// Compact index of every point in the scope, mirroring the list views.
function drawPointIndex(r, rows) {
  if (rows.length === 0) return;
  const { doc } = r;
  const cols = (w) => ({ name: w * 0.34, space: w * 0.26, status: w * 0.22, progress: w * 0.18 });
  drawRowsCard(
    r,
    "Detalle de puntos",
    rows,
    17,
    (row, x, y, w) => {
      const c = cols(w);
      const s = STATUS_STYLE[row.status] || STATUS_STYLE.pendiente;
      line(doc, row.name, x, y + 2, { size: 8, style: "bold", color: C.ink, maxW: c.name - 8 });
      line(doc, row.space, x + c.name, y + 2, { size: 7.5, color: C.muted, maxW: c.space - 8 });
      fill(doc, s.dot);
      doc.circle(x + c.name + c.space + 3, y + 6, 2.6, "F");
      line(doc, s.label, x + c.name + c.space + 10, y + 2, { size: 7.5, color: s.fg, maxW: c.status - 18 });
      bar(doc, x + w - 74, y + 4.5, 42, row.progress, { h: 4 });
      line(doc, `${row.progress}%`, x + w, y + 2, { size: 7.5, style: "bold", color: C.ink, align: "right" });
      stroke(doc, C.hairline);
      doc.setLineWidth(0.5);
      doc.line(x, y + 15, x + w, y + 15);
    },
    {
      headerH: 16,
      header: (x, y, w) => {
        const c = cols(w);
        const opts = { size: 6.5, style: "bold", color: C.faint, charSpace: 0.6 };
        line(doc, "PUNTO", x, y, opts);
        line(doc, "ESPACIO", x + c.name, y, opts);
        line(doc, "ESTADO", x + c.name + c.space, y, opts);
        line(doc, "AVANCE", x + w, y, { ...opts, align: "right" });
        stroke(doc, C.border);
        doc.setLineWidth(0.6);
        doc.line(x, y + 11, x + w, y + 11);
      },
    }
  );
}

// Banner that introduces a floor inside the project report.
function drawFloorBanner(r, floor, spaces, points) {
  const { doc, margin, contentW, theme } = r;
  const h = 54;
  r.ensure(h + 6);
  panel(doc, margin, r.y, contentW, h, { bg: theme.tint, border: theme.tint });
  line(doc, floor?.name || "Piso", margin + 16, r.y + 13, { size: 14, style: "bold", color: theme.tintInk, maxW: contentW - 160 });
  line(doc, `${spaces.length} espacios · ${points.length} puntos`, margin + 16, r.y + 34, {
    size: 8, color: theme.tintInk, maxW: contentW - 160,
  });
  const pct = points.length ? Math.round(points.reduce((sum, p) => sum + getPointProgress(p), 0) / points.length) : 0;
  line(doc, `${pct}%`, margin + contentW - 16, r.y + 14, { size: 13, style: "bold", color: theme.tintInk, align: "right" });
  bar(doc, margin + contentW - 116, r.y + 36, 100, pct, { h: 5, track: C.white });
  r.y += h + GAP;
}

// --- Floor plan -------------------------------------------------------------

const PLAN_PIN_R = 4.6;
const isPlaced = (p) => Number.isFinite(p.plan_x) && Number.isFinite(p.plan_y);

// Pins over the plan image, matching the on-screen appearance: coloured ring
// and fill, each at the project's opacity. Names are only printed when the
// project asks for them — plans usually carry their own labels already.
function drawPlanPins(r, points, box, project) {
  const { doc } = r;
  const withLabels = showPinLabelsInPdf(project);
  for (const p of points) {
    const cx = box.x + (p.plan_x / 100) * box.w;
    const cy = box.y + (p.plan_y / 100) * box.h;
    const pin = resolvePinStyle(project, p.status);

    withAlpha(doc, pin.opacity / 100, () => {
      fill(doc, pin.rgb);
      doc.circle(cx, cy, PLAN_PIN_R, "F");
    });
    // The white halo belongs to the ring, so both fade out together.
    withAlpha(doc, pin.borderOpacity / 100, () => {
      stroke(doc, C.white);
      doc.setLineWidth(1.6);
      doc.circle(cx, cy, PLAN_PIN_R + 0.6, "S");
      stroke(doc, pin.rgb);
      doc.setLineWidth(1);
      doc.circle(cx, cy, PLAN_PIN_R, "S");
    });

    const label = p.name || "";
    if (!withLabels || !label) continue;
    font(doc, "bold", 5.5);
    const tw = doc.getTextWidth(label);
    // Flip the label to the left when it would run past the plan's edge.
    const right = cx + PLAN_PIN_R + 3;
    const lx = right + tw + 3 > box.x + box.w ? cx - PLAN_PIN_R - 3 - tw - 3 : right;
    withAlpha(doc, 0.85, () => {
      fill(doc, C.white);
      doc.roundedRect(lx - 2, cy - 4.3, tw + 4, 8.6, 2, 2, "F");
    });
    ink(doc, C.ink);
    doc.text(label, lx, cy + 0.4, { baseline: "middle" });
  }
}

// The floor plan image with its located points, as shown in the app.
function drawPlanCard(r, floor, points, planImage, project) {
  const { doc } = r;
  const innerW = r.contentW - 28;

  if (!planImage) {
    const card = openCard(r, 26, "Plano del piso");
    panel(doc, card.x, card.y, card.w, 26, { bg: C.soft, border: C.border, r: 5 });
    line(doc, "No se pudo cargar la imagen del plano.", card.x + 8, card.y + 13, { size: 8, color: C.faint, baseline: "middle" });
    closeCard(r, card);
    return;
  }

  // Fit the plan inside a full page at most, so the card never overflows.
  const legendH = 14;
  const maxH = r.bottom - (MARGIN + 10) - CARD_PAD - legendH;
  const scale = Math.min(innerW / planImage.w, maxH / planImage.h);
  const w = planImage.w * scale;
  const h = planImage.h * scale;

  const card = openCard(r, h + legendH, "Plano del piso");
  const x = card.x + (card.w - w) / 2;
  doc.addImage(planImage.dataUrl, planImage.format || "PNG", x, card.y, w, h);
  stroke(doc, C.border);
  doc.setLineWidth(0.6);
  doc.rect(x, card.y, w, h, "S");
  drawPlanPins(r, points.filter(isPlaced), { x, y: card.y, w, h }, project);

  // Footer strip: dimensions on the left, status legend on the right.
  const legendY = card.y + h + 4;
  if (floor?.width && floor?.length) {
    line(doc, `${floor.width} × ${floor.length} m · ${Math.round(floor.width * floor.length)} m²`, card.x, legendY, {
      size: 7, color: C.muted,
    });
  }
  if (!isHexColor(project?.pin_color)) {
    let lx = card.x + card.w;
    for (const key of [...STATUS_ORDER].reverse()) {
      const s = STATUS_STYLE[key];
      font(doc, "normal", 6.5);
      const tw = doc.getTextWidth(s.label);
      lx -= tw;
      line(doc, s.label, lx, legendY, { size: 6.5, color: C.muted });
      lx -= 6;
      fill(doc, s.dot);
      doc.circle(lx, legendY + 3, 2.2, "F");
      lx -= 10;
    }
  }
  closeCard(r, card);
}

// --- Point sheet (mirrors the checklist view of a single point) -------------

function drawSheetHeader(r, pt, { floorName, spaceName, tpl }) {
  const { doc, margin, contentW } = r;
  const status = STATUS_STYLE[pt.status] || STATUS_STYLE.pendiente;
  const device = DEVICE_STYLE[pt.device_type] || DEVICE_STYLE.ethernet;
  const top = r.y;

  const statusW = pillWidth(doc, status.label, { size: 8, padX: 8, dot: true });
  pill(doc, margin + contentW - statusW, top, status.label, {
    fg: status.fg, bg: status.bg, size: 8, h: 17, padX: 8, dot: status.dot,
  });
  line(doc, pt.name || "", margin, top - 1, { size: 15, style: "bold", color: C.ink, maxW: contentW - statusW - 14 });

  let x = margin;
  x += pill(doc, x, top + 24, tpl.label || "", { fg: device.fg, bg: device.bg, size: 7.5, h: 14, padX: 7 }) + 6;
  const progress = getPointProgress(pt);
  x += pill(doc, x, top + 24, `Avance ${progress}%`, { fg: C.primaryDark, bg: C.primarySoft, size: 7.5, h: 14, padX: 7 }) + 8;
  line(doc, `${floorName} · ${spaceName}`, x, top + 28, { size: 8, color: C.muted, maxW: margin + contentW - x });

  stroke(doc, C.border);
  doc.setLineWidth(0.6);
  doc.line(margin, top + 42, margin + contentW, top + 42);
  r.y = top + 50;
}

const FIELD_ROW = 31; // label + box + gap, matching pdfKit's field()

function drawGeneralCard(r, pt, { floorName, spaceName, tpl }) {
  const { doc } = r;
  const status = STATUS_STYLE[pt.status] || STATUS_STYLE.pendiente;
  const innerW = r.contentW - 28;
  const descH = fieldBlockHeight(doc, innerW, pt.description, { placeholder: "Sin descripción" });
  const bodyH = FIELD_ROW * 3 + descH; // three single-line rows + the description block
  const card = openCard(r, bodyH, "General");
  const half = (card.w - GAP) / 2;
  let y = card.y;
  field(doc, card.x, y, half, "Piso", floorName);
  field(doc, card.x + half + GAP, y, half, "Espacio", spaceName);
  y += FIELD_ROW;
  field(doc, card.x, y, half, "Estado", status.label, { color: status.fg });
  field(doc, card.x + half + GAP, y, half, "Plantilla", tpl.label);
  y += FIELD_ROW;
  field(doc, card.x, y, card.w, "Técnico asignado", pt.technician, { placeholder: "Sin asignar" });
  y += FIELD_ROW;
  fieldBlock(doc, card.x, y, card.w, "Descripción", pt.description, { placeholder: "Sin descripción" });
  closeCard(r, card);
}

// Project-defined custom fields, laid out like the General card's grid.
function drawCustomFieldsCard(r, pt) {
  const defs = r.project?.point_fields || [];
  if (defs.length === 0) return;
  const { doc } = r;
  const rows = Math.ceil(defs.length / 2);
  const card = openCard(r, rows * FIELD_ROW, "Campos personalizados");
  const half = (card.w - GAP) / 2;
  defs.forEach((f, i) => {
    const x = card.x + (i % 2) * (half + GAP);
    const y = card.y + Math.floor(i / 2) * FIELD_ROW;
    const raw = pt.custom_fields?.[f.id];
    const val = f.type === "checkbox" ? (raw === "true" ? "Sí" : "No") : raw;
    field(doc, x, y, half, f.label, val, { placeholder: "—" });
  });
  closeCard(r, card);
}

const ROW_H = 14;

// One checklist item per row, single column (matches the Actividades layout).
function drawActivitiesCard(r, pt, tpl) {
  const { doc } = r;
  const custom = (tpl.customChecks || []).filter((c) => c.category === "activities");
  const items = [
    ...tpl.activities.map((f) => ({ label: FIELD_LABELS[f] || f, checked: !!pt[f], field: f })),
    ...custom.map((c) => ({ label: c.label, checked: !!pt.custom_checks?.[c.id] })),
  ];
  if (items.length === 0) return;
  const card = openCard(r, items.length * ROW_H, "Actividades", "piso");
  let y = card.y;
  for (const item of items) {
    const showPonchado = item.field === "act_ponchado" && tpl.showPonchadoType;
    const badge = showPonchado ? PONCHADO_LABELS[pt.ponchado_type || "na"] : null;
    const badgeW = badge ? pillWidth(doc, badge, { size: 6.5, padX: 5 }) : 0;
    check(doc, card.x, y, item.label, item.checked, { maxW: card.w - badgeW - 10 });
    if (badge) {
      pill(doc, card.x + card.w - badgeW, y - 0.5, badge, { fg: C.text, bg: C.slateSoft, size: 6.5, h: 11, padX: 5 });
    }
    y += ROW_H;
  }
  closeCard(r, card);
}

// Two-column checklist grid, optionally badging each item with its phase.
function drawChecklistGridCard(r, title, items, { phase, itemPhase } = {}) {
  if (items.length === 0) return;
  const { doc } = r;
  const rows = Math.ceil(items.length / 2);
  const card = openCard(r, rows * ROW_H, title, phase);
  const colW = (card.w - GAP) / 2;
  items.forEach((item, i) => {
    const x = card.x + (i % 2) * (colW + GAP);
    const y = card.y + Math.floor(i / 2) * ROW_H;
    const ph = itemPhase ? PHASE_STYLE[itemPhase(item)] : null;
    const badge = ph ? ph.label.toUpperCase() : null;
    const badgeW = badge ? pillWidth(doc, badge, { size: 6, padX: 4 }) : 0;
    const endX = check(doc, x, y, item.label, item.checked, { maxW: colW - badgeW - 8 });
    if (badge) pill(doc, endX + 6, y, badge, { fg: ph.fg, bg: ph.bg, size: 6, h: 10, padX: 4 });
  });
  closeCard(r, card);
}

function drawNetworkCard(r, pt) {
  const { doc } = r;
  const card = openCard(r, 27, "Red", "rack");
  const w = (card.w - GAP * 2) / 3;
  field(doc, card.x, card.y, w, "Puerto Patch Panel", pt.puerto_patch_panel);
  field(doc, card.x + w + GAP, card.y, w, "Puerto Switch", pt.puerto_switch);
  field(doc, card.x + (w + GAP) * 2, card.y, w, "VLAN", pt.vlan);
  closeCard(r, card);
}

function drawObservationsCard(r, pt) {
  const { doc } = r;
  const hasText = !!pt.observaciones?.trim();
  const bodyH = fieldBlockHeight(doc, r.contentW - 28, pt.observaciones, { label: false, minH: 26, placeholder: "Sin observaciones" });
  const card = openCard(r, bodyH, "Observaciones");
  fieldBlock(doc, card.x, card.y, card.w, null, pt.observaciones, {
    minH: 26,
    placeholder: "Sin observaciones",
    color: hasText ? C.red : C.faint,
    bg: hasText ? C.redSoft : C.soft,
  });
  closeCard(r, card);
}

function drawEvidenceCard(r, photos) {
  const { doc } = r;
  if (photos.length === 0) {
    const card = openCard(r, 26, "Evidencia fotográfica");
    panel(doc, card.x, card.y, card.w, 26, { bg: C.soft, border: C.border, r: 5 });
    line(doc, "Sin evidencia fotográfica", card.x + 8, card.y + 13, { size: 8, color: C.faint, baseline: "middle" });
    closeCard(r, card);
    return;
  }
  // Chunked into rows so a point with many photos spills onto further pages
  // instead of overflowing off the sheet.
  const perRow = 5;
  const gap = 8;
  const size = (r.contentW - 28 - gap * (perRow - 1)) / perRow;
  const rows = [];
  for (let i = 0; i < photos.length; i += perRow) {
    rows.push(photos.slice(i, i + perRow).map((photo, j) => ({ photo, index: i + j })));
  }
  drawRowsCard(r, "Evidencia fotográfica", rows, size + 22, (row, x, y) => {
    for (const cell of row) {
      photoCell(doc, x + (cell.index % perRow) * (size + gap), y, size, cell.photo, `Foto ${cell.index + 1}`);
    }
  });
}

// Full sheet for one point: same sections, order and wording as the web view.
async function drawPointSheet(r, pt, { floorName, spaceName }) {
  const tpl = getTemplate(pt.device_type);
  const photos = await Promise.all((pt.evidencia || []).map((url) => loadPhoto(url)));

  r.crumb = `${floorName} · ${spaceName} · ${pt.name || ""}`;
  r.startPage();
  drawSheetHeader(r, pt, { floorName, spaceName, tpl });
  drawGeneralCard(r, pt, { floorName, spaceName, tpl });
  drawCustomFieldsCard(r, pt);
  drawPhaseCard(r, getPointPhaseProgress(pt));
  drawActivitiesCard(r, pt, tpl);

  const customBy = (category) => (tpl.customChecks || []).filter((c) => c.category === category);
  const accessories = [
    ...tpl.accessories.map((f) => ({ label: FIELD_LABELS[f] || f, checked: !!pt[f] })),
    ...customBy("accessories").map((c) => ({ label: c.label, checked: !!pt.custom_checks?.[c.id] })),
  ];
  drawChecklistGridCard(r, "Accesorios", accessories, { phase: "piso" });

  const equipment = [
    ...tpl.equipment.map((f) => ({ label: FIELD_LABELS[f] || f, checked: !!pt[f], phase: getEquipmentFieldPhase(f) })),
    ...customBy("equipment").map((c) => ({ label: c.label, checked: !!pt.custom_checks?.[c.id], phase: "rack" })),
  ];
  drawChecklistGridCard(r, "Equipo", equipment, { itemPhase: (item) => item.phase });

  if (tpl.showNetwork) drawNetworkCard(r, pt);
  drawObservationsCard(r, pt);
  drawEvidenceCard(r, photos);
  r.crumb = "";
}

// --- Scope rendering -------------------------------------------------------

// Summary + per-point sheets for one floor. `showBanner` adds the floor headline
// used by the project report, where several floors follow one another;
// `withDevices` adds the per-device breakdown the project summary already shows.
async function renderFloorScope(r, floor, spaces, points, { showBanner = false, withDevices = false } = {}) {
  const sortedSpaces = sortItems(spaces, "manual");
  const spaceNames = Object.fromEntries(spaces.map((s) => [s.id, s.name]));
  const ordered = sortedSpaces.flatMap((s) => sortItems(points.filter((p) => p.space_id === s.id), "manual"));
  // Points whose space was removed still belong in the report.
  const orphans = sortItems(points.filter((p) => !spaceNames[p.space_id]), "manual");
  const allPoints = [...ordered, ...orphans];

  if (showBanner) {
    r.startPage();
    drawFloorBanner(r, floor, spaces, points);
  }
  drawPhaseCard(r, aggregatePhaseProgress(points));
  drawProgressRows(r, "Avance por espacio", groupRows(sortedSpaces, points, "space_id"));
  if (withDevices) drawProgressRows(r, "Avance por tipo de dispositivo", deviceRows(points));
  // Plans are line art, so PNG keeps them crisp where JPEG would ring.
  if (floor?.plan_url) {
    drawPlanCard(r, floor, points, await loadPhoto(floor.plan_url, { maxPx: 1800, format: "PNG" }), r.project);
  }
  drawPointIndex(
    r,
    allPoints.map((p) => ({
      name: p.name || "",
      space: spaceNames[p.space_id] || "Sin espacio",
      status: p.status,
      progress: getPointProgress(p),
    }))
  );

  for (const pt of allPoints) {
    await drawPointSheet(r, pt, {
      floorName: floor?.name || "Piso",
      spaceName: spaceNames[pt.space_id] || "Sin espacio",
    });
  }
}

// --- Public API ------------------------------------------------------------
//
// The build* functions return the jsPDF document (handy for tests/previews);
// the export* wrappers are what the UI calls and trigger the download.
// `opts` carries { project, user } for the branded cover.

async function reportMeta(opts) {
  const logoDataUrl = opts.project?.logo_url ? await fetchImageDataUrl(opts.project.logo_url) : null;
  return { project: opts.project || null, user: opts.user || null, logoDataUrl };
}

export async function buildFloorDoc(floor, spaces, points, opts = {}) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const floorName = floor?.name || "Piso";
  const r = createReport(doc, `NetTrack Pro · Reporte de piso · ${floorName}`, await reportMeta(opts));

  const projectName = opts.project?.project_name;
  const counts = `${spaces.length} espacios · ${points.length} puntos`;
  drawCover(r, {
    kicker: "Reporte de piso",
    title: projectName || floorName,
    scope: projectName ? `${floorName} · ${counts}` : counts,
  });
  const stats = computeStats(points);
  drawHero(r, stats);
  drawKpiRow(r, stats);
  await renderFloorScope(r, floor, spaces, points, { withDevices: true });

  stampFooters(r);
  return doc;
}

export async function buildProjectDoc(floors, spaces, points, opts = {}) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const r = createReport(doc, "NetTrack Pro · Reporte de proyecto", await reportMeta(opts));

  drawCover(r, {
    kicker: "Reporte de proyecto",
    title: opts.project?.project_name || "Instalación de red",
    scope: `${floors.length} pisos · ${spaces.length} espacios · ${points.length} puntos`,
  });
  const stats = computeStats(points);
  drawHero(r, stats);
  drawKpiRow(r, stats);
  drawPhaseCard(r, aggregatePhaseProgress(points));
  drawProgressRows(r, "Avance por piso", groupRows(floors, points, "floor_id"));
  drawProgressRows(r, "Avance por tipo de dispositivo", deviceRows(points));

  const orderedFloors = [...floors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const floor of orderedFloors) {
    await renderFloorScope(
      r,
      floor,
      spaces.filter((s) => s.floor_id === floor.id),
      points.filter((p) => p.floor_id === floor.id),
      { showBanner: true }
    );
  }

  stampFooters(r);
  return doc;
}

// Single point: just its sheet, for the checklist view's export button.
export async function buildPointDoc(point, floor, space, opts = {}) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const r = createReport(doc, `NetTrack Pro · Punto ${point?.name || ""}`, await reportMeta(opts));
  await drawPointSheet(r, point, {
    floorName: floor?.name || "—",
    spaceName: space?.name || "—",
  });
  stampFooters(r);
  return doc;
}

export async function exportFloorPdf(floor, spaces, points, opts = {}) {
  const doc = await buildFloorDoc(floor, spaces, points, opts);
  doc.save(`piso-${(floor?.name || "piso").replace(/\s+/g, "-")}.pdf`);
}

export async function exportProjectPdf(floors, spaces, points, opts = {}) {
  const doc = await buildProjectDoc(floors, spaces, points, opts);
  doc.save(`proyecto-${(opts.project?.project_name || "nettrack").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export async function exportPointPdf(point, floor, space, opts = {}) {
  const doc = await buildPointDoc(point, floor, space, opts);
  doc.save(`punto-${(point?.name || "punto").replace(/\s+/g, "-")}.pdf`);
}
