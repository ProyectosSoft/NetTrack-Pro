import React, { useState, useMemo } from "react";
import { db } from "@/api/db";
import { useParams, Link } from "react-router-dom";
import { useFloor, useFloors, useSpaces, useSpacesByFloor, usePointsByFloor, useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import DataError from "@/components/shared/DataError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import QuickStatusSelect from "@/components/shared/QuickStatusSelect";
import DeviceIcon from "@/components/shared/DeviceIcon";
import PhaseChips from "@/components/shared/PhaseChips";
import PointEditDialog from "@/components/shared/PointEditDialog";
import FloorPlanSection from "@/components/floorplan/FloorPlanSection";
import { ArrowLeft, Plus, Loader2, Trash2, ChevronRight, Pencil, Download, ArrowDownUp, Copy, Layers, LayoutTemplate, AlertTriangle } from "lucide-react";
import { cloneSpace, changeSpaceTemplate, deleteCreated } from "@/lib/clone";
import { useUndoableToast } from "@/lib/UndoContext";
import ProgressBar from "@/components/shared/ProgressBar";
import { getPointProgress, getPointPhaseProgress, aggregatePhaseProgress } from "@/lib/pointProgress";
import { sortItems, parseOrder, formatOrder } from "@/lib/ordering";
import { exportFloorPdf } from "@/lib/exportFloorPdf";
import { useProject } from "@/lib/ProjectContext";
import { useAuth } from "@/lib/AuthContext";

const DEVICE_LABELS = { ethernet: "Ethernet", camara: "Cámara CCTV", access_point: "AP WiFi" };

export default function FloorDetail() {
  const { floorId } = useParams();
  const floorQ = useFloor(floorId);
  const spacesQ = useSpacesByFloor(floorId);
  const pointsQ = usePointsByFloor(floorId);
  // Whole-building lists, so a point can be moved to a space on another floor.
  const allFloorsQ = useFloors();
  const allSpacesQ = useSpaces();
  const floor = floorQ.data;
  const spaces = spacesQ.data ?? [];
  const points = pointsQ.data ?? [];
  const loading = floorQ.isLoading || spacesQ.isLoading || pointsQ.isLoading;
  const isError = floorQ.isError || spacesQ.isError || pointsQ.isError;
  const invalidate = useInvalidateData();
  const run = useAction();
  const undoToast = useUndoableToast();
  const { activeProject } = useProject();
  const { user } = useAuth();

  const duplicateSpace = (s) => run(async () => {
    const r = await cloneSpace(s, points);
    invalidate();
    undoToast({
      title: "Espacio duplicado",
      description: `"${s.name} (copia)" con ${r.points} puntos (estado pendiente).`,
      label: "Duplicar espacio",
      run: () => deleteCreated({ spaceIds: [r.spaceId], pointIds: r.pointIds }),
    });
  }, "No se pudo duplicar el espacio");
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [pointDialog, setPointDialog] = useState(false);
  const [spaceName, setSpaceName] = useState("");
  const [spaceType, setSpaceType] = useState("habitacion");
  const [spaceOrder, setSpaceOrder] = useState("");
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [pointName, setPointName] = useState("");
  const [pointDesc, setPointDesc] = useState("");
  const [pointOrder, setPointOrder] = useState("");
  const [deviceType, setDeviceType] = useState("ethernet");
  const [editFloorName, setEditFloorName] = useState(false);
  const [floorEditVal, setFloorEditVal] = useState("");
  const [editSpace, setEditSpace] = useState(null);
  const [editSpaceName, setEditSpaceName] = useState("");
  const [editSpaceOrder, setEditSpaceOrder] = useState("");
  const [editPoint, setEditPoint] = useState(null);
  const [editSpaceType, setEditSpaceType] = useState("habitacion");
  const [spaceToDelete, setSpaceToDelete] = useState(null);
  const [pointToDelete, setPointToDelete] = useState(null);
  const [sortMode, setSortMode] = useState("manual");

  // Change the checklist template (device type) for a whole space at once.
  const [tmplSpace, setTmplSpace] = useState(null);
  const [tmplDevice, setTmplDevice] = useState("ethernet");
  const [tmplApplying, setTmplApplying] = useState(false);

  const openChangeTemplate = (s) => {
    const own = points.filter((p) => p.space_id === s.id);
    setTmplDevice(own[0]?.device_type || "ethernet");
    setTmplSpace(s);
  };
  const tmplCount = tmplSpace ? points.filter((p) => p.space_id === tmplSpace.id).length : 0;
  const applyTemplate = () => run(async () => {
    if (!tmplSpace) return;
    const own = points.filter((p) => p.space_id === tmplSpace.id);
    const snapshot = own.map((p) => ({ ...p })); // capture before reset, for undo
    setTmplApplying(true);
    try {
      const r = await changeSpaceTemplate(own, tmplDevice);
      const name = tmplSpace.name;
      setTmplSpace(null);
      invalidate();
      undoToast({
        title: "Plantilla actualizada",
        description: `${r.points} punto(s) de "${name}" → ${DEVICE_LABELS[tmplDevice]}. Checklist reiniciado a pendiente.`,
        label: "Cambiar plantilla",
        run: () => db.entities.InstallationPoint.importMany(snapshot),
      });
    } finally {
      setTmplApplying(false);
    }
  }, "No se pudo cambiar la plantilla del espacio");

  // Bulk point creation
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkSpace, setBulkSpace] = useState(null);
  const [bulkType, setBulkType] = useState("ethernet");
  const [bulkPrefix, setBulkPrefix] = useState("");
  const [bulkStart, setBulkStart] = useState("1");
  const [bulkCount, setBulkCount] = useState("3");

  const bulkNames = () => {
    const start = parseInt(bulkStart, 10) || 1;
    const count = Math.max(0, Math.min(100, parseInt(bulkCount, 10) || 0));
    return Array.from({ length: count }, (_, i) => `${bulkPrefix}${start + i}`);
  };

  const bulkAdd = () => run(async () => {
    const names = bulkNames();
    if (!bulkSpace || names.length === 0) return;
    const ids = [];
    for (let i = 0; i < names.length; i += 1) {
      const np = await db.entities.InstallationPoint.create({
        name: names[i], floor_id: floorId, space_id: bulkSpace,
        device_type: bulkType, order: (parseInt(bulkStart, 10) || 1) + i,
      });
      ids.push(np.id);
    }
    setBulkDialog(false);
    setBulkPrefix("");
    invalidate();
    undoToast({
      title: "Puntos creados",
      description: `${names.length} puntos agregados.`,
      label: "Crear puntos",
      run: () => deleteCreated({ pointIds: ids }),
    });
  }, "No se pudieron crear los puntos");

  const exportPdf = () => run(() => exportFloorPdf(floor, sortedSpaces, points, { project: activeProject, user }));

  const saveFloorName = () => run(async () => {
    if (!floorEditVal.trim()) return;
    await db.entities.Floor.update(floorId, { name: floorEditVal.trim() });
    setEditFloorName(false);
    invalidate();
  });

  const saveEditSpace = () => run(async () => {
    if (!editSpaceName.trim()) return;
    await db.entities.Space.update(editSpace.id, {
      name: editSpaceName.trim(), space_type: editSpaceType, order: parseOrder(editSpaceOrder),
    });
    setEditSpace(null);
    invalidate();
  });

  const openEditSpace = (s) => {
    setEditSpace(s);
    setEditSpaceName(s.name);
    setEditSpaceType(s.space_type || "habitacion");
    setEditSpaceOrder(formatOrder(s.order));
  };

  const sortedSpaces = useMemo(() => sortItems(spaces, sortMode), [spaces, sortMode]);

  // Overall floor progress = average completion across all its points.
  const floorProgress = useMemo(
    () => (points.length ? Math.round(points.reduce((a, p) => a + getPointProgress(p), 0) / points.length) : 0),
    [points]
  );

  const addSpace = () => run(async () => {
    if (!spaceName.trim()) return;
    const ns = await db.entities.Space.create({
      name: spaceName.trim(), floor_id: floorId, space_type: spaceType, order: parseOrder(spaceOrder),
    });
    setSpaceName("");
    setSpaceOrder("");
    setSpaceDialog(false);
    invalidate();
    undoToast({
      title: "Espacio creado",
      description: ns.name,
      label: "Crear espacio",
      run: () => deleteCreated({ spaceIds: [ns.id] }),
    });
  });

  const addPoint = () => run(async () => {
    if (!pointName.trim() || !selectedSpace) return;
    const np = await db.entities.InstallationPoint.create({
      name: pointName.trim(), floor_id: floorId, space_id: selectedSpace, device_type: deviceType,
      description: pointDesc.trim(), order: parseOrder(pointOrder),
    });
    setPointName("");
    setPointDesc("");
    setPointOrder("");
    setPointDialog(false);
    invalidate();
    undoToast({
      title: "Punto creado",
      description: np.name,
      label: "Crear punto",
      run: () => deleteCreated({ pointIds: [np.id] }),
    });
  });

  const confirmDeleteSpace = () => run(async () => {
    const space = spaceToDelete;
    const id = space.id;
    const own = points.filter((p) => p.space_id === id).map((p) => ({ ...p }));
    await db.entities.InstallationPoint.deleteMany({ space_id: id });
    await db.entities.Space.delete(id);
    setSpaceToDelete(null);
    invalidate();
    undoToast({
      title: "Espacio eliminado",
      description: `"${space.name}"${own.length ? ` y ${own.length} punto(s)` : ""}.`,
      label: "Eliminar espacio",
      run: async () => {
        await db.entities.Space.importMany([space]);
        if (own.length) await db.entities.InstallationPoint.importMany(own);
      },
    });
  });

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

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return <DataError onRetry={invalidate} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/pisos" className="p-2 rounded-lg hover:bg-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold tracking-tight truncate">{floor?.name}</h1>
            <button
              onClick={() => { setFloorEditVal(floor?.name || ""); setEditFloorName(true); }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-muted-foreground text-sm">{spaces.length} espacios · {points.length} puntos</p>
            {points.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <span className="hidden sm:block w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <span className="block h-full bg-primary rounded-full" style={{ width: `${floorProgress}%` }} />
                </span>
                {floorProgress}%
              </span>
            )}
          </div>
        </div>
        <div className="flex w-full sm:w-auto flex-wrap gap-2">
          <Button onClick={exportPdf} size="sm" variant="outline" className="flex-1 sm:flex-none"><Download className="w-4 h-4 mr-1.5" /> Exportar PDF</Button>
          <Button onClick={() => setSpaceDialog(true)} size="sm" variant="outline" className="flex-1 sm:flex-none"><Plus className="w-4 h-4 mr-1.5" /> Espacio</Button>
          <Button onClick={() => setPointDialog(true)} size="sm" className="flex-1 sm:flex-none"><Plus className="w-4 h-4 mr-1.5" /> Punto</Button>
          <Button onClick={() => { setBulkSpace(selectedSpace || sortedSpaces[0]?.id || null); setBulkDialog(true); }} size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={sortedSpaces.length === 0}><Layers className="w-4 h-4 mr-1.5" /> Varios</Button>
        </div>
      </div>

      {floor && <FloorPlanSection floor={floor} points={points} />}

      {spaces.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground text-sm">No hay espacios en este piso</p>
          <Button onClick={() => setSpaceDialog(true)} variant="outline" size="sm" className="mt-3"><Plus className="w-4 h-4 mr-1.5" /> Crear espacio</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <ArrowDownUp className="w-3.5 h-3.5" />
            <span>Ordenar:</span>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setSortMode("manual")}
                className={`px-2.5 py-1 font-medium transition-colors ${sortMode === "manual" ? "bg-primary text-white" : "hover:bg-muted"}`}
              >
                Manual
              </button>
              <button
                onClick={() => setSortMode("name")}
                className={`px-2.5 py-1 font-medium transition-colors ${sortMode === "name" ? "bg-primary text-white" : "hover:bg-muted"}`}
              >
                Nombre
              </button>
            </div>
          </div>
          {sortedSpaces.map((s) => {
            const spacePoints = sortItems(points.filter((p) => p.space_id === s.id), sortMode);
            const pointProgresses = spacePoints.map((p) => getPointProgress(p));
            const avgProgress = pointProgresses.length ? Math.round(pointProgresses.reduce((a, b) => a + b, 0) / pointProgresses.length) : 0;
            const spacePhases = aggregatePhaseProgress(spacePoints);

            return (
              <div key={s.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/30">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {sortMode === "manual" && s.order ? (
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{formatOrder(s.order)}</span>
                      ) : null}
                      <p className="font-medium text-sm truncate">{s.name}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{spacePoints.length} puntos · {avgProgress}%</p>
                      <PhaseChips phases={spacePhases} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="hidden sm:block w-28 h-2 bg-muted rounded-full">
                      <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${avgProgress}%` }} />
                    </div>
                    <button
                      onClick={() => openChangeTemplate(s)}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                      title="Cambiar la plantilla de todos los puntos del espacio"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => duplicateSpace(s)}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                      title="Duplicar espacio con sus puntos"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openEditSpace(s)}
                      className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                      title="Editar espacio"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setSpaceToDelete(s)} title="Eliminar espacio" className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {spacePoints.length > 0 && (
                  <div className="divide-y divide-border">
                    {spacePoints.map((pt) => {
                      const progress = getPointProgress(pt);
                      const phases = getPointPhaseProgress(pt);
                      return (
                      <Link
                        key={pt.id}
                        to={`/checklist/${pt.id}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        {sortMode === "manual" && pt.order ? (
                          <span className="text-xs font-mono text-muted-foreground w-6 text-right flex-shrink-0">{formatOrder(pt.order)}</span>
                        ) : null}
                        <DeviceIcon type={pt.device_type} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium truncate">{pt.name}</p>
                            <span className="text-xs text-muted-foreground font-medium flex-shrink-0">{progress}%</span>
                          </div>
                          {pt.description && <p className="text-xs text-muted-foreground truncate">{pt.description}</p>}
                          {pt.technician && <p className="text-xs text-muted-foreground">{pt.technician}</p>}
                          <ProgressBar value={progress} className="mt-1.5 max-w-[140px]" />
                          <PhaseChips phases={phases} className="mt-1.5" />
                        </div>
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
                        <QuickStatusSelect point={pt} onChanged={invalidate} />
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Space Dialog */}
      <Dialog open={spaceDialog} onOpenChange={setSpaceDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Agregar espacio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre (ej: Habitación 201)" value={spaceName} onChange={(e) => setSpaceName(e.target.value)} />
            <Select value={spaceType} onValueChange={setSpaceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="habitacion">Habitación</SelectItem>
                <SelectItem value="pasillo">Pasillo</SelectItem>
                <SelectItem value="sala">Sala</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label className="text-xs mb-1.5 block">Orden (opcional)</Label>
              <Input placeholder="Ej: 1 o 1.2" value={spaceOrder} onChange={(e) => setSpaceOrder(e.target.value)} inputMode="decimal" />
            </div>
            <Button onClick={addSpace} className="w-full">Crear espacio</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Point Dialog */}
      <Dialog open={pointDialog} onOpenChange={setPointDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Agregar punto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedSpace || ""} onValueChange={setSelectedSpace}>
              <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
              <SelectContent>
                {sortedSpaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Nombre del punto (ej: ETH-01)" value={pointName} onChange={(e) => setPointName(e.target.value)} />
            <Select value={deviceType} onValueChange={setDeviceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ethernet">Ethernet</SelectItem>
                <SelectItem value="camara">Cámara CCTV</SelectItem>
                <SelectItem value="access_point">AP WiFi</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label className="text-xs mb-1.5 block">Descripción (opcional)</Label>
              <Textarea placeholder="Ubicación, referencia, detalles..." value={pointDesc} onChange={(e) => setPointDesc(e.target.value)} rows={2} />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Orden (opcional)</Label>
              <Input placeholder="Ej: 1 o 1.2" value={pointOrder} onChange={(e) => setPointOrder(e.target.value)} inputMode="decimal" />
            </div>
            <Button onClick={addPoint} className="w-full">Crear punto</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Points Dialog */}
      <Dialog open={bulkDialog} onOpenChange={setBulkDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Agregar varios puntos</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Espacio</Label>
              <Select value={bulkSpace || ""} onValueChange={setBulkSpace}>
                <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
                <SelectContent>
                  {sortedSpaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Tipo de dispositivo</Label>
              <Select value={bulkType} onValueChange={setBulkType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethernet">Ethernet</SelectItem>
                  <SelectItem value="camara">Cámara CCTV</SelectItem>
                  <SelectItem value="access_point">AP WiFi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Prefijo del nombre</Label>
              <Input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="Ej: P10-COW-ETH" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">N° inicial</Label>
                <Input value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} inputMode="numeric" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Cantidad</Label>
                <Input value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} inputMode="numeric" />
              </div>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
              {bulkNames().length === 0
                ? "Escribe un prefijo y una cantidad."
                : <>Se crearán <strong>{bulkNames().length}</strong>: {bulkNames().slice(0, 3).join(", ")}{bulkNames().length > 3 ? `, … ${bulkNames()[bulkNames().length - 1]}` : ""}</>}
            </div>
            <Button onClick={bulkAdd} disabled={!bulkSpace || bulkNames().length === 0} className="w-full">Crear {bulkNames().length || ""} puntos</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Floor Name */}
      <Dialog open={editFloorName} onOpenChange={setEditFloorName}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar piso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={floorEditVal} onChange={(e) => setFloorEditVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveFloorName()} />
            <Button onClick={saveFloorName} className="w-full">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Space */}
      <Dialog open={!!editSpace} onOpenChange={(open) => { if (!open) setEditSpace(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar espacio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={editSpaceName} onChange={(e) => setEditSpaceName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEditSpace()} />
            <Select value={editSpaceType} onValueChange={setEditSpaceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="habitacion">Habitación</SelectItem>
                <SelectItem value="pasillo">Pasillo</SelectItem>
                <SelectItem value="sala">Sala</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <Label className="text-xs mb-1.5 block">Orden (opcional)</Label>
              <Input placeholder="Ej: 1 o 1.2" value={editSpaceOrder} onChange={(e) => setEditSpaceOrder(e.target.value)} inputMode="decimal" />
            </div>
            <Button onClick={saveEditSpace} className="w-full">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change space template (device type) */}
      <Dialog open={!!tmplSpace} onOpenChange={(open) => { if (!open && !tmplApplying) setTmplSpace(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cambiar plantilla del espacio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aplica una plantilla a los <strong>{tmplCount}</strong> punto(s) de{" "}
              <strong>&ldquo;{tmplSpace?.name}&rdquo;</strong>.
            </p>
            <div>
              <Label className="text-xs mb-1.5 block">Plantilla / tipo de dispositivo</Label>
              <Select value={tmplDevice} onValueChange={setTmplDevice}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethernet">Ethernet</SelectItem>
                  <SelectItem value="camara">Cámara CCTV</SelectItem>
                  <SelectItem value="access_point">AP WiFi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                El checklist de esos puntos se <strong>reiniciará a pendiente</strong> (actividades,
                accesorios, equipos y puertos). Se conservan el nombre, la descripción, las
                observaciones, las fotos de evidencia y la ubicación en el plano.
              </span>
            </div>
            <Button onClick={applyTemplate} disabled={tmplApplying || tmplCount === 0} className="w-full">
              {tmplApplying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aplicar plantilla {DEVICE_LABELS[tmplDevice]}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit / move point */}
      <PointEditDialog
        point={editPoint}
        floors={allFloorsQ.data ?? []}
        spaces={allSpacesQ.data ?? []}
        onClose={() => setEditPoint(null)}
      />

      {/* Delete Space Confirmation */}
      <AlertDialog open={!!spaceToDelete} onOpenChange={(open) => { if (!open) setSpaceToDelete(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar espacio?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{spaceToDelete?.name}&rdquo; y todos sus puntos de instalación. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSpace} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Point Confirmation */}
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