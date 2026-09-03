import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useInvalidateData } from "@/lib/queries";
import { toast } from "@/components/ui/use-toast";
import { Undo2 } from "lucide-react";

// A lightweight undo stack. Each entry is { label, run } where run() is an async
// function that reverts the action (typically an importMany that restores the
// affected records to their captured snapshot, or a delete of what was created).
//
// Ctrl/Cmd+Z undoes the most recent action; every action's toast also shows a
// "Deshacer" button that undoes that specific action. The stack lives in memory
// for the session only.
//
// Caveat: the database is shared and open, so undo overwrites whatever the record
// looks like now with the captured snapshot — if someone else changed the same
// record in the meantime, that change is replaced.

const UndoCtx = createContext(null);
const MAX = 25;

export function UndoProvider({ children }) {
  const invalidate = useInvalidateData();
  const stackRef = useRef([]);
  const idRef = useRef(0);
  const busyRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);

  const runEntry = useCallback(async (item) => {
    if (busyRef.current) return;
    const idx = stackRef.current.findIndex((x) => x._id === item._id);
    if (idx === -1) return; // already undone
    stackRef.current.splice(idx, 1);
    setCanUndo(stackRef.current.length > 0);
    busyRef.current = true;
    try {
      await item.run();
      invalidate();
      toast({ title: "Acción deshecha", description: item.label || "" });
    } catch (e) {
      // Restore the entry so the user can retry.
      stackRef.current.splice(idx, 0, item);
      setCanUndo(true);
      toast({ title: "No se pudo deshacer", description: e?.message || String(e), variant: "destructive" });
    } finally {
      busyRef.current = false;
    }
  }, [invalidate]);

  // Register an undoable action. Returns a function that undoes *this* action.
  const pushUndo = useCallback((entry) => {
    if (!entry || typeof entry.run !== "function") return () => {};
    const item = { ...entry, _id: (idRef.current += 1) };
    stackRef.current.push(item);
    if (stackRef.current.length > MAX) stackRef.current.shift();
    setCanUndo(true);
    return () => runEntry(item);
  }, [runEntry]);

  // Undo the most recent action (Ctrl+Z).
  const undo = useCallback(() => {
    const top = stackRef.current[stackRef.current.length - 1];
    if (top) runEntry(top);
  }, [runEntry]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== "z" && e.key !== "Z") || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const t = e.target;
      const tag = t?.tagName;
      // Let native text-editing undo win inside form fields.
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t?.isContentEditable) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  return <UndoCtx.Provider value={{ pushUndo, undo, canUndo }}>{children}</UndoCtx.Provider>;
}

export function useUndo() {
  return useContext(UndoCtx) || { pushUndo: () => () => {}, undo: () => {}, canUndo: false };
}

// Convenience: run after an action succeeds. Registers the undo and shows a toast
// with a "Deshacer" button wired to undo this specific action.
export function useUndoableToast() {
  const { pushUndo } = useUndo();
  return useCallback(({ title, description, label, run }) => {
    const undoThis = pushUndo({ label: label || title, run });
    toast({
      title,
      description,
      duration: 8000,
      action: (
        <button
          onClick={undoThis}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-sm font-medium hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Undo2 className="w-3.5 h-3.5" /> Deshacer
        </button>
      ),
    });
  }, [pushUndo]);
}
