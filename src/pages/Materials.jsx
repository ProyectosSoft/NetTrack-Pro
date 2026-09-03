import React, { useMemo, useState } from "react";
import { useScopedData } from "@/lib/ProjectContext";
import { useTemplates, useInvalidateData } from "@/lib/queries";
import { getTemplate, FIELD_LABELS } from "@/lib/checklistTemplates";
import DataError from "@/components/shared/DataError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Package, Table as TableIcon } from "lucide-react";

const DEVICE_LABELS = { ethernet: "Ethernet", camara: "Cámara CCTV", access_point: "AP WiFi" };

function toCsv(rows) {
  const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export default function Materials() {
  const { floors, points, isLoading, isError } = useScopedData();
  useTemplates(); // ensure template cache is primed
  const invalidate = useInvalidateData();
  const [floorId, setFloorId] = useState("all");

  const scoped = useMemo(
    () => (floorId === "all" ? points : points.filter((p) => p.floor_id === floorId)),
    [points, floorId]
  );

  const { devices, materials, total } = useMemo(() => {
    const dev = {};
    const mat = {};
    for (const p of scoped) {
      dev[p.device_type] = (dev[p.device_type] || 0) + 1;
      const tpl = getTemplate(p.device_type);
      for (const f of tpl.accessories || []) {
        const label = FIELD_LABELS[f] || f;
        mat[label] = (mat[label] || 0) + 1;
      }
      for (const c of (tpl.customChecks || []).filter((x) => x.category === "accessories")) {
        mat[c.label] = (mat[c.label] || 0) + 1;
      }
    }
    const devices = Object.entries(dev).map(([k, n]) => ({ label: DEVICE_LABELS[k] || k, n })).sort((a, b) => b.n - a.n);
    const materials = Object.entries(mat).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
    return { devices, materials, total: scoped.length };
  }, [scoped]);

  const exportCsv = () => {
    const rows = [
      ["Categoría", "Ítem", "Cantidad"],
      ...devices.map((d) => ["Dispositivo", d.label, d.n]),
      ...materials.map((m) => ["Accesorio", m.label, m.n]),
    ];
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `materiales-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <DataError onRetry={invalidate} />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" /> Materiales
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Conteo estimado de dispositivos y accesorios según las plantillas ({total} puntos).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={floorId} onValueChange={setFloorId}>
            <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Piso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pisos</SelectItem>
              {floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={exportCsv} size="sm" variant="outline" disabled={total === 0}><TableIcon className="w-4 h-4 mr-1.5" /> CSV</Button>
        </div>
      </div>

      {total === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay puntos para calcular materiales.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <MaterialTable title="Dispositivos" rows={devices} />
          <MaterialTable title="Accesorios / materiales" rows={materials} />
        </div>
      )}
    </div>
  );
}

function MaterialTable({ title, rows }) {
  const total = rows.reduce((a, b) => a + b.n, 0);
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm">{title}</h3>
        <span className="text-xs text-muted-foreground">{total} u.</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm">{r.label}</span>
              <span className="text-sm font-semibold tabular-nums">{r.n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
