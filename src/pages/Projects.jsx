import React, { useState, useMemo } from "react";
import { db } from "@/api/db";
import { useProjects, useFloors, useSpaces, usePoints, useInvalidateData } from "@/lib/queries";
import { useProject } from "@/lib/ProjectContext";
import { useAction } from "@/lib/useAction";
import { useToast } from "@/components/ui/use-toast";
import DataError from "@/components/shared/DataError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FolderKanban, Plus, Loader2, Save, Pencil, Trash2, Check, Building2, ImageIcon, X, MapPin, Link2, Phone, Mail, User, Palette } from "lucide-react";
import { TOGGLEABLE_MODULES, TERM_FIELDS } from "@/lib/branding";
import PointFieldsEditor from "@/components/custom-fields/PointFieldsEditor";

const STATUS = {
  activo: { label: "Activo", cls: "bg-emerald-50 text-emerald-700" },
  en_pausa: { label: "En pausa", cls: "bg-amber-50 text-amber-700" },
  finalizado: { label: "Finalizado", cls: "bg-slate-100 text-slate-600" },
};

const EMPTY = {
  project_name: "", client: "", status: "activo", address: "", city: "",
  url: "", phone: "", email: "", contact_name: "", logo_url: "",
  start_date: "", end_date: "", description: "",
  primary_color: "", hidden_modules: [], terminology: {}, point_fields: [],
};

