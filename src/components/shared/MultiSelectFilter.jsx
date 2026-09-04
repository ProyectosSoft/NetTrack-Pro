import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// A dropdown that lets the user pick several options at once (checkboxes).
// An empty selection means "all". `selected` is a Set; `onChange` gets a new Set.
export default function MultiSelectFilter({ allLabel, options, selected, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (value) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value); else next.add(value);
    onChange(next);
  };

  const summary =
    selected.size === 0
      ? allLabel
      : options.filter((o) => selected.has(o.value)).map((o) => o.label).join(", ");

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm"
        title={summary}
      >
        <span className="truncate text-left">{summary}</span>
        <ChevronDown className={`w-4 h-4 opacity-50 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-48 max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-1">
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
          >
            <span className={`w-4 h-4 flex items-center justify-center ${selected.size === 0 ? "text-primary" : "opacity-0"}`}>
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className="font-medium">{allLabel}</span>
          </button>
          <div className="my-1 h-px bg-border" />
          {options.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin opciones</p>
          ) : (
            options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer">
                <Checkbox checked={selected.has(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
