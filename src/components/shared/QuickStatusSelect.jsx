import React, { useState } from "react";
import { db } from "@/api/db";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useUndoableToast } from "@/lib/UndoContext";

const STATUS = {
  pendiente: { label: "Pendiente", cls: "bg-slate-100 text-slate-600" },
  en_proceso: { label: "En proceso", cls: "bg-amber-50 text-amber-700" },
  finalizado: { label: "Finalizado", cls: "bg-emerald-50 text-emerald-700" },
  con_observaciones: { label: "Con obs.", cls: "bg-red-50 text-red-700" },
};

// Inline status changer styled like a StatusBadge. Lives inside row <Link>s, so
// it stops clicks from navigating and updates the point directly.
export default function QuickStatusSelect({ point, onChanged }) {
  const [saving, setSaving] = useState(false);
  const undoToast = useUndoableToast();
  const s = STATUS[point.status] || STATUS.pendiente;

  const change = async (value) => {
    const prev = point.status;
    if (value === prev) return;
    setSaving(true);
    try {
      await db.entities.InstallationPoint.update(point.id, { status: value });
      onChanged?.();
      undoToast({
        title: "Estado actualizado",
        description: `"${point.name}" → ${(STATUS[value] || {}).label || value}.`,
        label: "Cambiar estado",
        run: async () => { await db.entities.InstallationPoint.update(point.id, { status: prev }); onChanged?.(); },
      });
    } finally {
      setSaving(false);
    }
  };

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <span onClick={stop} onPointerDown={stop}>
      <Select value={point.status} onValueChange={change}>
        <SelectTrigger
          className={`h-auto py-0.5 px-2.5 rounded-full border-0 text-xs font-medium gap-1 focus:ring-1 ${s.cls}`}
          aria-label="Cambiar estado"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : s.label}
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS).map(([value, cfg]) => (
            <SelectItem key={value} value={value}>{cfg.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}
