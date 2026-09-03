import React, { useState } from "react";
import { db } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2, ClipboardList, Save, Wifi, Camera, Cable, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ALL_FIELDS, FIELD_LABELS, DEFAULT_TEMPLATES } from "@/lib/checklistTemplates";
import { useTemplates, useInvalidateData } from "@/lib/queries";
import { useAction } from "@/lib/useAction";
import DataError from "@/components/shared/DataError";

const DEVICE_ICONS = { ethernet: Cable, camara: Camera, access_point: Wifi };
const DEVICE_LABELS = { ethernet: "Ethernet", camara: "Cámara CCTV", access_point: "Access Point" };

export default function Templates() {
  const { toast } = useToast();
  const { data: templates = [], isLoading: loading, isError } = useTemplates();
  const invalidate = useInvalidateData();
  const run = useAction();
  const [saving, setSaving] = useState(false);
  const [editTpl, setEditTpl] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("ethernet");

  const toggleField = (tpl, category, field) => {
    const current = tpl[category] || [];
    const updated = current.includes(field) ? current.filter((f) => f !== field) : [...current, field];
    setEditTpl({ ...tpl, [category]: updated });
  };

  const addCustomCheck = (tpl, category, label) => {
    if (!label.trim()) return;
    const id = "custom_" + Date.now();
    setEditTpl({ ...tpl, custom_checks: [...(tpl.custom_checks || []), { id, label: label.trim(), category, enabled: true }] });
  };

  const removeCustomCheck = (tpl, checkId) => {
    setEditTpl({ ...tpl, custom_checks: (tpl.custom_checks || []).filter((c) => c.id !== checkId) });
  };

  const toggleCustomCheck = (tpl, checkId) => {
    setEditTpl({
      ...tpl,
      custom_checks: (tpl.custom_checks || []).map((c) =>
        c.id === checkId ? { ...c, enabled: c.enabled === false } : c
      ),
    });
  };

  const saveTemplate = async () => {
    setSaving(true);
    const ok = await run(async () => {
      const { id, created_date, updated_date, created_by_id, ...data } = editTpl;
      await db.entities.ChecklistTemplate.update(editTpl.id, data);
      return true;
    });
    setSaving(false);
    if (ok) {
      toast({ title: "Plantilla guardada", description: "Los cambios se aplicaron correctamente." });
      setEditTpl(null);
      invalidate();
    }
  };

  const deleteTemplate = () => run(async () => {
    if (!deleteTarget) return;
    await db.entities.ChecklistTemplate.delete(deleteTarget.id);
    toast({ title: "Plantilla eliminada" });
    setDeleteTarget(null);
    invalidate();
  });

  const createTemplate = () => run(async () => {
    if (!newName.trim()) return;
    const defaults = DEFAULT_TEMPLATES[newType];
    await db.entities.ChecklistTemplate.create({
      name: newName.trim(),
      device_type: newType,
      activities: defaults.activities,
      accessories: defaults.accessories,
      equipment: defaults.equipment,
      show_ponchado_type: defaults.showPonchadoType,
      show_network: defaults.showNetwork,
      custom_checks: [],
    });
    toast({ title: "Plantilla creada" });
    setCreateOpen(false);
    setNewName("");
    invalidate();
  });

  const seedDefaults = async () => {
    setSaving(true);
    const ok = await run(async () => {
      for (const [type, tpl] of Object.entries(DEFAULT_TEMPLATES)) {
        await db.entities.ChecklistTemplate.create({
          name: tpl.label,
          device_type: type,
          activities: tpl.activities,
          accessories: tpl.accessories,
          equipment: tpl.equipment,
          show_ponchado_type: tpl.showPonchadoType,
          show_network: tpl.showNetwork,
          custom_checks: [],
        });
      }
      return true;
    });
    setSaving(false);
    if (ok) {
      toast({ title: "Plantillas por defecto creadas" });
      invalidate();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (isError) {
    return <DataError onRetry={invalidate} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Plantillas</h1>
          <p className="text-muted-foreground text-sm mt-1">Define qué items aplica cada tipo de dispositivo</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" /> Nueva
        </Button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No hay plantillas. ¿Crear las plantillas por defecto?</p>
          <Button onClick={seedDefaults} disabled={saving} size="sm">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Crear plantillas por defecto
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => {
            const Icon = DEVICE_ICONS[tpl.device_type] || Cable;
            const totalItems = (tpl.activities?.length || 0) + (tpl.accessories?.length || 0) + (tpl.equipment?.length || 0) + (tpl.custom_checks?.filter((c) => c.enabled !== false).length || 0);
            return (
              <div key={tpl.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground">{DEVICE_LABELS[tpl.device_type]} · {totalItems} items</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditTpl({ ...tpl })}>Editar</Button>
                    <button type="button" onClick={() => setDeleteTarget(tpl)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {["activities", "accessories", "equipment"].map((cat) => (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        {cat === "activities" ? "Actividades" : cat === "accessories" ? "Accesorios" : "Equipo"}
                      </p>
                      <div className="space-y-1.5">
                        {ALL_FIELDS[cat].map((f) => (
                          <div key={f} className={`flex items-center gap-2 text-sm ${tpl[cat]?.includes(f) ? "text-foreground" : "text-muted-foreground/50"}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${tpl[cat]?.includes(f) ? "bg-primary" : "bg-muted-foreground/20"}`} />
                            {FIELD_LABELS[f]}
                          </div>
                        ))}
                        {(tpl.custom_checks || []).filter((c) => c.category === cat).map((c) => {
                          const enabled = c.enabled !== false;
                          return (
                            <div key={c.id} className={`flex items-center gap-2 text-sm ${enabled ? "text-foreground" : "text-muted-foreground/50"}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-primary" : "bg-muted-foreground/20"}`} />
                              {c.label}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editTpl} onOpenChange={(open) => { if (!open) setEditTpl(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar plantilla</DialogTitle>
          </DialogHeader>
          {editTpl && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1.5 block">Nombre</Label>
                  <Input value={editTpl.name} onChange={(e) => setEditTpl({ ...editTpl, name: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1.5 block">Tipo</Label>
                  <Select value={editTpl.device_type} onValueChange={(v) => setEditTpl({ ...editTpl, device_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ethernet">Ethernet</SelectItem>
                      <SelectItem value="camara">Cámara CCTV</SelectItem>
                      <SelectItem value="access_point">Access Point</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <FieldGroup title="Actividades" tpl={editTpl} category="activities" onToggle={toggleField} onAddCustom={addCustomCheck} onRemoveCustom={removeCustomCheck} onToggleCustom={toggleCustomCheck} />
              <FieldGroup title="Accesorios" tpl={editTpl} category="accessories" onToggle={toggleField} onAddCustom={addCustomCheck} onRemoveCustom={removeCustomCheck} onToggleCustom={toggleCustomCheck} />
              <FieldGroup title="Equipo" tpl={editTpl} category="equipment" onToggle={toggleField} onAddCustom={addCustomCheck} onRemoveCustom={removeCustomCheck} onToggleCustom={toggleCustomCheck} />

              <div className="space-y-3 pt-2 border-t border-border">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={!!editTpl.show_ponchado_type} onCheckedChange={(v) => setEditTpl({ ...editTpl, show_ponchado_type: v })} />
                  <span className="text-sm">Mostrar tipo de ponchado (Jack / Z-Plug)</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={editTpl.show_network ?? true} onCheckedChange={(v) => setEditTpl({ ...editTpl, show_network: v })} />
                  <span className="text-sm">Mostrar sección de red (Patch Panel, Switch, VLAN)</span>
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTpl(null)}>Cancelar</Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nueva plantilla</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Nombre</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Ethernet especial" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Tipo de dispositivo</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ethernet">Ethernet</SelectItem>
                  <SelectItem value="camara">Cámara CCTV</SelectItem>
                  <SelectItem value="access_point">Access Point</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createTemplate} className="w-full">Crear</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &ldquo;{deleteTarget?.name}&rdquo;. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTemplate} className="bg-red-600 hover:bg-red-700">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FieldGroup({ title, tpl, category, onToggle, onAddCustom, onRemoveCustom, onToggleCustom }) {
  const [newItem, setNewItem] = useState("");
  const customItems = (tpl.custom_checks || []).filter((c) => c.category === category);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ALL_FIELDS[category].map((field) => {
          const checked = tpl[category]?.includes(field) || false;
          return (
            <div key={field} className="flex items-center gap-2.5 h-8">
              <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                <Checkbox checked={checked} onCheckedChange={() => onToggle(tpl, category, field)} />
                <span className="text-sm leading-none">{FIELD_LABELS[field]}</span>
              </label>
              {checked && (
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(tpl, category, field); }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {customItems.map((c) => {
          const enabled = c.enabled !== false;
          return (
            <div key={c.id} className="flex items-center gap-2.5 h-8">
              <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                <Checkbox checked={enabled} onCheckedChange={() => onToggleCustom(tpl, c.id)} />
                <span className={`text-sm leading-none ${enabled ? "" : "text-muted-foreground/50"}`}>{c.label}</span>
              </label>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveCustom(tpl, c.id); }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddCustom(tpl, category, newItem); setNewItem(""); } }}
          placeholder={`Agregar ${title.toLowerCase()}...`}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => { onAddCustom(tpl, category, newItem); setNewItem(""); }}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}