import { getEffectiveTemplate } from "./checklistTemplates";

// A point counts as "con observaciones" when flagged with that status OR when it
// carries any observation text, so filters surface noted points regardless of
// their workflow status.
export function hasObservations(point) {
  return point?.status === "con_observaciones" || !!point?.observaciones?.trim();
}

// Installation phases. The "Piso" phase groups the on-site work (activities +
// accessories); the "Rack" phase groups the equipment/rack work. Custom checks
// follow their category: activities/accessories -> piso, equipment -> rack.
export const PHASES = [
  { key: "piso", label: "Piso" },
  { key: "rack", label: "Rack" },
];

// Equipment fields that belong to the Piso (on-site) phase even though they live
// in the "equipment" template group. The remaining equipment fields are Rack.
const PISO_EQUIPMENT = new Set(["equipo_instalado", "equipo_probado"]);

// Phase for a single equipment field. Only meaningful for equipment-group fields;
// activities/accessories are always Piso and are grouped by category elsewhere.
export function getEquipmentFieldPhase(field) {
  return PISO_EQUIPMENT.has(field) ? "piso" : "rack";
}

// Returns the field keys + custom checks that belong to each phase for a template.
function phaseGroups(tpl) {
  const equipmentPiso = tpl.equipment.filter((f) => PISO_EQUIPMENT.has(f));
  const equipmentRack = tpl.equipment.filter((f) => !PISO_EQUIPMENT.has(f));
  return {
    piso: {
      fields: [...tpl.activities, ...tpl.accessories, ...equipmentPiso],
      custom: (tpl.customChecks || []).filter((c) => c.category === "activities" || c.category === "accessories"),
    },
    rack: {
      fields: [...equipmentRack],
      custom: (tpl.customChecks || []).filter((c) => c.category === "equipment"),
    },
  };
}

export function getPointProgress(point) {
  if (!point) return 0;
  if (point.status === "finalizado") return 100;

  const tpl = getEffectiveTemplate(point);
  const fields = [
    ...tpl.activities,
    ...tpl.accessories,
    ...tpl.equipment,
  ];
  const customChecks = tpl.customChecks || [];

  const done = fields.filter((f) => point[f]).length;
  const customDone = customChecks.filter((c) => point.custom_checks?.[c.id]).length;
  const total = fields.length + customChecks.length;
  return total ? Math.round(((done + customDone) / total) * 100) : 0;
}

// Per-phase progress: { piso: {done, total, pct}, rack: {done, total, pct} }.
// A finalized point counts as fully done in every phase, matching getPointProgress.
export function getPointPhaseProgress(point) {
  const tpl = getEffectiveTemplate(point);
  const groups = phaseGroups(tpl);
  const finalizado = point?.status === "finalizado";
  const result = {};
  for (const { key } of PHASES) {
    const { fields, custom } = groups[key];
    const total = fields.length + custom.length;
    const done = point
      ? fields.filter((f) => point[f]).length + custom.filter((c) => point.custom_checks?.[c.id]).length
      : 0;
    const effectiveDone = finalizado ? total : done;
    result[key] = { done: effectiveDone, total, pct: total ? Math.round((effectiveDone / total) * 100) : 0 };
  }
  return result;
}

// Aggregate phase progress across many points, weighting by checklist item count
// so phases with more items don't get diluted. Returns the same per-phase shape.
export function aggregatePhaseProgress(points) {
  const acc = { piso: { done: 0, total: 0 }, rack: { done: 0, total: 0 } };
  for (const p of points) {
    const ph = getPointPhaseProgress(p);
    for (const { key } of PHASES) {
      acc[key].done += ph[key].done;
      acc[key].total += ph[key].total;
    }
  }
  const out = {};
  for (const { key } of PHASES) {
    out[key] = { ...acc[key], pct: acc[key].total ? Math.round((acc[key].done / acc[key].total) * 100) : 0 };
  }
  return out;
}