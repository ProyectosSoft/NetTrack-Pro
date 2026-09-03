import { getPageSize, computeLayout, buildLabelLines, expandPoints, resolveTextColor } from "./labelLayout";
import { glyphPng } from "./deviceGlyphs";

// jsPDF is ~580 kB with its deps; load it on demand only when the user exports.
async function loadJsPDF() {
  const mod = await import("jspdf");
  return mod.jsPDF;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// mm -> pt (jsPDF font sizes are always in points regardless of unit).
const PT_PER_MM = 72 / 25.4;

// Draws a single label (box + text) into the doc at cell origin (x, y).
function drawLabel(doc, point, config, layout, maps, icons) {
  const { x, y } = point.__cell;
  const { labelW, labelH } = layout;
  const color = resolveTextColor(point, config);
  const [br, bg, bb] = hexToRgb(config.borderColor);
  const [fr, fg, fb] = hexToRgb(config.bgColor);
  const [tr, tg, tb] = hexToRgb(color);
  const radius = Math.min(config.cornerRadius, labelW / 2, labelH / 2);

  // Box: fill + optional border
  const hasFill = (config.bgColor || "").toLowerCase() !== "#ffffff" || config.showBorder;
  if (hasFill || config.showBorder) {
    doc.setFillColor(fr, fg, fb);
    if (config.showBorder) {
      doc.setDrawColor(br, bg, bb);
      doc.setLineWidth(config.borderWidth);
    }
    const style = config.showBorder ? "FD" : "F";
    if (radius > 0) doc.roundedRect(x, y, labelW, labelH, radius, radius, style);
    else doc.rect(x, y, labelW, labelH, style);
  }

  // Text block
  const pad = Math.min(config.padding, labelW / 2 - 0.5, labelH / 2 - 0.5);
  const innerW = labelW - pad * 2;
  const { name, meta } = buildLabelLines(point, config, maps);

  doc.setTextColor(tr, tg, tb);

  // Compute total text height to vertically centre the block.
  doc.setFont("helvetica", config.bold ? "bold" : "normal");
  doc.setFontSize(config.nameFontSize);
  const nameLines = doc.splitTextToSize(name, innerW);
  const nameLineH = (config.nameFontSize / PT_PER_MM) * 1.15;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(config.metaFontSize);
  const metaText = meta.join("  ·  ");
  const metaLines = metaText ? doc.splitTextToSize(metaText, innerW) : [];
  const metaLineH = (config.metaFontSize / PT_PER_MM) * 1.2;

  const totalH = nameLines.length * nameLineH + (metaLines.length ? 1 + metaLines.length * metaLineH : 0);
  let cursorY = y + Math.max(pad, (labelH - totalH) / 2) + nameLineH * 0.8;

  const align = config.align;
  const tx = align === "left" ? x + pad : align === "right" ? x + labelW - pad : x + labelW / 2;

  // Name (optionally with the device-type icon inline on the first line)
  doc.setFont("helvetica", config.bold ? "bold" : "normal");
  doc.setFontSize(config.nameFontSize);
  const iconPng = config.showIcon && icons ? icons.get(`${point.device_type}|${color}`) : null;
  const iconMm = (config.nameFontSize / PT_PER_MM) * 1.15;
  const iconGap = iconMm * 0.28;
  nameLines.forEach((line, li) => {
    if (iconPng && li === 0) {
      const lineW = doc.getTextWidth(line);
      const unitW = lineW + iconGap + iconMm;
      const blockLeft =
        align === "left"
          ? x + pad
          : align === "right"
          ? x + labelW - pad - unitW
          : x + labelW / 2 - unitW / 2;
      const iconX = config.iconPosition === "start" ? blockLeft : blockLeft + lineW + iconGap;
      const textLeft = config.iconPosition === "start" ? blockLeft + iconMm + iconGap : blockLeft;
      doc.text(line, textLeft, cursorY, { align: "left" });
      const iconY = cursorY - nameLineH * 0.35 - iconMm / 2;
      try { doc.addImage(iconPng, "PNG", iconX, iconY, iconMm, iconMm); } catch { /* skip icon on failure */ }
    } else {
      doc.text(line, tx, cursorY, { align });
    }
    cursorY += nameLineH;
  });

  // Meta
  if (metaLines.length) {
    cursorY += 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(config.metaFontSize);
    doc.setTextColor(Math.round(tr * 0.55 + 100), Math.round(tg * 0.55 + 100), Math.round(tb * 0.55 + 100));
    for (const line of metaLines) {
      doc.text(line, tx, cursorY, { align });
      cursorY += metaLineH;
    }
  }
}

// Builds the jsPDF document for the given points + config.
export async function buildLabelsDoc(points, config, maps = {}) {
  const jsPDF = await loadJsPDF();
  const { w, h } = getPageSize(config);
  const doc = new jsPDF({ unit: "mm", format: [w, h], orientation: config.orientation });
  const layout = computeLayout(config);

  const sequence = expandPoints(points, config.copies);
  const perPage = layout.perPage;

  // Pre-rasterise the device-type icons actually needed (one per type + colour).
  const icons = new Map();
  if (config.showIcon) {
    const wanted = new Map();
    for (const pt of sequence) {
      const color = resolveTextColor(pt, config);
      wanted.set(`${pt.device_type}|${color}`, { type: pt.device_type, color });
    }
    await Promise.all(
      [...wanted.entries()].map(async ([key, { type, color }]) => {
        const png = await glyphPng(type, color);
        if (png) icons.set(key, png);
      })
    );
  }

  sequence.forEach((pt, i) => {
    const idxOnPage = i % perPage;
    if (i > 0 && idxOnPage === 0) doc.addPage([w, h], config.orientation);
    const cell = layout.cells[idxOnPage];
    drawLabel(doc, { ...pt, __cell: cell }, config, layout, maps, icons);
  });

  return doc;
}

export async function downloadLabelsPdf(points, config, maps) {
  const doc = await buildLabelsDoc(points, config, maps);
  doc.save(`rotulos-nettrack-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Opens the PDF in a new tab and triggers the browser print dialog.
export async function printLabelsPdf(points, config, maps) {
  // Open the tab synchronously (within the click gesture) so the async jsPDF
  // import below doesn't trip pop-up blockers, then point it at the blob.
  const win = window.open("", "_blank");
  const doc = await buildLabelsDoc(points, config, maps);
  doc.autoPrint();
  const url = doc.output("bloburl");
  if (win) win.location = url;
  else window.open(url, "_blank");
}
