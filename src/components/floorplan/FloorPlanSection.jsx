import React, { useEffect, useRef, useState } from "react";
import { db } from "@/api/db";
import { useNavigate } from "react-router-dom";
import { useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import { useProject } from "@/lib/ProjectContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Map, Upload, Loader2, X, Ruler, Palette } from "lucide-react";
import PinStyleDialog from "@/components/floorplan/PinStyleDialog";
import { resolvePinStyle } from "@/lib/branding";

const isPlaced = (p) => Number.isFinite(p.plan_x) && Number.isFinite(p.plan_y);

// Accepts "12,5" as well as "12.5". Empty or invalid input clears the value,
// stored as 0 because the entity field is a plain number.
const parseMeters = (value) => {
  const n = parseFloat(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

export default function FloorPlanSection({ floor, points }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateData();
  const run = useAction();
  const { toast } = useToast();
  const { activeProject } = useProject();
  const containerRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [savingDims, setSavingDims] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [placingId, setPlacingId] = useState(null);
  const [drag, setDrag] = useState(null); // { id, x, y, moved, startX, startY }
  const [w, setW] = useState(floor.width ? String(floor.width) : "");
  const [l, setL] = useState(floor.length ? String(floor.length) : "");

  // Re-sync the inputs when the stored dimensions change (save, floor switch).
  useEffect(() => {
    setW(floor.width ? String(floor.width) : "");
    setL(floor.length ? String(floor.length) : "");
  }, [floor.id, floor.width, floor.length]);

  const savedW = floor.width || 0;
  const savedL = floor.length || 0;
  const dimsDirty = parseMeters(w) !== savedW || parseMeters(l) !== savedL;

  const placed = points.filter(isPlaced);
  const unplaced = points.filter((p) => !isPlaced(p));
  const placingPoint = unplaced.find((p) => p.id === placingId) || points.find((p) => p.id === placingId);

  const uploadPlan = (e) => run(async () => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await db.uploadFile({ file });
      await db.entities.Floor.update(floor.id, { plan_url: file_url });
      invalidate();
    } finally {
      setUploading(false);
    }
  });

  const removePlan = () => run(async () => {
    await db.entities.Floor.update(floor.id, { plan_url: "" });
    invalidate();
  });

  const saveDimensions = async () => {
    const width = parseMeters(w);
    const length = parseMeters(l);
    setSavingDims(true);
    const ok = await run(async () => {
      await db.entities.Floor.update(floor.id, { width, length });
      return true;
    }, "No se pudieron guardar las medidas");
    setSavingDims(false);
    if (!ok) return;
    toast({
      title: "Medidas guardadas",
      description: width && length ? `${width} × ${length} m` : "Se limpiaron las medidas del piso.",
    });
    invalidate();
  };

  const coordsFromEvent = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };

  const savePos = (id, x, y) => run(async () => {
    await db.entities.InstallationPoint.update(id, { plan_x: x, plan_y: y });
    invalidate();
  });

  // Tap on the plan while a point is selected → place it there.
  const onPlanClick = (e) => {
    if (!placingId) return;
    const { x, y } = coordsFromEvent(e);
    savePos(placingId, x, y);
    setPlacingId(null);
  };

  const startDrag = (e, p) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: p.id, x: p.plan_x, y: p.plan_y, moved: false, startX: e.clientX, startY: e.clientY });
  };

  const onPinMove = (e) => {
    if (!drag) return;
    const { x, y } = coordsFromEvent(e);
    const moved = drag.moved || Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4;
    setDrag({ ...drag, x, y, moved });
  };

  // Release: a real drag saves the new position, a tap opens the checklist.
  const endDrag = (e, p) => {
    if (!drag || drag.id !== p.id) return;
    if (drag.moved) savePos(p.id, drag.x, drag.y);
    else navigate(`/checklist/${p.id}`);
    setDrag(null);
  };

  const unplace = (e, id) => {
    e.stopPropagation();
    savePos(id, null, null);
  };

  return (
    <div className="bg-white rounded-xl border border-border p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-sm flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" /> Plano del piso
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5 text-muted-foreground" />
            <Input value={w} onChange={(e) => setW(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dimsDirty && saveDimensions()} placeholder="Ancho" inputMode="decimal" className="w-16 h-8" />
            <span className="text-xs text-muted-foreground">×</span>
            <Input value={l} onChange={(e) => setL(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dimsDirty && saveDimensions()} placeholder="Largo" inputMode="decimal" className="w-16 h-8" />
            <span className="text-xs text-muted-foreground">m</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={saveDimensions}
              disabled={!dimsDirty || savingDims}
              title={dimsDirty ? "Guardar las medidas del piso" : "Escribe el ancho y el largo para guardarlos"}
            >
              {savingDims && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar medidas
            </Button>
          </div>
          {floor.plan_url && (
            <Button size="sm" variant="outline" className="h-8" onClick={() => setStyleOpen(true)} title="Color y transparencia de los pines">
              <Palette className="w-4 h-4 mr-1.5" /> Pines
            </Button>
          )}
          <label className="inline-flex items-center gap-1.5 text-sm px-3 h-8 rounded-md border border-border cursor-pointer hover:bg-muted">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {floor.plan_url ? "Cambiar plano" : "Subir plano"}
            <input type="file" accept="image/*" className="hidden" onChange={uploadPlan} />
          </label>
          {floor.plan_url && (
            <button onClick={removePlan} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500" title="Quitar plano">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!floor.plan_url ? (
        <label className="flex flex-col items-center justify-center gap-2 py-10 rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
          <Upload className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Sube una imagen del plano para ubicar los puntos sobre él</span>
          <input type="file" accept="image/*" className="hidden" onChange={uploadPlan} />
        </label>
      ) : (
        <>
          {placingId && (
            <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 text-primary rounded-lg px-3 py-2">
              <span>Toca el plano para ubicar «{placingPoint?.name}».</span>
              <button onClick={() => setPlacingId(null)} className="font-medium hover:underline">Cancelar</button>
            </div>
          )}
          <div
            ref={containerRef}
            onClick={onPlanClick}
            className={`relative w-full overflow-hidden rounded-lg border border-border bg-muted/30 ${placingId ? "cursor-crosshair" : ""}`}
          >
            <img src={floor.plan_url} alt="Plano del piso" draggable={false} className="block w-full h-auto select-none pointer-events-none" />
            {placed.map((p) => {
              const pos = drag?.id === p.id ? { x: drag.x, y: drag.y } : { x: p.plan_x, y: p.plan_y };
              const pin = resolvePinStyle(activeProject, p.status);
              return (
                <div
                  key={p.id}
                  onPointerDown={(e) => startDrag(e, p)}
                  onPointerMove={onPinMove}
                  onPointerUp={(e) => endDrag(e, p)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group touch-none cursor-grab active:cursor-grabbing"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  title={p.name}
                >
                  <div className="relative">
                    {/* Ring + fill, each with its own opacity. The white halo
                        follows the ring, so a transparent contour leaves nothing
                        drawn around the pin. */}
                    <div
                      className="w-5 h-5 rounded-full"
                      style={{
                        backgroundColor: pin.fill,
                        border: `2px solid ${pin.border}`,
                        boxShadow: pin.borderOpacity > 0
                          ? "0 0 0 1.5px rgba(255,255,255,0.95), 0 1px 2px rgba(0,0,0,0.25)"
                          : "none",
                      }}
                    />
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => unplace(e, p.id)}
                      className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-white border border-border text-muted-foreground hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Quitar del plano"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    <span className="absolute left-1/2 -translate-x-1/2 top-6 whitespace-nowrap text-[10px] font-medium bg-white/90 px-1 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 pointer-events-none">
                      {p.name}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {unplaced.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Puntos sin ubicar ({unplaced.length}) — toca uno y luego toca el plano:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unplaced.map((p) => {
                  const pin = resolvePinStyle(activeProject, p.status);
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlacingId(placingId === p.id ? null : p.id)}
                      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${placingId === p.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pin.fill, border: `1.5px solid ${pin.border}` }} />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Arrastra un pin para moverlo · toca un pin para abrir su checklist. Los pines se guardan solos.</span>
            {savedW > 0 && savedL > 0 && (
              <span>Medidas: {savedW} × {savedL} m · {Math.round(savedW * savedL)} m²</span>
            )}
          </div>
        </>
      )}

      <PinStyleDialog open={styleOpen} onClose={() => setStyleOpen(false)} project={activeProject} />
    </div>
  );
}
