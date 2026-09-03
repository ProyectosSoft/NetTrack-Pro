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

// Clone a space (within its floor) plus its points, with progress reset.
export async function cloneSpace(space, points) {
  const created = await db.entities.Space.create({
    name: `${space.name} (copia)`,
    floor_id: space.floor_id,
    space_type: space.space_type || "habitacion",
    order: space.order ?? 0,
  });
  const own = points.filter((p) => p.space_id === space.id);
  for (const p of own) {
    await db.entities.InstallationPoint.create(freshPoint(p, space.floor_id, created.id));
  }
  return { points: own.length };
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
  let count = 0;
  for (const s of floorSpaces) {
    const newSpace = await db.entities.Space.create({
      name: s.name,
      floor_id: newFloor.id,
      space_type: s.space_type || "habitacion",
      order: s.order ?? 0,
    });
    for (const p of points.filter((pt) => pt.space_id === s.id)) {
      await db.entities.InstallationPoint.create(freshPoint(p, newFloor.id, newSpace.id));
      count += 1;
    }
  }
  return { spaces: floorSpaces.length, points: count };
}