export default function Projects() {
  const projectsQ = useProjects();
  const floorsQ = useFloors();
  const spacesQ = useSpaces();
  const pointsQ = usePoints();
  const projects = projectsQ.data ?? [];
  const floors = floorsQ.data ?? [];
  const spaces = spacesQ.data ?? [];
  const points = pointsQ.data ?? [];
  const invalidate = useInvalidateData();
  const run = useAction();
  const { toast } = useToast();
  const { activeProjectId, setActiveProjectId } = useProject();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // project being edited, or null for new
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleModule = (key) => set({
    hidden_modules: form.hidden_modules.includes(key)
      ? form.hidden_modules.filter((k) => k !== key)
      : [...form.hidden_modules, key],
  });
  const setTerm = (key, val) => set({ terminology: { ...form.terminology, [key]: val } });

  const floorCounts = useMemo(() => {
    const map = {};
    for (const f of floors) map[f.project_id] = (map[f.project_id] || 0) + 1;
    return map;
  }, [floors]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k] ?? EMPTY[k]])) });
    setDialogOpen(true);
  };

  const uploadLogo = (e) => run(async () => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await db.uploadFile({ file });
      set({ logo_url: file_url });
    } finally {
      setUploading(false);
    }
  });

  const save = async () => {
    if (!form.project_name.trim()) {
      toast({ variant: "destructive", title: "Campo requerido", description: "El nombre del proyecto es obligatorio." });
      return;
    }
    setSaving(true);
    const payload = { ...form, project_name: form.project_name.trim() };
    const ok = await run(async () => {
      if (editing) {
        await db.entities.ProjectInfo.update(editing.id, payload);
        return editing.id;
      }
      const created = await db.entities.ProjectInfo.create(payload);
      return created.id;
    });
    setSaving(false);
    if (ok) {
      if (!editing) setActiveProjectId(ok); // activate the newly created project
      setDialogOpen(false);
      toast({ title: editing ? "Proyecto actualizado" : "Proyecto creado" });
      invalidate();
    }
  };

  const confirmDelete = () => run(async () => {
    const proj = deleteTarget;
    const projFloors = floors.filter((f) => f.project_id === proj.id);
    for (const f of projFloors) {
      for (const s of spaces.filter((sp) => sp.floor_id === f.id)) {
        await db.entities.InstallationPoint.deleteMany({ space_id: s.id });
        await db.entities.Space.delete(s.id);
      }
      await db.entities.InstallationPoint.deleteMany({ floor_id: f.id });
      await db.entities.Floor.delete(f.id);
    }
    await db.entities.ProjectInfo.delete(proj.id);
    if (activeProjectId === proj.id) setActiveProjectId(null);
    setDeleteTarget(null);
    toast({ title: "Proyecto eliminado" });
    invalidate();
  });

  const loading = projectsQ.isLoading || floorsQ.isLoading;
  const isError = projectsQ.isError || floorsQ.isError || spacesQ.isError || pointsQ.isError;

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <DataError onRetry={invalidate} />;

  const delFloors = deleteTarget ? floors.filter((f) => f.project_id === deleteTarget.id) : [];
  const delFloorIds = new Set(delFloors.map((f) => f.id));
  const delPoints = deleteTarget ? points.filter((p) => delFloorIds.has(p.floor_id)).length : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-primary" /> Proyectos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Cada proyecto tiene sus propios pisos, espacios y puntos.</p>
        </div>
        <Button onClick={openNew} size="sm" className="flex-1 sm:flex-none"><Plus className="w-4 h-4 mr-1.5" /> Nuevo proyecto</Button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <FolderKanban className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Aún no hay proyectos. Crea el primero para empezar.</p>
          <Button onClick={openNew} variant="outline" size="sm" className="mt-4"><Plus className="w-4 h-4 mr-1.5" /> Crear proyecto</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => {
            const active = p.id === activeProjectId;
            const st = STATUS[p.status] || STATUS.activo;
            return (
              <div key={p.id} className={`bg-white rounded-xl border p-4 transition-colors ${active ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.logo_url ? <img src={p.logo_url} alt={p.project_name} className="w-full h-full object-cover" loading="lazy" /> : <Building2 className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate">{p.project_name}</p>
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                    </div>
                    {p.client && <p className="text-xs text-muted-foreground truncate">{p.client}</p>}
                    {p.address && <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 flex-shrink-0" /> {p.address}{p.city ? `, ${p.city}` : ""}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{floorCounts[p.id] || 0} pisos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  {active ? (
                    <span className="text-xs font-medium text-primary flex items-center gap-1 flex-1"><Check className="w-3.5 h-3.5" /> Proyecto activo</span>
                  ) : (
                    <button onClick={() => setActiveProjectId(p.id)} className="text-xs font-medium text-primary hover:underline flex-1 text-left">Usar este proyecto</button>
                  )}
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm px-3 h-9 rounded-md border border-border cursor-pointer hover:bg-muted">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />} Logo
                  <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
                </label>
                {form.logo_url && <button onClick={() => set({ logo_url: "" })} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><X className="w-4 h-4" /></button>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block">Nombre del proyecto *</Label>
                <Input value={form.project_name} onChange={(e) => set({ project_name: e.target.value })} placeholder="Ej: Hotel Continental" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Cliente</Label>
                <Input value={form.client} onChange={(e) => set({ client: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Estado</Label>
                <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="en_pausa">En pausa</SelectItem>
                    <SelectItem value="finalizado">Finalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><MapPin className="w-3 h-3" /> Dirección</Label>
                <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Ciudad</Label>
                <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Link2 className="w-3 h-3" /> URL</Label>
                <Input value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Phone className="w-3 h-3" /> Teléfono</Label>
                <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Mail className="w-3 h-3" /> Correo</Label>
                <Input value={form.email} onChange={(e) => set({ email: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><User className="w-3 h-3" /> Persona de contacto</Label>
                <Input value={form.contact_name} onChange={(e) => set({ contact_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Fecha de inicio</Label>
                <Input type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Fecha estimada de fin</Label>
                <Input type="date" value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs mb-1.5 block">Descripción</Label>
                <Textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2} />
              </div>
            </div>

            {/* Personalización */}
            <div className="border-t border-border pt-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personalización</p>

              <div>
                <Label className="text-xs mb-1.5 block flex items-center gap-1"><Palette className="w-3 h-3" /> Color de marca</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primary_color || "#1d4ed8"} onChange={(e) => set({ primary_color: e.target.value })} className="h-9 w-10 rounded-md border border-border cursor-pointer bg-white p-0.5" />
                  <Input value={form.primary_color} onChange={(e) => set({ primary_color: e.target.value })} placeholder="#1d4ed8" className="h-9 font-mono text-xs w-32" />
                  {form.primary_color && <button onClick={() => set({ primary_color: "" })} className="text-xs text-muted-foreground hover:text-foreground">Restablecer</button>}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Módulos visibles</Label>
                <div className="flex flex-wrap gap-4">
                  {TOGGLEABLE_MODULES.map((m) => (
                    <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox checked={!form.hidden_modules.includes(m.key)} onCheckedChange={() => toggleModule(m.key)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Terminología (renombrar etiquetas)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TERM_FIELDS.map((t) => (
                    <Input key={t.key} value={form.terminology[t.key] || ""} onChange={(e) => setTerm(t.key, e.target.value)} placeholder={t.label} className="h-8 text-sm" />
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1.5 block">Campos personalizados de puntos</Label>
                <p className="text-[11px] text-muted-foreground mb-2">Campos extra que aparecerán en el checklist de cada punto de este proyecto.</p>
                <PointFieldsEditor fields={form.point_fields} onChange={(pf) => set({ point_fields: pf })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving || uploading}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{deleteTarget?.project_name}&rdquo; junto con sus {delFloors.length} pisos y {delPoints} puntos. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
