import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, Settings, X, Network, ClipboardList, Tag, FolderKanban, Package, Images } from "lucide-react";
import { useProject, useTerms } from "@/lib/ProjectContext";
import { isModuleHidden } from "@/lib/branding";
import ThemeToggle from "@/components/shared/ThemeToggle";
import UndoButton from "@/components/shared/UndoButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const navItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Proyectos", path: "/proyectos", icon: FolderKanban, termKey: "projects" },
  { label: "Pisos", path: "/pisos", icon: Building2, termKey: "floors" },
  { label: "Puntos", path: "/puntos", icon: Network, module: "puntos", termKey: "points" },
  { label: "Materiales", path: "/materiales", icon: Package, module: "materiales" },
  { label: "Evidencia", path: "/evidencia", icon: Images, module: "evidencia" },
  { label: "Rótulos", path: "/rotulos", icon: Tag, module: "rotulos" },
  { label: "Plantillas", path: "/plantillas", icon: ClipboardList, module: "plantillas" },
  { label: "Configuración", path: "/configuracion", icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  const location = useLocation();
  const { projects, activeProject, activeProjectId, setActiveProjectId, hasProjects } = useProject();
  const terms = useTerms();
  const items = navItems.filter((it) => !it.module || !isModuleHidden(activeProject, it.module));

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:z-auto`}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Network className="w-4 h-4 text-white" />
            </div>
            <span className="font-heading font-bold text-lg tracking-tight">NetTrack</span>
          </div>
          <div className="flex items-center gap-1">
            <UndoButton />
            <ThemeToggle />
            <button className="lg:hidden p-1" onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active project switcher */}
        <div className="px-3 pt-3">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Proyecto</label>
          {hasProjects ? (
            <Select value={activeProjectId || ""} onValueChange={setActiveProjectId}>
              <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Seleccionar proyecto" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Link to="/proyectos" onClick={onClose} className="mt-1 flex items-center justify-center gap-1.5 h-9 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground">
              <FolderKanban className="w-3.5 h-3.5" /> Crear proyecto
            </Link>
          )}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <item.icon className="w-4.5 h-4.5" />
                {item.termKey ? terms[item.termKey] : item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}