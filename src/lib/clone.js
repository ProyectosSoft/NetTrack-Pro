import { db } from "@/api/db";

// Progress fields cleared when cloning, so a duplicated floor/space starts as
// fresh work (the identity — name, type, order, description — is kept).
const RESET = {
  status: "pendiente",
  act_perforacion: false, act_pesca_cable: false, act_ponchado: false,
  ponchado_type: "na",
  acc_face_plate: false, acc_tapa_face_plate: false, acc_tornillos: false,
  acc_patch_cord: false, acc_rotulo: false, acc_protector: false,
  equipo_instalado: false, equipo_configurado: false, equipo_probado: false,
  funcionando: false, identificado_rack: false, ponchado_rack: false,
  custom_checks: {}, custom_fields: {},
  puerto_patch_panel: "", puerto_switch: "", vlan: "",
  observaciones: "", evidencia: [],
  plan_x: null, plan_y: null,
};

function freshPoint(src, floor_id, space_id) {
  return {
    name: src.name,
    device_type: src.device_type,
    order: src.order ?? 0,
    description: src.description || "",
    floor_id,
    space_id,
    ...RESET,
  };
}

// Clone a space (within its floor) plus its points, with progress reset. Returns
// the ids of everything created so the operation can be undone.
export async function cloneSpace(space, points) {
  const created = await db.entities.Space.create({
    name: `${space.name} (copia)`,
    floor_id: space.floor_id,
    space_type: space.space_type || "habitacion",
    order: space.order ?? 0,
  });
  const own = points.filter((p) => p.space_id === space.id);
  const pointIds = [];
  for (const p of own) {
    const np = await db.entities.InstallationPoint.create(freshPoint(p, space.floor_id, created.id));
    pointIds.push(np.id);
  }
  return { points: own.length, spaceId: created.id, pointIds };
}

// Fields reset when a space's checklist template (device type) is changed. Only
// progress state is cleared — status, every checklist item and the network/port
// fields go back to pendiente/empty. The point's identity, description,
// observations, evidence photos and floor-plan pin are intentionally kept.
export const CHECKLIST_RESET = {
  status: "pendiente",
  act_perforacion: false, act_pesca_cable: false, act_ponchado: false,
  ponchado_type: "na",
  acc_face_plate: false, acc_tapa_face_plate: false, acc_tornillos: false,
  acc_patch_cord: false, acc_rotulo: false, acc_protector: false,
  equipo_instalado: false, equipo_configurado: false, equipo_probado: false,
  funcionando: false, identificado_rack: false, ponchado_rack: false,
  custom_checks: {},
  puerto_patch_panel: "", puerto_switch: "", vlan: "",
};

// Change the checklist template (device type) of every point in a space, resetting
// each point's checklist progress to pendiente (the new template has different
// items). Returns how many points were changed.
export async function changeSpaceTemplate(spacePoints, deviceType) {
  for (const p of spacePoints) {
    await db.entities.InstallationPoint.update(p.id, { device_type: deviceType, ...CHECKLIST_RESET });
  }
  return { points: spacePoints.length };
}

// Clone a floor with all its spaces and points, with progress reset.
export async function cloneFloor(floor, spaces, points, order) {
  const newFloor = await db.entities.Floor.create({
    name: `${floor.name} (copia)`,
    project_id: floor.project_id,
    order,
    width: floor.width ?? null,
    length: floor.length ?? null,
    plan_url: floor.plan_url || "",
  });
  const floorSpaces = spaces.filter((s) => s.floor_id === floor.id);
  const spaceIds = [];
  const pointIds = [];
  for (const s of floorSpaces) {
    const newSpace = await db.entities.Space.create({
      name: s.name,
      floor_id: newFloor.id,
      space_type: s.space_type || "habitacion",
      order: s.order ?? 0,
    });
    spaceIds.push(newSpace.id);
    for (const p of points.filter((pt) => pt.space_id === s.id)) {
      const np = await db.entities.InstallationPoint.create(freshPoint(p, newFloor.id, newSpace.id));
      pointIds.push(np.id);
    }
  }
  return { spaces: floorSpaces.length, points: pointIds.length, floorId: newFloor.id, spaceIds, pointIds };
}

// Delete a set of created records (used to undo a clone or bulk create).
export async function deleteCreated({ floorId, spaceIds = [], pointIds = [] }) {
  for (const id of pointIds) await db.entities.InstallationPoint.delete(id);
  for (const id of spaceIds) await db.entities.Space.delete(id);
  if (floorId) await db.entities.Floor.delete(floorId);
}
