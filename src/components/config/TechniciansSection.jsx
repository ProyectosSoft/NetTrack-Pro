import React, { useState } from "react";
import { db } from "@/api/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, HardHat, Phone } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTechnicians, useInvalidateData } from "@/lib/queries";
import DataError from "@/components/shared/DataError";

const SPECIALTIES = {
  general: { label: "General", color: "bg-muted text-muted-foreground" },
  redes: { label: "Redes", color: "bg-blue-50 text-blue-600" },
  cctv: { label: "CCTV", color: "bg-purple-50 text-purple-600" },
  wifi: { label: "WiFi", color: "bg-green-50 text-green-600" },
};

export default function TechniciansSection() {
  const { toast } = useToast();
  const techsQ = useTechnicians();
  const techs = techsQ.data ?? [];
  const invalidate = useInvalidateData();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("general");
  const [phone, setPhone] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await db.entities.Technician.create({
        name: name.trim(),
        specialty,
        phone: phone.trim(),
        active: true,
      });
      toast({ title: "Técnico agregado", description: name.trim() });
      setName("");
      setPhone("");
      setSpecialty("general");
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: e.message || "No se pudo agregar el técnico" });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try {
      await db.entities.Technician.delete(id);
      toast({ title: "Técnico eliminado" });
      invalidate();
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar" });
    }
  };

  if (techsQ.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (techsQ.isError) {
    return <DataError onRetry={invalidate} message="No se pudieron cargar los técnicos." />;
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-heading font-semibold text-sm mb-1">Agregar técnico</h3>
        <p className="text-xs text-muted-foreground mb-4">Registra un técnico para asignarlo a puntos de instalación</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={specialty} onValueChange={setSpecialty}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="general">General</SelectItem>
              <SelectItem value="redes">Redes</SelectItem>
              <SelectItem value="cctv">CCTV</SelectItem>
              <SelectItem value="wifi">WiFi</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button onClick={handleAdd} disabled={saving || !name.trim()} className="mt-3" size="sm">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Agregar
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="font-heading font-semibold text-sm mb-3">Técnicos ({techs.length})</h3>
        {techs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay técnicos registrados</p>
        ) : (
          <div className="divide-y divide-border">
            {techs.map((t) => {
              const sp = SPECIALTIES[t.specialty] || SPECIALTIES.general;
              return (
                <div key={t.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <HardHat className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {t.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sp.color}`}>{sp.label}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(t.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}