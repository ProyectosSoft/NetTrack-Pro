import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTemplates } from "@/lib/queries";
import { useScopedData } from "@/lib/ProjectContext";
import StatusPieChart from "@/components/dashboard/StatusPieChart";
import ProgressRing from "@/components/shared/ProgressRing";
import ProgressBar from "@/components/shared/ProgressBar";
import StatusBadge from "@/components/shared/StatusBadge";
import DeviceIcon from "@/components/shared/DeviceIcon";
import { getPointProgress, aggregatePhaseProgress, hasObservations } from "@/lib/pointProgress";
import { getTemplate, FIELD_LABELS } from "@/lib/checklistTemplates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, AlertCircle, Clock, Loader2, ListTodo, MessageSquareText } from "lucide-react";

const STATUS_COLORS = { pendiente: "#94a3b8", en_proceso: "#f59e0b", finalizado: "#22c55e", con_observaciones: "#ef4444" };

// A point is "missing" a checklist item when the item applies to its device
// template but hasn't been checked. Finalized points are considered complete.
function isPointMissing(point, fieldKey) {
  if (!fieldKey || point.status === "finalizado") return false;
  const tpl = getTemplate(point.device_type);
  if (fieldKey.startsWith("custom:")) {
    const id = fieldKey.slice(7);
    const applies = (tpl.customChecks || []).some((c) => c.id === id);
    return applies && !point.custom_checks?.[id];
  }
  const applies = [...tpl.activities, ...tpl.accessories, ...tpl.equipment].includes(fieldKey);
  return applies && !point[fieldKey];
}

