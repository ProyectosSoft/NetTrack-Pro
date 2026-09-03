import React, { useMemo, useState } from "react";
import { db } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, AlertTriangle, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useFloors, useSpaces, usePoints, useInvalidateData } from "@/lib/queries";
import DataError from "@/components/shared/DataError";

const DEVICE_CODE = { ethernet: "ETH", camara: "CAM", access_point: "AP" };
const NO_SPACE = "none"; // bucket for points without an associated space -> pasillo

// Words to skip when abbreviating a space name, so "Sala de Experiencia" -> EXP.
const STOP_WORDS = new Set(["sala", "de", "del", "la", "el", "los", "las", "un", "una", "y", "area"]);

// Digits of the floor name: "Piso 2" -> "2", "P4" -> "4".
function floorNum(floor) {
  const m = (floor?.name || "").match(/\d+/);
  return m ? m[0] : null;
}

// Suggested code for a space name: numeric names are kept as-is (201 -> 201);
// text names use the first 3 letters of the first meaningful word, accent-stripped
// ("Sala de Experiencia" -> EXP, "Sala de Juntas" -> JUN, "Pasillo" -> PAS).
function autoCode(name) {
  const raw = (name || "").trim();
  if (/^\d+$/.test(raw)) return raw;
  const clean = raw.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = clean.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).filter((w) => !STOP_WORDS.has(w));
  const first = words[0] || clean.replace(/[^a-z0-9]/gi, "") || "ESP";
  return first.slice(0, 3).toUpperCase();
}

