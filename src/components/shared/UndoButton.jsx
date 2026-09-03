import React from "react";
import { Undo2 } from "lucide-react";
import { useUndo } from "@/lib/UndoContext";

// Visible undo affordance (mainly for touch devices, where Ctrl+Z isn't
// available). Only rendered when there is something to undo.
export default function UndoButton({ className = "" }) {
  const { undo, canUndo } = useUndo();
  if (!canUndo) return null;
  return (
    <button
      onClick={undo}
      title="Deshacer (Ctrl+Z)"
      aria-label="Deshacer"
      className={`p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground ${className}`}
    >
      <Undo2 className="w-4 h-4" />
    </button>
  );
}
