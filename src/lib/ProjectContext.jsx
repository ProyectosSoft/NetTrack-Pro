import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/api/db";
import { useProjects, useFloors, useSpaces, usePoints, useInvalidateData } from "@/lib/queries";
import { applyBrandColor, resolveTerms } from "@/lib/branding";

const ProjectContext = createContext(null);
const STORAGE_KEY = "nettrack.activeProjectId";

function readStored() {
  try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
}

export function ProjectProvider({ children }) {
  const projectsQ = useProjects();
  const floorsQ = useFloors();
  const invalidate = useInvalidateData();
  const projects = projectsQ.data ?? [];
  const floors = floorsQ.data ?? [];
  const [activeProjectId, setActiveIdState] = useState(readStored);
  const migratingRef = useRef(false);

  const setActiveProjectId = useCallback((id) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* localStorage unavailable — keep in-memory only */ }
  }, []);

  // Keep the active project valid once projects load.
  useEffect(() => {
    if (projectsQ.isLoading) return;
    if (projects.length === 0) {
      if (activeProjectId) setActiveProjectId(null);
      return;
    }
    if (!projects.some((p) => p.id === activeProjectId)) {
      setActiveProjectId(projects[0].id);
    }
  }, [projectsQ.isLoading, projects, activeProjectId, setActiveProjectId]);

  // One-time migration: pre-multi-project installs have floors without a
  // project_id. Assign them to the first project (creating a default one if
  // none exists) so nothing is orphaned.
  useEffect(() => {
    if (migratingRef.current) return;
    if (projectsQ.isLoading || floorsQ.isLoading) return;
    const orphans = floors.filter((f) => !f.project_id);
    if (orphans.length === 0) return;

    migratingRef.current = true;
    (async () => {
      try {
        let targetId = projects[0]?.id;
        if (!targetId) {
          const created = await db.entities.ProjectInfo.create({ project_name: "Proyecto principal", status: "activo" });
          targetId = created.id;
        }
        for (const f of orphans) {
          await db.entities.Floor.update(f.id, { project_id: targetId });
        }
        setActiveProjectId(targetId);
        invalidate();
      } catch (e) {
        console.error("No se pudieron migrar los pisos existentes:", e);
        migratingRef.current = false; // allow a retry on next load
      }
    })();
  }, [projectsQ.isLoading, floorsQ.isLoading, floors, projects, invalidate, setActiveProjectId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || null,
    [projects, activeProjectId]
  );

  // Apply the active project's brand color to the app's CSS variables.
  useEffect(() => {
    applyBrandColor(activeProject?.primary_color);
  }, [activeProject?.primary_color]);

  const value = useMemo(() => ({
    projects,
    activeProjectId,
    activeProject,
    setActiveProjectId,
    isLoading: projectsQ.isLoading,
    hasProjects: projects.length > 0,
  }), [projects, activeProjectId, activeProject, setActiveProjectId, projectsQ.isLoading]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}

// Resolved terminology (defaults merged with the active project's overrides).
export function useTerms() {
  const { activeProject } = useProject();
  return useMemo(() => resolveTerms(activeProject), [activeProject]);
}

// Floors/spaces/points scoped to the active project. Floors carry project_id;
// spaces and points inherit it through their floor.
export function useScopedData() {
  const { activeProjectId } = useProject();
  const floorsQ = useFloors();
  const spacesQ = useSpaces();
  const pointsQ = usePoints();

  const floors = useMemo(
    () => (floorsQ.data ?? []).filter((f) => f.project_id === activeProjectId),
    [floorsQ.data, activeProjectId]
  );
  const floorIds = useMemo(() => new Set(floors.map((f) => f.id)), [floors]);
  const spaces = useMemo(
    () => (spacesQ.data ?? []).filter((s) => floorIds.has(s.floor_id)),
    [spacesQ.data, floorIds]
  );
  const points = useMemo(
    () => (pointsQ.data ?? []).filter((p) => floorIds.has(p.floor_id)),
    [pointsQ.data, floorIds]
  );

  return {
    floors,
    spaces,
    points,
    isLoading: floorsQ.isLoading || spacesQ.isLoading || pointsQ.isLoading,
    isError: floorsQ.isError || spacesQ.isError || pointsQ.isError,
  };
}
