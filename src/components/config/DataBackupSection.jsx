import React, { useState } from "react";
import { db } from "@/api/db";
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

// CSV values are all strings; these fields must be coerced to their real types
// so the app behaves correctly (a "false" string is truthy in JS!).
const NUM_FIELDS = new Set(["order", "plan_x", "plan_y", "width", "length", "pin_opacity", "pin_border_opacity"]);
const JSON_FIELDS = new Set([
  "custom_checks", "custom_fields", "evidencia", "terminology", "hidden_modules",
  "point_fields", "activities", "accessories", "equipment", "config",
]);
const DROP_FIELDS = new Set(["created_by_id", "is_sample"]);

// True when the string looks like UTF-8 that was decoded as Latin-1 (a 0xC2/0xC3
// lead byte followed by a 0x80-0xBF continuation byte).
function hasMojibake(s) {
  for (let i = 0; i < s.length - 1; i += 1) {
    const a = s.charCodeAt(i);
    const b = s.charCodeAt(i + 1);
    if ((a === 0xc2 || a === 0xc3) && b >= 0x80 && b <= 0xbf) return true;
  }
  return false;
}

// Repairs that mojibake ("HabitaciÃ³n" -> "Habitación"). No-op for clean text.
function fixMojibake(s) {
  if (typeof s !== "string" || !hasMojibake(s)) return s;
  try {
    return new TextDecoder("utf-8").decode(Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff));
  } catch {
    return s;
  }
}

// Minimal RFC-4180 CSV parser: handles quoted fields, "" escapes and embedded
// commas / newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function coerceValue(key, raw) {
  const v = fixMojibake(raw);
  if (v === "") return NUM_FIELDS.has(key) || JSON_FIELDS.has(key) ? undefined : "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (NUM_FIELDS.has(key)) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }
  if (JSON_FIELDS.has(key)) { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function csvToRecords(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => fixMojibake(h.trim()));
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    if (r.length !== header.length) continue; // skip malformed / trailing blank
    const rec = {};
    header.forEach((h, j) => {
      if (DROP_FIELDS.has(h)) return;
      const val = coerceValue(h, r[j]);
      if (val !== undefined) rec[h] = val;
    });
    if (rec.id) records.push(rec);
  }
  return records;
}

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
      for (const e of ENTITIES) bundle[e] = await db.entities[e].list();
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

  const importFile = async (ev) => {
    const file = ev.target.files?.[0];
    ev.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const text = await file.text();
      const trimmed = text.trimStart();
      const isCsv = /\.csv$/i.test(file.name) || (!trimmed.startsWith("{") && !trimmed.startsWith("["));
      const counts = {};

      if (isCsv) {
        // A CSV file = one entity; the user picks which one.
        counts[singleEntity] = await db.entities[singleEntity].importMany(csvToRecords(text));
      } else {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          counts[singleEntity] = await db.entities[singleEntity].importMany(parsed);
        } else if (parsed && typeof parsed === "object") {
          for (const e of ENTITIES) {
            if (Array.isArray(parsed[e])) counts[e] = await db.entities[e].importMany(parsed[e]);
          }
          if (Object.keys(counts).length === 0) {
            throw new Error("El JSON no tiene ninguna entidad reconocida (ProjectInfo, Floor, Space, InstallationPoint, ...).");
          }
        } else {
          throw new Error("Formato no reconocido. Usa CSV, un JSON {Entidad: [...]} o una lista de registros.");
        }
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
          <p className="text-xs text-muted-foreground">Exporta un respaldo de todos los datos o importa desde un archivo CSV/JSON.</p>
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
        <p className="text-sm font-medium">Importar (CSV o JSON)</p>
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>La importación <strong>sobrescribe por ID</strong>: si un registro ya existe con el mismo ID, se reemplaza. Los IDs originales se conservan para no romper las relaciones. Corrige acentos y tipos automáticamente.</span>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Para un <strong>CSV</strong> (o una lista JSON de una sola entidad), elige a qué corresponde:</p>
          <Select value={singleEntity} onValueChange={setSingleEntity}>
            <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => <SelectItem key={e} value={e}>{LABELS[e]} ({e})</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Si es un respaldo JSON completo con forma <code>{"{ Entidad: [...] }"}</code>, el selector se ignora y se importa todo.</p>
        </div>

        <label className="inline-flex items-center gap-1.5 text-sm px-3 h-9 rounded-md border border-border cursor-pointer hover:bg-muted w-fit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Elegir archivo (CSV o JSON) e importar
          <input type="file" accept=".csv,text/csv,.json,application/json" className="hidden" onChange={importFile} disabled={busy} />
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
