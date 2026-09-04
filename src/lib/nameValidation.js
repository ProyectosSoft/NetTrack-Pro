// Duplicate-name checks used when creating or renaming.
// Scope: floors are unique within a project, spaces within a floor, points within
// a space (so duplicating a space/floor — which reuses names in a new parent —
// keeps working). Comparison is trimmed and case-insensitive.

const norm = (s) => (s || "").trim().toLocaleLowerCase();

export function floorNameExists(floors, projectId, name, exceptId = null) {
  const n = norm(name);
  return floors.some((f) => f.project_id === projectId && f.id !== exceptId && norm(f.name) === n);
}

export function spaceNameExists(spaces, floorId, name, exceptId = null) {
  const n = norm(name);
  return spaces.some((s) => s.floor_id === floorId && s.id !== exceptId && norm(s.name) === n);
}

export function pointNameExists(points, spaceId, name, exceptId = null) {
  const n = norm(name);
  return points.some((p) => p.space_id === spaceId && p.id !== exceptId && norm(p.name) === n);
}
