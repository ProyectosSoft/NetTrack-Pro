import React, { useState, useMemo } from "react";
import { db } from "@/api/db";
import { Link } from "react-router-dom";
import { useInvalidateData } from "@/lib/queries";
import { useScopedData, useTerms } from "@/lib/ProjectContext";
import { useAction } from "@/lib/useAction";
import DataError from "@/components/shared/DataError";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import QuickStatusSelect from "@/components/shared/QuickStatusSelect";
import DeviceIcon from "@/components/shared/DeviceIcon";
import PhaseChips from "@/components/shared/PhaseChips";
import PointEditDialog from "@/components/shared/PointEditDialog";
import { Loader2, Search, ChevronRight, Pencil, Trash2, ArrowUp, ArrowDown, ChevronsUpDown, MessageSquareText } from "lucide-react";
import ProgressBar from "@/components/shared/ProgressBar";
import { getPointProgress, getPointPhaseProgress, hasObservations } from "@/lib/pointProgress";
import { useUndoableToast } from "@/lib/UndoContext";
import { useSessionState } from "@/lib/useSessionState";

export default function Points() {
  const { floors, spaces, points, isLoading: loading, isError } = useScopedData();
  const terms = useTerms();
  const invalidate = useInvalidateData();
  const run = useAction();
  const undoToast = useUndoableToast();
  // Persisted so filters survive entering a point and coming back.
  const [search, setSearch] = useSessionState("points.search", "");
  const [filterFloor, setFilterFloor] = useSessionState("points.filterFloor", "all");
  const [filterStatus, setFilterStatus] = useSessionState("points.filterStatus", "all");
  const [filterType, setFilterType] = useSessionState("points.filterType", "all");
  const [filterTech, setFilterTech] = useSessionState("points.filterTech", "all");
  const [editPoint, setEditPoint] = useState(null);
  const [pointToDelete, setPointToDelete] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const confirmDeletePoint = () => run(async () => {
    const point = { ...pointToDelete };
    await db.entities.InstallationPoint.delete(point.id);
    setPointToDelete(null);
    invalidate();
    undoToast({
      title: "Punto eliminado",
      description: `"${point.name}".`,
      label: "Eliminar punto",
      run: () => db.entities.InstallationPoint.importMany([point]),
    });
  });

  const floorMap = useMemo(() => Object.fromEntries(floors.map((f) => [f.id, f.name])), [floors]);
  const spaceMap = useMemo(() => Object.fromEntries(spaces.map((s) => [s.id, s.name])), [spaces]);

  const filtered = useMemo(() => {
    const result = points.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFloor !== "all" && p.floor_id !== filterFloor) return false;
      if (filterStatus !== "all") {
        // "con_observaciones" matches by status OR by observation text.
        const ok = filterStatus === "con_observaciones" ? hasObservations(p) : p.status === filterStatus;
        if (!ok) return false;
      }
      if (filterType !== "all" && p.device_type !== filterType) return false;
      if (filterTech !== "all" && p.technician !== filterTech) return false;
      return true;
    });
    if (!sortKey) return result;
    const getVal = (p) => {
      switch (sortKey) {
        case "name": return (p.name || "").toLowerCase();
        case "floor": return (floorMap[p.floor_id] || "").toLowerCase();
        case "space": return (spaceMap[p.space_id] || "").toLowerCase();
        case "status": return p.status || "";
        case "progress": return getPointProgress(p);
        default: return "";
      }
    };
    return [...result].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [points, search, filterFloor, filterStatus, filterType, filterTech, sortKey, sortDir, floorMap, spaceMap]);

  const technicians = useMemo(() => [...new Set(points.map((p) => p.technician).filter(Boolean))], [points]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return <DataError onRetry={invalidate} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold tracking-tight">{terms.points} de instalación</h1>
        <p className="text-muted-foreground text-sm mt-1">{filtered.length} de {points.length} {terms.points.toLowerCase()}</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3">
        <div className="relative flex-1 sm:min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar punto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="grid grid-cols-2 sm:contents gap-2">
          <Select value={filterFloor} onValueChange={setFilterFloor}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Piso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="en_proceso">En proceso</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
              <SelectItem value="con_observaciones">Con obs.</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ethernet">Ethernet</SelectItem>
              <SelectItem value="camara">Cámara</SelectItem>
              <SelectItem value="access_point">AP WiFi</SelectItem>
            </SelectContent>
          </Select>
          {technicians.length > 0 && (
            <Select value={filterTech} onValueChange={setFilterTech}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Técnico" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {technicians.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Table header */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <button onClick={() => toggleSort("name")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors text-left">Punto <SortIcon k="name" /></button>
          <button onClick={() => toggleSort("floor")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors text-left">Piso <SortIcon k="floor" /></button>
          <button onClick={() => toggleSort("space")} className="col-span-3 flex items-center gap-1 hover:text-foreground transition-colors text-left">Espacio <SortIcon k="space" /></button>
          <button onClick={() => toggleSort("status")} className="col-span-2 flex items-center gap-1 hover:text-foreground transition-colors text-left">Estado <SortIcon k="status" /></button>
          <div className="col-span-1"></div>
        </div>
        <div className="divide-y divide-border">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No se encontraron puntos</p>
          ) : (
            filtered.map((pt) => {
              const progress = getPointProgress(pt);
              const phases = getPointPhaseProgress(pt);
              return (
              <Link key={pt.id} to={`/checklist/${pt.id}`} className="block px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                  <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                    <DeviceIcon type={pt.device_type} size="sm" />
                    <div className="min-w-0">
                      <span className="font-medium text-sm inline-flex items-center gap-1">
                        {pt.name}
                        {pt.observaciones?.trim() && <MessageSquareText className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Con observaciones" />}
                      </span>
                      {pt.description && <p className="text-xs text-muted-foreground truncate">{pt.description}</p>}
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-muted-foreground">{floorMap[pt.floor_id] || "—"}</div>
                  <div className="col-span-3 text-sm text-muted-foreground">{spaceMap[pt.space_id] || "—"}</div>
                  <div className="col-span-2 flex items-center gap-2">
                    <QuickStatusSelect point={pt} onChanged={invalidate} />
                    <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditPoint(pt); }}
                      title="Editar o mover punto"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPointToDelete(pt); }}
                      className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <ProgressBar value={progress} className="mt-2" />
                <PhaseChips phases={phases} className="mt-1.5" />
              </Link>
              );
            })
          )}
        </div>
      </div>

      <PointEditDialog point={editPoint} floors={floors} spaces={spaces} onClose={() => setEditPoint(null)} />

      <AlertDialog open={!!pointToDelete} onOpenChange={(open) => { if (!open) setPointToDelete(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{pointToDelete?.name}&rdquo; junto con su checklist. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePoint} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}