export default function RenamePointsSection() {
  const { toast } = useToast();
  const floorsQ = useFloors();
  const spacesQ = useSpaces();
  const pointsQ = usePoints();
  const floors = floorsQ.data ?? [];
  const spaces = spacesQ.data ?? [];
  const points = pointsQ.data ?? [];
  const invalidate = useInvalidateData();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterFloor, setFilterFloor] = useState("all");
  const [codeOverrides, setCodeOverrides] = useState({}); // spaceKey -> manual code

  // Distinct spaces actually used by points (+ a pasillo bucket for space-less points).
  const spaceMeta = useMemo(() => {
    const spaceById = Object.fromEntries(spaces.map((s) => [s.id, s]));
    const map = new Map();
    for (const p of points) {
      const key = p.space_id || NO_SPACE;
      if (map.has(key)) continue;
      if (key === NO_SPACE) {
        map.set(key, { key, label: "Pasillo (puntos sin espacio)", defaultCode: "PAS" });
      } else {
        const s = spaceById[key];
        map.set(key, { key, label: s?.name || "(espacio desconocido)", defaultCode: autoCode(s?.name) });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [points, spaces]);

  const codeFor = useMemo(() => {
    const defaults = Object.fromEntries(spaceMeta.map((m) => [m.key, m.defaultCode]));
    return (key) => (codeOverrides[key] ?? defaults[key] ?? "ESP");
  }, [spaceMeta, codeOverrides]);

  const { rows, warnings } = useMemo(() => {
    const floorById = Object.fromEntries(floors.map((f) => [f.id, f]));

    // Group by floor + space (or pasillo bucket) + device so numbering restarts per group.
    const groups = new Map();
    for (const p of points) {
      const key = `${p.floor_id}|${p.space_id || NO_SPACE}|${p.device_type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    const newNameById = {};
    const warn = new Set();
    for (const pts of groups.values()) {
      pts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) ||
        (a.name || "").localeCompare(b.name || "", undefined, { numeric: true }));
      pts.forEach((p, i) => {
        const f = floorById[p.floor_id];
        const fn = floorNum(f);
        const dc = DEVICE_CODE[p.device_type] || (p.device_type || "DEV").slice(0, 3).toUpperCase();
        const sc = codeFor(p.space_id || NO_SPACE);
        if (!f) warn.add(`Un punto no tiene piso asociado y se omitirá.`);
        else if (fn === null) warn.add(`El piso "${f.name}" no tiene un número en su nombre.`);
        newNameById[p.id] = (f && fn !== null) ? `P${fn}-${sc}-${dc}${i + 1}` : null;
      });
    }

    const rows = points
      .map((p) => ({ id: p.id, floor_id: p.floor_id, old: p.name || "", neu: newNameById[p.id], valid: !!newNameById[p.id] }))
      .map((r) => ({ ...r, changed: r.valid && r.old !== r.neu }))
      .sort((a, b) => (a.neu || a.old || "").localeCompare(b.neu || b.old || "", undefined, { numeric: true }));

    return { rows, warnings: [...warn] };
  }, [points, floors, codeFor]);

  const visibleRows = useMemo(
    () => (filterFloor === "all" ? rows : rows.filter((r) => r.floor_id === filterFloor)),
    [rows, filterFloor]
  );
  const changes = visibleRows.filter((r) => r.changed);

  const setCode = (key, value) => setCodeOverrides((prev) => ({ ...prev, [key]: value.toUpperCase() }));

  const apply = async () => {
    setApplying(true);
    setProgress(0);
    let done = 0;
    let failed = 0;
    for (const r of changes) {
      try {
        await db.entities.InstallationPoint.update(r.id, { name: r.neu });
      } catch (e) {
        console.error("No se pudo renombrar", r.id, e);
        failed++;
      }
      done++;
      setProgress(done);
    }
    setApplying(false);
    setConfirmOpen(false);
    invalidate();
    if (failed) {
      toast({ variant: "destructive", title: "Renombrado parcial", description: `${done - failed} aplicados, ${failed} fallaron.` });
    } else {
      toast({ title: "Puntos renombrados", description: `${done} puntos actualizados.` });
    }
  };

  if (floorsQ.isLoading || spacesQ.isLoading || pointsQ.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (floorsQ.isError || spacesQ.isError || pointsQ.isError) {
    return <DataError onRetry={invalidate} />;
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Wand2 className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-heading font-semibold text-sm">Renombrar puntos de instalación</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Aplica el formato <span className="font-mono">P&lt;piso&gt;-&lt;espacio&gt;-&lt;DISPOSITIVO&gt;&lt;n&gt;</span> a
              todos los puntos (ej: <span className="font-mono">P2-201-ETH1</span>). El piso sale de su nombre; el código de
              cada espacio se puede ajustar abajo; los puntos sin espacio se tratan como pasillo (<span className="font-mono">PAS</span>);
              la numeración reinicia por espacio y tipo de dispositivo.
            </p>
          </div>
        </div>
      </div>

      {/* Editable space codes */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-heading font-semibold text-sm mb-1">Códigos de espacio</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Sugeridos automáticamente. Corrige cualquiera antes de aplicar (ej: Sala de Experiencia → EXP).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {spaceMeta.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-sm">{m.label}</span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <Input
                value={codeFor(m.key)}
                onChange={(e) => setCode(m.key, e.target.value)}
                className="w-24 h-8 font-mono text-sm uppercase"
                maxLength={8}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        {warnings.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium mb-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Advertencias
            </div>
            <ul className="text-xs text-amber-700/90 list-disc pl-5 space-y-0.5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={filterFloor} onValueChange={setFilterFloor}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Piso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los pisos</SelectItem>
                {floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{changes.length}</span> de {visibleRows.length} puntos cambiarán de nombre.
            </p>
          </div>
          <Button size="sm" disabled={changes.length === 0} onClick={() => setConfirmOpen(true)}>
            <Wand2 className="w-4 h-4 mr-2" /> Aplicar {filterFloor === "all" ? "todo" : "este piso"}
          </Button>
        </div>
      </div>

      {visibleRows.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-heading font-semibold text-sm mb-3">Vista previa</h3>
          <div className="max-h-[420px] overflow-y-auto divide-y divide-border text-sm">
            {visibleRows.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 py-2 ${r.changed ? "" : "opacity-50"}`}>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">{r.old || <em>(sin nombre)</em>}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className={`flex-1 min-w-0 truncate font-mono ${r.valid ? (r.changed ? "text-primary font-medium" : "") : "text-red-500"}`}>
                  {r.valid ? r.neu : "— no se puede generar —"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o && !applying) setConfirmOpen(false); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Renombrar {changes.length} puntos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se actualizará el nombre de {changes.length} puntos de instalación en la base de datos.
              Esta acción no se puede deshacer automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); apply(); }}
              disabled={applying}
            >
              {applying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando {progress}/{changes.length}</> : "Sí, renombrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
