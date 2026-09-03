import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/api/db";
import { setCachedTemplates } from "@/lib/checklistTemplates";

// Centralized query keys. Invalidating a prefix (e.g. ["points"]) also
// invalidates the derived keys below it (["points", "byFloor", id]).
export const qk = {
  projects: ["projects"],
  floors: ["floors"],
  spaces: ["spaces"],
  points: ["points"],
  templates: ["templates"],
  floor: (id) => ["floor", id],
  space: (id) => ["space", id],
  point: (id) => ["point", id],
  spacesByFloor: (floorId) => ["spaces", "byFloor", floorId],
  pointsByFloor: (floorId) => ["points", "byFloor", floorId],
};

// --- List queries ---
export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => db.entities.ProjectInfo.list("-created_date", 200) });
}

export function useFloors() {
  return useQuery({ queryKey: qk.floors, queryFn: () => db.entities.Floor.list("order", 100) });
}

export function useSpaces() {
  return useQuery({ queryKey: qk.spaces, queryFn: () => db.entities.Space.list("-created_date", 500) });
}

export function usePoints() {
  return useQuery({ queryKey: qk.points, queryFn: () => db.entities.InstallationPoint.list("-created_date", 500) });
}

export function useTechnicians() {
  return useQuery({ queryKey: ["technicians"], queryFn: () => db.entities.Technician.list("-created_date", 200) });
}

export function useLabelTemplates() {
  return useQuery({ queryKey: ["labelTemplates"], queryFn: () => db.entities.LabelTemplate.list("-created_date", 100) });
}

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates,
    queryFn: async () => {
      const t = await db.entities.ChecklistTemplate.list("-created_date", 50);
      setCachedTemplates(t); // keep the in-memory template cache in sync
      return t;
    },
  });
}

// --- Single-record / scoped queries ---
export function useFloor(id) {
  return useQuery({ queryKey: qk.floor(id), queryFn: () => db.entities.Floor.get(id), enabled: !!id });
}

export function useSpace(id) {
  return useQuery({ queryKey: qk.space(id), queryFn: () => db.entities.Space.get(id), enabled: !!id });
}

export function usePoint(id) {
  return useQuery({ queryKey: qk.point(id), queryFn: () => db.entities.InstallationPoint.get(id), enabled: !!id });
}

export function useSpacesByFloor(floorId) {
  return useQuery({
    queryKey: qk.spacesByFloor(floorId),
    queryFn: () => db.entities.Space.filter({ floor_id: floorId }, "order", 500),
    enabled: !!floorId,
  });
}

export function usePointsByFloor(floorId) {
  return useQuery({
    queryKey: qk.pointsByFloor(floorId),
    queryFn: () => db.entities.InstallationPoint.filter({ floor_id: floorId }, "order", 500),
    enabled: !!floorId,
  });
}

// Invalidate every floor/space/point/template query (prefix match covers
// the scoped keys too). Returned function is stable enough for handlers.
export function useInvalidateData() {
  const qc = useQueryClient();
  return () => {
    for (const key of [["projects"], ["floors"], ["spaces"], ["points"], ["floor"], ["space"], ["point"], ["templates"], ["labelTemplates"], ["technicians"], ["users"]]) {
      qc.invalidateQueries({ queryKey: key });
    }
  };
}