export default function Dashboard() {
  const { floors, spaces, points, isLoading: loading } = useScopedData();
  const { data: templates = [] } = useTemplates();
  const [filterFloor, setFilterFloor] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTech, setFilterTech] = useState("all");
  const [filterDevice, setFilterDevice] = useState("all");
  const [filterMissing, setFilterMissing] = useState("all");

  const filtered = useMemo(() => {
    return points.filter((p) => {
      if (filterFloor !== "all" && p.floor_id !== filterFloor) return false;
      if (filterStatus !== "all") {
        // "con_observaciones" matches by status OR by observation text.
        const ok = filterStatus === "con_observaciones" ? hasObservations(p) : p.status === filterStatus;
        if (!ok) return false;
      }
      if (filterTech !== "all" && p.technician !== filterTech) return false;
      if (filterDevice !== "all" && p.device_type !== filterDevice) return false;
      if (filterMissing !== "all" && !isPointMissing(p, filterMissing)) return false;
      return true;
    });
  }, [points, filterFloor, filterStatus, filterTech, filterDevice, filterMissing]);

  const technicians = useMemo(() => [...new Set(points.map((p) => p.technician).filter(Boolean))], [points]);

  // Device types actually present in the data, labelled from their template.
  const deviceTypes = useMemo(() => {
    const present = [...new Set(points.map((p) => p.device_type).filter(Boolean))];
    return present.map((t) => ({ value: t, label: getTemplate(t).label || t }));
    // templates dep: re-label once DB templates load into the cache
  }, [points, templates]);

  // Union of checklist items across the templates in use, for the "falta por…" filter.
  const missingOptions = useMemo(() => {
    const seen = new Map();
    const present = [...new Set(points.map((p) => p.device_type).filter(Boolean))];
    for (const dt of present) {
      const tpl = getTemplate(dt);
      for (const f of [...tpl.activities, ...tpl.accessories, ...tpl.equipment]) {
        if (!seen.has(f)) seen.set(f, FIELD_LABELS[f] || f);
      }
      for (const c of tpl.customChecks || []) {
        const key = `custom:${c.id}`;
        if (!seen.has(key)) seen.set(key, c.label || c.id);
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [points, templates]);
  const floorMap = useMemo(() => Object.fromEntries(floors.map((f) => [f.id, f.name])), [floors]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s.name])), [spaces]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const finalizados = filtered.filter((p) => p.status === "finalizado").length;
    const enProceso = filtered.filter((p) => p.status === "en_proceso").length;
    const pendientes = filtered.filter((p) => p.status === "pendiente").length;
    // Observation-aware, so it matches the "Con observaciones" filter.
    const conObs = filtered.filter(hasObservations).length;
    const pct = total ? filtered.reduce((sum, p) => sum + getPointProgress(p), 0) / total : 0;
    return { total, finalizados, enProceso, pendientes, conObs, pct };
  }, [filtered]);

  const floorProgress = useMemo(() => {
    return floors.map((f) => {
      const fp = filtered.filter((p) => p.floor_id === f.id);
      const done = fp.filter((p) => p.status === "finalizado").length;
      const pct = fp.length ? Math.round(fp.reduce((sum, p) => sum + getPointProgress(p), 0) / fp.length) : 0;
      return { id: f.id, name: f.name, total: fp.length, done, pct };
    }).filter((f) => f.total > 0);
  }, [floors, filtered]);

  const spaceProgress = useMemo(() => {
    if (filterFloor === "all") return [];
    const floorSpaces = spaces.filter((s) => s.floor_id === filterFloor);
    return floorSpaces.map((s) => {
      const sp = filtered.filter((p) => p.space_id === s.id);
      const done = sp.filter((p) => p.status === "finalizado").length;
      const pct = sp.length ? Math.round(sp.reduce((sum, p) => sum + getPointProgress(p), 0) / sp.length) : 0;
      return { id: s.id, name: s.name, total: sp.length, done, pct };
    }).filter((s) => s.total > 0);
  }, [spaces, filtered, filterFloor]);

  const deviceData = useMemo(() => {
    const types = ["ethernet", "camara", "access_point"];
    const labels = { ethernet: "Ethernet", camara: "Cámaras", access_point: "AP WiFi" };
    return types.map((t) => {
      const fp = filtered.filter((p) => p.device_type === t);
      const done = fp.filter((p) => p.status === "finalizado").length;
      const pct = fp.length ? Math.round(fp.reduce((sum, p) => sum + getPointProgress(p), 0) / fp.length) : 0;
      return { name: labels[t], total: fp.length, done, pct };
    }).filter((d) => d.total > 0);
  }, [filtered]);

  const phaseProgress = useMemo(() => aggregatePhaseProgress(filtered), [filtered]);

  // Pie is a distribution by actual status (mutually exclusive, sums to total),
  // so it counts raw status rather than the observation-aware KPI.
  const statusPieData = useMemo(() => {
    const c = { pendiente: 0, en_proceso: 0, finalizado: 0, con_observaciones: 0 };
    for (const p of filtered) c[p.status] = (c[p.status] || 0) + 1;
    return [
      { name: "Pendiente", value: c.pendiente, color: STATUS_COLORS.pendiente },
      { name: "En proceso", value: c.en_proceso, color: STATUS_COLORS.en_proceso },
      { name: "Finalizado", value: c.finalizado, color: STATUS_COLORS.finalizado },
      { name: "Con obs.", value: c.con_observaciones, color: STATUS_COLORS.con_observaciones },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  const incompletePoints = useMemo(() => {
    return filtered
      .filter((p) => p.status !== "finalizado")
      .map((p) => ({ ...p, progress: getPointProgress(p) }))
      .sort((a, b) => a.progress - b.progress)
      .slice(0, 8);
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Avance general de la instalación</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
        <Select value={filterFloor} onValueChange={setFilterFloor}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Piso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pisos</SelectItem>
            {floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="en_proceso">En proceso</SelectItem>
            <SelectItem value="finalizado">Finalizado</SelectItem>
            <SelectItem value="con_observaciones">Con observaciones</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterTech} onValueChange={setFilterTech}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Técnico" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los técnicos</SelectItem>
            {technicians.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDevice} onValueChange={setFilterDevice}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Dispositivo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los dispositivos</SelectItem>
            {deviceTypes.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMissing} onValueChange={setFilterMissing}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Falta por…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Cualquier pendiente</SelectItem>
            {missingOptions.map((m) => <SelectItem key={m.value} value={m.value}>Falta: {m.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard icon={<ProgressRing percentage={stats.pct} size={48} strokeWidth={5} />} label="Avance general" value={`${Math.round(stats.pct)}%`} />
        <KpiCard icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />} label="Finalizados" value={stats.finalizados} sub={`de ${stats.total}`} color="bg-emerald-50" />
        <KpiCard icon={<Clock className="w-5 h-5 text-amber-600" />} label="En proceso" value={stats.enProceso} color="bg-amber-50" />
        <KpiCard icon={<Clock className="w-5 h-5 text-slate-500" />} label="Pendientes" value={stats.pendientes} color="bg-slate-100" />
        <KpiCard icon={<AlertCircle className="w-5 h-5 text-red-500" />} label="Con observaciones" value={stats.conObs} color="bg-red-50" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Floor / Space progress bars */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">
            {filterFloor !== "all" ? "Avance por espacio" : "Avance por piso"}
          </h3>
          {filterFloor !== "all" ? (
            spaceProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No hay datos aún</p>
            ) : (
              <div className="space-y-3">
                {spaceProgress.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.done}/{s.total} · {s.pct}%</span>
                    </div>
                    <ProgressBar value={s.pct} />
                  </div>
                ))}
              </div>
            )
          ) : floorProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay datos aún</p>
          ) : (
            <div className="space-y-3">
              {floorProgress.map((f) => (
                <Link key={f.id} to={`/pisos/${f.id}`} className="block group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{f.done}/{f.total} · {f.pct}%</span>
                  </div>
                  <ProgressBar value={f.pct} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Status pie */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-heading font-semibold text-sm mb-4">Distribución por estado</h3>
          {statusPieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No hay datos aún</p>
          ) : (
            <div className="flex items-center justify-center gap-6">
              <StatusPieChart data={statusPieData} />
              <div className="space-y-2">
                {statusPieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase progress */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-heading font-semibold text-sm mb-4">Avance por fase</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhaseCard label="Fase Piso" dot="bg-blue-500" data={phaseProgress.piso} />
          <PhaseCard label="Fase Rack" dot="bg-purple-500" data={phaseProgress.rack} />
        </div>
      </div>

      {/* Device type progress */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-heading font-semibold text-sm mb-4">Avance por tipo de dispositivo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {deviceData.map((d) => (
            <div key={d.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <ProgressRing percentage={d.pct} size={52} strokeWidth={4} />
              <div>
                <p className="font-medium text-sm">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.done}/{d.total} completados</p>
                <ProgressBar value={d.pct} className="mt-1.5 w-24" />
              </div>
            </div>
          ))}
          {deviceData.length === 0 && <p className="text-sm text-muted-foreground col-span-3 text-center py-4">No hay datos aún</p>}
        </div>
      </div>

      {/* Incomplete points */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <ListTodo className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-heading font-semibold text-sm">Puntos por completar</h3>
        </div>
        {incompletePoints.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">¡Todo completado! No hay puntos pendientes.</p>
        ) : (
          <div className="space-y-2">
            {incompletePoints.map((pt) => (
              <Link key={pt.id} to={`/checklist/${pt.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors group">
                <DeviceIcon type={pt.device_type} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate group-hover:text-primary transition-colors inline-flex items-center gap-1 min-w-0">
                      <span className="truncate">{pt.name}</span>
                      {pt.observaciones?.trim() && <MessageSquareText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Con observaciones" />}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{pt.progress}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{floorMap[pt.floor_id] || "—"} · {spaceMap[pt.space_id] || "—"}</p>
                  <ProgressBar value={pt.progress} className="mt-1.5" />
                </div>
                <StatusBadge status={pt.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseCard({ label, dot, data }) {
  const pending = Math.max(0, data.total - data.done);
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
      <ProgressRing percentage={data.pct} size={52} strokeWidth={4} />
      <div className="min-w-0">
        <p className="font-medium text-sm flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${dot}`} /> {label}
        </p>
        <p className="text-xs text-muted-foreground">
          {data.total ? `${data.done}/${data.total} ítems · faltan ${pending}` : "Sin ítems"}
        </p>
        <ProgressBar value={data.pct} className="mt-1.5 w-32" />
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
      <div className={`flex items-center justify-center rounded-xl w-11 h-11 flex-shrink-0 ${color || ""}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold">{value} {sub && <span className="text-xs font-normal text-muted-foreground">{sub}</span>}</p>
      </div>
    </div>
  );
}