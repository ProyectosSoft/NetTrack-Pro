// Device-type glyphs shared by the label preview (as <img>) and the PDF export
// (rasterised to PNG). Stroke-based, 24x24 viewBox, coloured on demand.

export const DEVICE_GLYPHS = {
  // RJ45 / ethernet jack
  ethernet:
    '<rect x="4" y="8" width="16" height="11" rx="1.5"/>' +
    '<path d="M8 8V5h8v3"/>' +
    '<line x1="8" y1="12" x2="8" y2="15"/>' +
    '<line x1="12" y1="12" x2="12" y2="15"/>' +
    '<line x1="16" y1="12" x2="16" y2="15"/>',
  // CCTV camera
  camara:
    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
    '<circle cx="12" cy="13" r="4"/>',
  // WiFi waves
  access_point:
    '<path d="M5 12.55a11 11 0 0 1 14.08 0"/>' +
    '<path d="M1.42 9a16 16 0 0 1 21.16 0"/>' +
    '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>' +
    '<line x1="12" y1="20" x2="12.01" y2="20"/>',
};

export function glyphSvg(type, color = "#000000") {
  const inner = DEVICE_GLYPHS[type] || DEVICE_GLYPHS.ethernet;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  );
}

// data: URL usable directly as an <img> src in the preview.
export function glyphDataUrl(type, color) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(glyphSvg(type, color));
}

// Rasterise a glyph to a PNG data URL (for jsPDF addImage). Resolves null if the
// browser can't render it.
export function glyphPng(type, color, px = 96) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = px;
          canvas.height = px;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, px, px);
          resolve(canvas.toDataURL("image/png"));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = glyphDataUrl(type, color);
    } catch {
      resolve(null);
    }
  });
}
