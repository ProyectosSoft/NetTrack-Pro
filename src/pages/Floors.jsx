import React, { useState } from "react";
import { db } from "@/api/db";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Building2, Plus, ChevronRight, Loader2, Trash2, Pencil, ArrowUp, ArrowDown, Download, Copy, Table } from "lucide-react";
import { getPointProgress } from "@/lib/pointProgress";
import { useInvalidateData } from "@/lib/queries";
import { useScopedData, useProject, useTerms } from "@/lib/ProjectContext";
import { useAuth } from "@/lib/AuthContext";
import { useAction } from "@/lib/useAction";
import { exportProjectPdf } from "@/lib/exportFloorPdf";
import { exportPointsCsv } from "@/lib/exportPointsCsv";
import { cloneFloor, deleteCreated } from "@/lib/clone";
import { useUndoableToast } from "@/lib/UndoContext";
import { floorNameExists } from "@/lib/nameValidation";
import DataError from "@/components/shared/DataError";

export default function Floors() {
  const { floors, spaces, points, isLoading: loading, isError } = useScopedData();
  const { activeProjectId, activeProject } = useProject();
  const terms = useTerms();
  const { user } = useAuth();
  const invalidate = useInvalidateData();
  const run = useAction();
  const undoToast = useUndoableToast();

  const duplicateFloor = (f) => run(async () => {
    const nextOrder = floors.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
    const r = await cloneFloor(f, spaces, points, nextOrder);
    invalidate();
    undoToast({
      title: "Piso duplicado",
      description: `"${f.name} (copia)": ${r.spaces} espacios y ${r.points} puntos (estado pendiente).`,
      label: "Duplicar piso",
      run: () => deleteCreated({ floorId: r.floorId, spaceIds: r.spaceIds, pointIds: r.pointIds }),
    });
  }, "No se pudo duplicar el piso");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [floorName, setFloorName] = useState("");
  const [editFloor, setEditFloor] = useState(null);
  const [editName, setEditName] = useState("");
  const [floorToDelete, setFloorToDelete] = useState(null);

  const saveEditFloor = () => run(async () => {
    const name = editName.trim();
    if (!name) return;
    if (floorNameExists(floors, editFloor.project_id, name, editFloor.id)) {
      throw new Error(`Ya existe un piso llamado "${name}" en este proyecto.`);
    }
    await db.entities.Floor.update(editFloor.id, { name });
    setEditFloor(null);
    setEditName("");
    invalidate();
  });

  const moveFloor = (index, direction) => run(async () => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= floors.length) return;
    const updates = [];
    updates.push(db.entities.Floor.update(floors[index].id, { order: floors[newIndex].order }));
    updates.push(db.entities.Floor.update(floors[newIndex].id, { order: floors[index].order }));
    await Promise.all(updates);
    invalidate();
  });

  const addFloor = () => run(async () => {
    const name = floorName.trim();
    if (!name || !activeProjectId) return;
    if (floorNameExists(floors, activeProjectId, name)) {
      throw new Error(`Ya existe un piso llamado "${name}" en este proyecto.`);
    }
    const nf = await db.entities.Floor.create({ name, order: floors.length, project_id: activeProjectId });
    setFloorName("");
    setDialogOpen(false);
    invalidate();
    undoToast({
      title: "Piso creado",
      description: nf.name,
      label: "Crear piso",
      run: () => deleteCreated({ floorId: nf.id }),
    });
  });

  const confirmDeleteFloor = () => run(async () => {
    const floor = { ...floorToDelete };
    const id = floor.id;
    const floorSpaces = spaces.filter((s) => s.floor_id === id).map((s) => ({ ...s }));
    const floorPoints = points.filter((p) => p.floor_id === id).map((p) => ({ ...p }));
    for (const s of floorSpaces) {
      await db.entities.InstallationPoint.deleteMany({ space_id: s.id });
      await db.entities.Space.delete(s.id);
    }
    await db.entities.Floor.delete(id);
    setFloorToDelete(null);
    invalidate();
    undoToast({
      title: "Piso eliminado",
      description: `"${floor.name}"${floorSpaces.length ? ` con ${floorSpaces.length} espacio(s) y ${floorPoints.length} punto(s)` : ""}.`,
      label: "Eliminar piso",
      run: async () => {
        await db.entities.Floor.importMany([floor]);
        if (floorSpaces.length) await db.entities.Space.importMany(floorSpaces);
        if (floorPoints.length) await db.entities.InstallationPoint.importMany(floorPoints);
      },
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">{terms.floors}</h1>
          <p className="text-muted-foreground text-sm mt-1">{activeProject ? activeProject.project_name : "Estructura del edificio"}</p>
        </div>
        <div className="flex w-full sm:w-auto flex-wrap gap-2">
          {floors.length > 0 && (
            <Button onClick={() => run(() => exportProjectPdf(floors, spaces, points, { project: activeProject, user }))} size="sm" variant="outline" className="flex-1 sm:flex-none">
              <Download className="w-4 h-4 mr-1.5" /> PDF
            </Button>
          )}
          {points.length > 0 && (
            <Button onClick={() => run(() => exportPointsCsv(activeProject, floors, spaces, points))} size="sm" variant="outline" className="flex-1 sm:flex-none">
              <Table className="w-4 h-4 mr-1.5" /> CSV
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} size="sm" disabled={!activeProjectId} className="flex-1 sm:flex-none">
            <Plus className="w-4 h-4 mr-1.5" /> Agregar piso
          </Button>
        </div>
      </div>

      {!activeProjectId ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Selecciona o crea un proyecto para gestionar sus pisos.</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/proyectos"><Plus className="w-4 h-4 mr-1.5" /> Ir a Proyectos</Link>
          </Button>
        </div>
      ) : floors.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <Building2 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay pisos registrados aún</p>
          <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm" className="mt-4">
            <Plus className="w-4 h-4 mr-1.5" /> Crear primer piso
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {floors.map((f, idx) => {
            const floorSpaces = spaces.filter((s) => s.floor_id === f.id);
            const floorPoints = points.filter((p) => p.floor_id === f.id);
            const floorProgresses = floorPoints.map((p) => getPointProgress(p));
            const pct = floorProgresses.length ? Math.round(floorProgresses.reduce((a, b) => a + b, 0) / floorProgresses.length) : 0;

            return (
              <Link
                key={f.id}
                to={`/pisos/${f.id}`}
                className="block bg-card rounded-xl border border-border p-4 hover:border-primary/30 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveFloor(idx, -1); }}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveFloor(idx, 1); }}
                        disabled={idx === floors.length - 1}
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {floorSpaces.length} espacios · {floorPoints.length} puntos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="text-right mr-1 sm:mr-2">
                      <p className="text-sm font-semibold">{pct}%</p>
                      <div className="w-16 sm:w-24 h-1.5 bg-muted rounded-full mt-1 hidden sm:block">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicateFloor(f); }}
                      title="Duplicar piso con sus espacios y puntos"
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditFloor(f); setEditName(f.name); }}
                      title="Editar piso"
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFloorToDelete(f); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Agregar piso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Nombre del piso (ej: Piso 1)" value={floorName} onChange={(e) => setFloorName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFloor()} />
            <Button onClick={addFloor} className="w-full">Crear piso</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editFloor} onOpenChange={(open) => { if (!open) setEditFloor(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar piso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEditFloor()} />
            <Button onClick={saveEditFloor} className="w-full">Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!floorToDelete} onOpenChange={(open) => { if (!open) setFloorToDelete(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar piso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{floorToDelete?.name}&rdquo; junto con todos sus espacios y puntos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFloor} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}