import React, { useEffect, useState } from "react";
import { db } from "@/api/db";
import { useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import {
  PIN_STATUS_COLORS, DEFAULT_PIN_OPACITY, DEFAULT_PIN_BORDER_OPACITY,
  isHexColor, normalizePinOpacity, resolvePinStyle, showPinLabelsInPdf,
} from "@/lib/branding";

const STATUS_LABELS = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  con_observaciones: "Con obs.",
};

const FALLBACK_COLOR = "#2563eb";

// Opacity slider with the usual presets, used for both the fill and the contour.
function OpacityControl({ label, value, onChange, hint }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{value === 0 ? "Transparente" : `${value}%`}</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary cursor-pointer"
      />
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(0)}>Transparente</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(50)}>Medio</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(100)}>Sólido</Button>
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
    </div>
  );
}

// Appearance of the plan pins, stored on the project so every floor plan in it
// looks the same. Colour is either the point's status colour (default) or a
// fixed one, and the fill opacity goes down to 0 for contour-only pins.
export default function PinStyleDialog({ open, onClose, project }) {
  const invalidate = useInvalidateData();
  const run = useAction();
  const { toast } = useToast();
  const [mode, setMode] = useState("status"); // "status" | "fixed"
  const [color, setColor] = useState(FALLBACK_COLOR);
  const [opacity, setOpacity] = useState(DEFAULT_PIN_OPACITY);
  const [borderOpacity, setBorderOpacity] = useState(DEFAULT_PIN_BORDER_OPACITY);
  const [pdfLabels, setPdfLabels] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fixed = isHexColor(project?.pin_color);
    setMode(fixed ? "fixed" : "status");
    setColor(fixed ? project.pin_color.trim() : FALLBACK_COLOR);
    setOpacity(normalizePinOpacity(project?.pin_opacity ?? DEFAULT_PIN_OPACITY));
    setBorderOpacity(normalizePinOpacity(project?.pin_border_opacity ?? DEFAULT_PIN_BORDER_OPACITY));
    setPdfLabels(showPinLabelsInPdf(project));
  }, [open, project?.pin_color, project?.pin_opacity, project?.pin_border_opacity, project?.pin_labels_pdf]);

  // Preview uses the same resolver as the plan, on a throwaway project shape.
  const preview = {
    pin_color: mode === "fixed" ? color : "",
    pin_opacity: opacity,
    pin_border_opacity: borderOpacity,
  };
  const previewStatuses = mode === "fixed" ? ["finalizado"] : Object.keys(PIN_STATUS_COLORS);

  const save = async () => {
    if (!project) return;
    if (mode === "fixed" && !isHexColor(color)) {
      toast({ variant: "destructive", title: "Color inválido", description: "Usa un color hexadecimal, por ejemplo #2563eb." });
      return;
    }
    setSaving(true);
    const ok = await run(async () => {
      await db.entities.ProjectInfo.update(project.id, {
        pin_color: mode === "fixed" ? color.trim() : "",
        pin_opacity: normalizePinOpacity(opacity),
        pin_border_opacity: normalizePinOpacity(borderOpacity),
        pin_labels_pdf: pdfLabels,
      });
      return true;
    }, "No se pudo guardar el estilo de los pines");
    setSaving(false);
    if (!ok) return;
    toast({ title: "Estilo de pines guardado" });
    invalidate();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Estilo de los pines</DialogTitle></DialogHeader>

        {!project ? (
          <p className="text-sm text-muted-foreground">Selecciona un proyecto para configurar sus pines.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Color</Label>
              <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setMode("status")}
                  className={`px-3 py-1.5 font-medium transition-colors ${mode === "status" ? "bg-primary text-white" : "hover:bg-muted"}`}
                >
                  Según el estado
                </button>
                <button
                  onClick={() => setMode("fixed")}
                  className={`px-3 py-1.5 font-medium transition-colors ${mode === "fixed" ? "bg-primary text-white" : "hover:bg-muted"}`}
                >
                  Color fijo
                </button>
              </div>
              {mode === "fixed" && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="color"
                    value={isHexColor(color) ? color : FALLBACK_COLOR}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-10 rounded-md border border-border cursor-pointer bg-white p-0.5"
                  />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#2563eb" className="h-9 font-mono text-xs w-32" />
                </div>
              )}
            </div>

            <OpacityControl
              label="Relleno"
              value={opacity}
              onChange={setOpacity}
              hint="Con el relleno transparente solo queda el contorno, así el plano se ve a través del pin."
            />

            <OpacityControl
              label="Contorno"
              value={borderOpacity}
              onChange={setBorderOpacity}
              hint={
                borderOpacity === 0 && opacity === 0
                  ? "Con el relleno y el contorno transparentes los pines quedan invisibles: seguirán ahí y podrás arrastrarlos, pero no se verán."
                  : "El contorno incluye el halo blanco que separa el pin del dibujo."
              }
            />

            <div>
              <Label className="text-xs mb-1.5 block">Vista previa</Label>
              <div
                className="flex items-center gap-5 rounded-lg border border-border p-4"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%), linear-gradient(45deg, #f1f5f9 25%, #ffffff 25%, #ffffff 75%, #f1f5f9 75%)",
                  backgroundSize: "14px 14px",
                  backgroundPosition: "0 0, 7px 7px",
                }}
              >
                {previewStatuses.map((status) => {
                  const pin = resolvePinStyle(preview, status);
                  return (
                    <div key={status} className="flex flex-col items-center gap-1.5">
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
                      {mode === "status" && <span className="text-[10px] text-muted-foreground">{STATUS_LABELS[status]}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border p-3">
              <Checkbox checked={pdfLabels} onCheckedChange={(v) => setPdfLabels(!!v)} className="mt-0.5" />
              <span className="text-xs">
                <span className="font-medium">Imprimir los nombres en el PDF</span>
                <span className="block text-muted-foreground mt-0.5">
                  Actívalo solo si tu plano no trae los rótulos dibujados; si ya los trae, se duplicarían.
                  En la app el nombre siempre aparece al pasar sobre el pin.
                </span>
              </span>
            </label>

            <p className="text-xs text-muted-foreground">
              Aplica a los planos de todos los pisos de «{project.project_name}».
            </p>

            <Button onClick={save} disabled={saving} className="w-full">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
