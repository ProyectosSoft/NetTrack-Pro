import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/api/db";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import StatusBadge from "@/components/shared/StatusBadge";
import DeviceIcon from "@/components/shared/DeviceIcon";
import ProgressBar from "@/components/shared/ProgressBar";
import { ArrowLeft, Loader2, Save, Camera, X, Download } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getTemplate, FIELD_LABELS } from "@/lib/checklistTemplates";
import { getPointPhaseProgress, getEquipmentFieldPhase } from "@/lib/pointProgress";
import { usePoint, useFloors, useSpaces, useTechnicians, useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import { exportPointPdf } from "@/lib/exportFloorPdf";
import { useProject } from "@/lib/ProjectContext";
import { useAuth } from "@/lib/AuthContext";
import { sortItems } from "@/lib/ordering";
import DataError from "@/components/shared/DataError";

export default function Checklist() {
  const { pointId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const invalidate = useInvalidateData();
  const run = useAction();
  const { data: point, isLoading, isError } = usePoint(pointId);
  const { data: floors = [] } = useFloors();
  const { data: spaces = [] } = useSpaces();
  const { data: technicians = [] } = useTechnicians();
  const { activeProject } = useProject();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => { if (point) setForm(point); }, [point]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // Location is read off the edited form, so the header and the export reflect
  // a pending move before it is saved.
  const sortedFloors = useMemo(() => [...floors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [floors]);
  const floorSpaces = useMemo(
    () => sortItems(spaces.filter((s) => s.floor_id === form?.floor_id), "manual"),
    [spaces, form?.floor_id]
  );
  const floor = useMemo(() => floors.find((f) => f.id === form?.floor_id), [floors, form?.floor_id]);
  const space = useMemo(() => spaces.find((s) => s.id === form?.space_id), [spaces, form?.space_id]);

  // Moving the point: a space belongs to one floor, so switching floor also
  // re-points space_id at that floor's first space.
  const changeFloor = (floorId) => {
    const first = sortItems(spaces.filter((s) => s.floor_id === floorId), "manual")[0];
    setForm((prev) => ({ ...prev, floor_id: floorId, space_id: first?.id || "" }));
  };

  const save = async () => {
    setSaving(true);
    const ok = await run(async () => {
      const { id, created_date, updated_date, created_by_id, ...data } = form;
      await db.entities.InstallationPoint.update(pointId, data);
      return true;
    });
    setSaving(false);
    if (ok) {
      invalidate();
      toast({ title: "Guardado", description: "Los cambios se guardaron correctamente." });
      navigate(-1);
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    await run(() => exportPointPdf(form, floor, space, { project: activeProject, user }), "No se pudo exportar el PDF");
    setExporting(false);
  };

  const uploadPhoto = (e) => run(async () => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file_url } = await db.uploadFile({ file });
    update("evidencia", [...(form.evidencia || []), file_url]);
  });

  const removePhoto = (url) => {
    update("evidencia", (form.evidencia || []).filter((u) => u !== url));
  };

  if (isError) {
    return <DataError onRetry={invalidate} />;
  }

  if (isLoading || !form) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const tpl = getTemplate(form.device_type);
  const phases = getPointPhaseProgress(form);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/pisos/${point.floor_id}`} className="p-2 rounded-lg hover:bg-muted">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <DeviceIcon type={form.device_type} />
            <h1 className="text-xl font-heading font-bold tracking-tight truncate">{form.name}</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{floor?.name || "—"} · {space?.name || "—"}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={form.status} />
          <Button
            onClick={exportPdf}
            disabled={exporting}
            size="sm"
            variant="outline"
            title="Exportar este punto a PDF"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="sr-only sm:not-sr-only sm:ml-1.5">PDF</span>
          </Button>
        </div>
      </div>

      {/* Status & Template info */}
      <Section title="General">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs mb-1.5 block">Piso</Label>
            <Select value={form.floor_id || ""} onValueChange={changeFloor}>
              <SelectTrigger><SelectValue placeholder="Seleccionar piso" /></SelectTrigger>
              <SelectContent>
                {sortedFloors.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Espacio</Label>
            <Select value={form.space_id || ""} onValueChange={(v) => update("space_id", v)} disabled={floorSpaces.length === 0}>
              <SelectTrigger><SelectValue placeholder="Seleccionar espacio" /></SelectTrigger>
              <SelectContent>
                {floorSpaces.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {floorSpaces.length === 0 && (
              <p className="text-xs text-amber-600 mt-1.5">Este piso no tiene espacios.</p>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Estado</Label>
            <Select value={form.status} onValueChange={(v) => update("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="en_proceso">En proceso</SelectItem>
                <SelectItem value="finalizado">Finalizado</SelectItem>
                <SelectItem value="con_observaciones">Con observaciones</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Plantilla</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground">
              <DeviceIcon type={form.device_type} size="sm" />
              {tpl.label}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs mb-1.5 block">Técnico asignado</Label>
            <Select value={form.technician || "none"} onValueChange={(v) => update("technician", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {technicians.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs mb-1.5 block">Descripción</Label>
            <Textarea
              value={form.description || ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Descripción del punto (ubicación, referencia, detalles)..."
              rows={2}
            />
          </div>
        </div>
      </Section>

      {/* Custom fields defined on the project */}
      {activeProject?.point_fields?.length > 0 && (
        <Section title="Campos personalizados">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeProject.point_fields.map((f) => (
              <CustomField
                key={f.id}
                field={f}
                value={form.custom_fields?.[f.id]}
                onChange={(val) => update("custom_fields", { ...(form.custom_fields || {}), [f.id]: val })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Phase progress */}
      <Section title="Avance por fase">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PhaseProgress label="Fase Piso" data={phases.piso} />
          <PhaseProgress label="Fase Rack" data={phases.rack} />
        </div>
      </Section>

      {/* Activities */}
      <Section title="Actividades" phase="piso">
        <div className="space-y-3">
          {tpl.activities.map((field) => (
            <div key={field} className="flex items-center justify-between">
              <CheckItem label={FIELD_LABELS[field]} checked={form[field]} onChange={(v) => update(field, v)} />
              {field === "act_ponchado" && tpl.showPonchadoType && (
                <Select value={form.ponchado_type || "na"} onValueChange={(v) => update("ponchado_type", v)}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="na">N/A</SelectItem>
                    <SelectItem value="jack">Jack (ETH)</SelectItem>
                    <SelectItem value="z_plug">Z-Plug</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          {(tpl.customChecks || []).filter((c) => c.category === "activities").map((c) => (
            <CheckItem key={c.id} label={c.label} checked={form.custom_checks?.[c.id]} onChange={(v) => update("custom_checks", { ...(form.custom_checks || {}), [c.id]: v })} />
          ))}
        </div>
      </Section>

      {/* Accessories */}
      {(tpl.accessories.length > 0 || (tpl.customChecks || []).some((c) => c.category === "accessories")) && (
        <Section title="Accesorios" phase="piso">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tpl.accessories.map((field) => (
              <CheckItem key={field} label={FIELD_LABELS[field]} checked={form[field]} onChange={(v) => update(field, v)} />
            ))}
            {(tpl.customChecks || []).filter((c) => c.category === "accessories").map((c) => (
              <CheckItem key={c.id} label={c.label} checked={form.custom_checks?.[c.id]} onChange={(v) => update("custom_checks", { ...(form.custom_checks || {}), [c.id]: v })} />
            ))}
          </div>
        </Section>
      )}

      {/* Equipment (mixed phase: some items are Piso, some Rack) */}
      <Section title="Equipo">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tpl.equipment.map((field) => (
            <CheckItem key={field} label={FIELD_LABELS[field]} checked={form[field]} onChange={(v) => update(field, v)} phase={getEquipmentFieldPhase(field)} />
          ))}
          {(tpl.customChecks || []).filter((c) => c.category === "equipment").map((c) => (
            <CheckItem key={c.id} label={c.label} checked={form.custom_checks?.[c.id]} onChange={(v) => update("custom_checks", { ...(form.custom_checks || {}), [c.id]: v })} phase="rack" />
          ))}
        </div>
      </Section>

      {/* Network */}
      {tpl.showNetwork && (
      <Section title="Red" phase="rack">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs mb-1.5 block">Puerto Patch Panel</Label>
            <Input value={form.puerto_patch_panel || ""} onChange={(e) => update("puerto_patch_panel", e.target.value)} placeholder="Ej: PP1-24" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">Puerto Switch</Label>
            <Input value={form.puerto_switch || ""} onChange={(e) => update("puerto_switch", e.target.value)} placeholder="Ej: SW1-GE0/1" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block">VLAN</Label>
            <Input value={form.vlan || ""} onChange={(e) => update("vlan", e.target.value)} placeholder="Ej: VLAN 100" />
          </div>
        </div>
      </Section>
      )}

      {/* Observations */}
      <Section title="Observaciones">
        <Textarea
          value={form.observaciones || ""}
          onChange={(e) => update("observaciones", e.target.value)}
          placeholder="Notas adicionales sobre la instalación..."
          rows={3}
        />
      </Section>

      {/* Evidence */}
      <Section title="Evidencia fotográfica">
        <div className="flex flex-wrap gap-3">
          {(form.evidencia || []).map((url, i) => (
            <div key={i} className="relative w-24 h-24 rounded-lg overflow-hidden border border-border group">
              <img src={url} alt={`Evidencia ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(url)}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <label className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
            <Camera className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground mt-1">Agregar</span>
            <input type="file" accept="image/*" className="hidden" onChange={uploadPhoto} />
          </label>
        </div>
      </Section>

      {/* Save */}
      <div className="sticky bottom-4">
        <Button onClick={save} disabled={saving || !form.space_id} className="w-full shadow-lg">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

const PHASE_BADGE = {
  piso: "bg-blue-50 text-blue-600",
  rack: "bg-purple-50 text-purple-600",
};

function Section({ title, phase, children }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-heading font-semibold text-sm">{title}</h3>
        {phase && (
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${PHASE_BADGE[phase]}`}>
            {phase === "piso" ? "Piso" : "Rack"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function PhaseProgress({ label, data }) {
  return (
    <div className="p-3 rounded-lg bg-muted/40">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {data.total ? `${data.done}/${data.total} · ${data.pct}%` : "N/A"}
        </span>
      </div>
      <ProgressBar value={data.pct} />
    </div>
  );
}

function CheckItem({ label, checked, onChange, phase }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <Checkbox checked={!!checked} onCheckedChange={onChange} />
      <span className="text-sm text-foreground group-hover:text-primary transition-colors">{label}</span>
      {phase && (
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${PHASE_BADGE[phase]}`}>
          {phase === "piso" ? "Piso" : "Rack"}
        </span>
      )}
    </label>
  );
}

// One project-defined custom field, rendered by its type. Values are stored as
// strings in the point's custom_fields map.
function CustomField({ field, value, onChange }) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2.5 cursor-pointer sm:col-span-2">
        <Checkbox checked={value === "true"} onCheckedChange={(v) => onChange(v ? "true" : "false")} />
        <span className="text-sm">{field.label}</span>
      </label>
    );
  }
  return (
    <div>
      <Label className="text-xs mb-1.5 block">{field.label}</Label>
      {field.type === "select" ? (
        <Select value={value || ""} onValueChange={onChange}>
          <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={field.type === "number" ? "number" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}