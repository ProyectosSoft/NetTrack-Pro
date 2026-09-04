import React, { useMemo, useState } from "react";
import { db } from "@/api/db";
import { useScopedData } from "@/lib/ProjectContext";
import { useTemplates, useInvalidateData } from "@/lib/queries";
import { getTemplate, FIELD_LABELS, ALL_FIELDS } from "@/lib/checklistTemplates";
import { useAction } from "@/lib/useAction";
import { useUndoableToast } from "@/lib/UndoContext";
import DataError from "@/components/shared/DataError";
import MultiSelectFilter from "@/components/shared/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ListChecks, Check, X } from "lucide-react";

const GROUPS = [
  { key: "activities", label: "Actividades" },
  { key: "accessories", label: "Accesorios" },
  { key: "equipment", label: "Equipos" },
];

// Which standard group a field key belongs to.
function groupOf(key) {
  if (ALL_FIELDS.activities.includes(key)) return "activities";
  if (ALL_FIELDS.accessories.includes(key)) return "accessories";
  if (ALL_FIELDS.equipment.includes(key)) return "equipment";
  return "other";
}

export default function BulkChecklist() {
  const { floors, points, isLoading, isError } = useScopedData();
  useTemplates(); // prime template cache
  const invalidate = useInvalidateData();
  const run = useAction();
  const undoToast = useUndoableToast();

  const [selFloors, setSelFloors] = useState(() => new Set());
  const [selDevices, setSelDevices] = useState(() => new Set());
  const [selItems, setSelItems] = useState(() => new Set()); // keys, custom as "custom:<id>"
  const [value, setValue] = useState(true); // true = completado, false = pendiente
  const [applying, setApplying] = useState(false);

  const floorOptions = useMemo(() => floors.map((f) => ({ value: f.id, label: f.name })), [floors]);

  const deviceOptions = useMemo(() => {
    const present = [...new Set(points.map((p) => p.device_type).filter(Boolean))];
    return present.map((t) => ({ value: t, label: getTemplate(t).label || t }));
  }, [points]);

  // Points matching the floor + device scope.
  const matching = useMemo(
    () =>
      points.filter((p) => {
        if (selFloors.size > 0 && !selFloors.has(p.floor_id)) return false;
        if (selDevices.size > 0 && !selDevices.has(p.device_type)) return false;
        return true;
      }),
    [points, selFloors, selDevices]
  );

  // Checklist items available for the selected device types (union of templates).
  const items = useMemo(() => {
    const types = selDevices.size > 0
      ? [...selDevices]
      : [...new Set(points.map((p) => p.device_type).filter(Boolean))];
    const tpls = types.map((t) => getTemplate(t));
    const std = new Set();
    const customs = new Map();
    for (const t of tpls) {
      for (const k of [...(t.activities || []), ...(t.accessories || []), ...(t.equipment || [])]) std.add(k);
      for (const c of t.customChecks || []) customs.set(c.id, c.label);
    }
    const byGroup = { activities: [], accessories: [], equipment: [], other: [] };
    for (const k of std) byGroup[groupOf(k)].push({ key: k, label: FIELD_LABELS[k] || k });
    for (const [id, label] of customs) byGroup.other.push({ key: `custom:${id}`, label });
    for (const g of Object.keys(byGroup)) byGroup[g].sort((a, b) => a.label.localeCompare(b.label));
    return byGroup;
  }, [selDevices, points]);

  const toggleItem = (key) =>
    setSelItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // How many of the matching points would actually change for the chosen items.
  const affected = useMemo(() => {
    if (selItems.size === 0) return 0;
    let n = 0;
    for (const p of matching) {
      const tpl = getTemplate(p.device_type);
      let changes = false;
      for (const key of selItems) {
        if (key.startsWith("custom:")) {
          const id = key.slice(7);
          if ((tpl.customChecks || []).some((c) => c.id === id) && !!(p.custom_checks?.[id]) !== value) { changes = true; break; }
        } else {
          const applies = [...tpl.activities, ...tpl.accessories, ...tpl.equipment].includes(key);
          if (applies && !!p[key] !== value) { changes = true; break; }
        }
      }
      if (changes) n += 1;
    }
    return n;
  }, [matching, selItems, value]);

  const apply = () => run(async () => {
    if (selItems.size === 0 || matching.length === 0) return;
    setApplying(true);
    try {
      const snapshot = [];
      for (const p of matching) {
        const tpl = getTemplate(p.device_type);
        const patch = {};
        let custom = null;
        for (const key of selItems) {
          if (key.startsWith("custom:")) {
            const id = key.slice(7);
            if ((tpl.customChecks || []).some((c) => c.id === id)) {
              custom = custom || { ...(p.custom_checks || {}) };
              custom[id] = value;
            }
          } else if ([...tpl.activities, ...tpl.accessories, ...tpl.equipment].includes(key)) {
            patch[key] = value;
          }
        }
        if (custom) patch.custom_checks = custom;
        if (Object.keys(patch).length === 0) continue;
        snapshot.push({ ...p });
        await db.entities.InstallationPoint.update(p.id, patch);
      }
      invalidate();
      if (snapshot.length === 0) return;
      undoToast({
        title: "Checklist actualizado",
        description: `${snapshot.length} punto(s) → ${value ? "completado" : "pendiente"}.`,
        label: "Checklist masivo",
        run: () => db.entities.InstallationPoint.importMany(snapshot),
      });
    } finally {
      setApplying(false);
    }
  }, "No se pudo aplicar el checklist masivo");

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <DataError onRetry={invalidate} />;

  const hasItems = GROUPS.concat({ key: "other", label: "Otros" }).some((g) => items[g.key]?.length);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
          <ListChecks className="w-6 h-6 text-primary" /> Checklist masivo
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Marca ítems del checklist para varios puntos a la vez (por piso y tipo de dispositivo).
        </p>
      </div>

      {/* Scope */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <h2 className="font-semibold text-sm">1. Elige los puntos</h2>
        <div className="flex flex-wrap gap-3">
          <MultiSelectFilter className="w-full sm:w-56" allLabel="Todos los pisos" options={floorOptions} selected={selFloors} onChange={setSelFloors} />
          <MultiSelectFilter className="w-full sm:w-56" allLabel="Todos los dispositivos" options={deviceOptions} selected={selDevices} onChange={setSelDevices} />
        </div>
        <p className="text-xs text-muted-foreground">{matching.length} punto(s) en el alcance seleccionado.</p>
      </div>

      {/* Items */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-sm">2. Ítems a aplicar</h2>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
            <button
              onClick={() => setValue(true)}
              className={`px-3 py-1 rounded-md flex items-center gap-1.5 ${value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Check className="w-3.5 h-3.5" /> Completado
            </button>
            <button
              onClick={() => setValue(false)}
              className={`px-3 py-1 rounded-md flex items-center gap-1.5 ${!value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              <X className="w-3.5 h-3.5" /> Pendiente
            </button>
          </div>
        </div>

        {!hasItems ? (
          <p className="text-sm text-muted-foreground">No hay ítems disponibles para el alcance seleccionado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {GROUPS.concat({ key: "other", label: "Otros" }).map((g) =>
              items[g.key]?.length ? (
                <div key={g.key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{g.label}</p>
                  <div className="space-y-1">
                    {items[g.key].map((it) => (
                      <label key={it.key} className="flex items-center gap-2.5 cursor-pointer py-1">
                        <Checkbox checked={selItems.has(it.key)} onCheckedChange={() => toggleItem(it.key)} />
                        <span className="text-sm">{it.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Apply */}
      <div className="sticky bottom-4">
        <Button
          onClick={apply}
          disabled={applying || selItems.size === 0 || affected === 0}
          className="w-full shadow-lg"
        >
          {applying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {selItems.size === 0
            ? "Selecciona al menos un ítem"
            : affected === 0
            ? "Nada por cambiar con esta selección"
            : `Aplicar a ${affected} punto(s) → ${value ? "completado" : "pendiente"}`}
        </Button>
      </div>
    </div>
  );
}
