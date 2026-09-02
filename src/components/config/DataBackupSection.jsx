import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useInvalidateData } from "@/lib/queries";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, Loader2, Database, AlertTriangle } from "lucide-react";

// Entities we back up / restore, in an order that reads naturally. There are no
// DB foreign keys (references are plain id strings), so import order is free.
const ENTITIES = [
  "ProjectInfo",
  "Floor",
  "Space",
  "InstallationPoint",
  "ChecklistTemplate",
  "Technician",
  "LabelTemplate",
];

const LABELS = {
  ProjectInfo: "Proyectos",
  Floor: "Pisos",
  Space: "Espacios",
  InstallationPoint: "Puntos",
  ChecklistTemplate: "Plantillas de checklist",
  Technician: "Técnicos",
  LabelTemplate: "Plantillas de rótulos",
};

export default function DataBackupSection() {
  const { toast } = useToast();
  const invalidate = useInvalidateData();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [singleEntity, setSingleEntity] = useState("InstallationPoint");

  const exportAll = async () => {
    setBusy(true);
    setResult(null);
    try {
      const bundle = {};
      for (const e of ENTITIES) bundle[e] = await base44.entities[e].list();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nettrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Respaldo generado", description: "Se descargó un JSON con todos los datos." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al exportar", description: e?.message });
    }
    setBusy(false);
  };

  // Upsert one entity's records, preserving their original id so cross-entity
  // references (floor_id, space_id, project_id) keep pointing at the right rows.
  const importRecords = async (entity, rows) => {
    let n = 0;
    for (const rec of rows) {
      if (!rec || !rec.id) continue;
      await base44.entities[entity].update(rec.id, rec);
      n += 1;
    }
    return n;
  };

  const importFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const parsed = JSON.parse(await file.text());
      const counts = {};

      if (Array.isArray(parsed)) {
        // A bare array = one entity's export; the user picks which one.
        counts[singleEntity] = await importRecords(singleEntity, parsed);
      } else if (parsed && typeof parsed === "object") {
        // A bundle keyed by entity name (also what our export produces).
        for (const e of ENTITIES) {
          if (Array.isArray(parsed[e])) counts[e] = await importRecords(e, parsed[e]);
        }
        if (Object.keys(counts).length === 0) {
          throw new Error("El JSON no tiene ninguna entidad reconocida (ProjectInfo, Floor, Space, InstallationPoint, ...).");
        }
      } else {
        throw new Error("Formato no reconocido. Usa un JSON con forma {Entidad: [...]} o una lista de registros.");
      }

      setResult(counts);
      invalidate();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast({ title: "Importación completada", description: `${total} registros cargados.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al importar", description: e?.message });
    }
    setBusy(false);
  };

  return (
    <div className="bg-white rounded-xl border border-border p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Database className="w-4.5 h-4.5 text-primary" />
        </div>
        <div>
          <h3 className="font-heading font-semibold text-sm">Datos (respaldo e importación)</h3>
          <p className="text-xs text-muted-foreground">Exporta un respaldo o carga datos (por ejemplo, migrados desde Base44).</p>
        </div>
      </div>

      {/* Export */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={exportAll} disabled={busy} size="sm" variant="outline">
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
          Exportar respaldo (JSON)
        </Button>
        <span className="text-xs text-muted-foreground">Descarga todos los datos actuales.</span>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-sm font-medium">Importar</p>
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>La importación <strong>sobrescribe por ID</strong>: si un registro ya existe con el mismo ID, se reemplaza. Los IDs originales se conservan para no romper las relaciones. Haz un respaldo antes si tienes dudas.</span>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Si tu archivo es una <strong>lista de una sola entidad</strong> (ej. export de Base44 por entidad), elige cuál es:</p>
          <Select value={singleEntity} onValueChange={setSingleEntity}>
            <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => <SelectItem key={e} value={e}>{LABELS[e]} ({e})</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Si es un respaldo completo con forma <code>{"{ Entidad: [...] }"}</code>, el selector se ignora y se importa todo.</p>
        </div>

        <label className="inline-flex items-center gap-1.5 text-sm px-3 h-9 rounded-md border border-border cursor-pointer hover:bg-muted w-fit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Elegir archivo JSON e importar
          <input type="file" accept="application/json,.json" className="hidden" onChange={importFile} disabled={busy} />
        </label>
      </div>

      {result && (
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium mb-1.5">Resultado</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {Object.entries(result).map(([e, n]) => (
              <li key={e}>{LABELS[e] || e}: <span className="font-semibold text-foreground">{n}</span> registros</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
