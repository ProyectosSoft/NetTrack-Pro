import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/api/db";
import { useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { sortItems, parseOrder, formatOrder } from "@/lib/ordering";
import { useUndoableToast } from "@/lib/UndoContext";
import { useScopedData } from "@/lib/ProjectContext";
import { pointNameExists } from "@/lib/nameValidation";

// Edit dialog for an installation point, shared by the floor detail and the
// points list. Besides the basic fields it can move the point to another space
// (and floor), always writing floor_id and space_id together so the two stay
// consistent.
export default function PointEditDialog({ point, floors = [], spaces = [], onClose }) {
  const invalidate = useInvalidateData();
  const run = useAction();
  const undoToast = useUndoableToast();
  const { points: allPoints } = useScopedData();
  const [name, setName] = useState("");
  const [deviceType, setDeviceType] = useState("ethernet");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState("");
  const [floorId, setFloorId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!point) return;
    setName(point.name || "");
    setDeviceType(point.device_type || "ethernet");
    setDescription(point.description || "");
    setOrder(formatOrder(point.order));
    setFloorId(point.floor_id || "");
    setSpaceId(point.space_id || "");
  }, [point]);

  const sortedFloors = useMemo(() => [...floors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [floors]);
  const floorSpaces = useMemo(
    () => sortItems(spaces.filter((s) => s.floor_id === floorId), "manual"),
    [spaces, floorId]
  );

  const changeFloor = (id) => {
    setFloorId(id);
    // A space belongs to one floor, so pre-select the new floor's first space
    // instead of leaving a space from the previous floor selected.
    const first = sortItems(spaces.filter((s) => s.floor_id === id), "manual")[0];
    setSpaceId(first?.id || "");
  };

  const moved = !!point && (floorId !== point.floor_id || spaceId !== point.space_id);
  const targetFloor = sortedFloors.find((f) => f.id === floorId);
  const targetSpace = floorSpaces.find((s) => s.id === spaceId);

  const save = async () => {
    if (!name.trim() || !spaceId || saving) return;
    setSaving(true);
    const prev = { ...point };
    const ok = await run(async () => {
      if (pointNameExists(allPoints, spaceId, name.trim(), point.id)) {
        throw new Error(`Ya existe un punto llamado "${name.trim()}" en ese espacio.`);
      }
      await db.entities.InstallationPoint.update(point.id, {
        name: name.trim(),
        device_type: deviceType,
        description: description.trim(),
        order: parseOrder(order),
        floor_id: floorId,
        space_id: spaceId,
      });
      return true;
    });
    setSaving(false);
    if (ok) {
      onClose();
      invalidate();
      undoToast({
        title: "Punto actualizado",
        description: `"${name.trim()}".`,
        label: "Editar punto",
        run: () => db.entities.InstallationPoint.importMany([prev]),
      });
    }
  };

  return (
    <Dialog open={!!point} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar punto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block">Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Tipo de dispositivo</Label>
            <Select value={deviceType} onValueChange={setDeviceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ethernet">Ethernet</SelectItem>
                <SelectItem value="camara">Cámara CCTV</SelectItem>
                <SelectItem value="access_point">AP WiFi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-medium">Ubicación</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Piso</Label>
                <Select value={floorId} onValueChange={changeFloor}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar piso" /></SelectTrigger>
                  <SelectContent>
                    {sortedFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Espacio</Label>
                <Select value={spaceId} onValueChange={setSpaceId} disabled={floorSpaces.length === 0}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
                  <SelectContent>
                    {floorSpaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {floorSpaces.length === 0 ? (
              <p className="text-xs text-amber-600">Este piso no tiene espacios. Crea uno antes de mover el punto.</p>
            ) : moved ? (
              <p className="text-xs text-primary flex items-center gap-1.5">
                <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                Se moverá a {targetFloor?.name || "—"} · {targetSpace?.name || "—"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Cambia el piso o el espacio para mover el punto.</p>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Descripción (opcional)</Label>
            <Textarea placeholder="Ubicación, referencia, detalles..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Orden (opcional)</Label>
            <Input placeholder="Ej: 1 o 1.2" value={order} onChange={(e) => setOrder(e.target.value)} inputMode="decimal" />
          </div>
          <Button onClick={save} disabled={saving || !name.trim() || !spaceId} className="w-full">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
