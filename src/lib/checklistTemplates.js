import { db } from "@/api/db";

// Static defaults (used as fallback before DB loads)
export const DEFAULT_TEMPLATES = {
  ethernet: {
    label: "Ethernet",
    activities: ["act_perforacion", "act_pesca_cable", "act_ponchado"],
    showPonchadoType: true,
    accessories: ["acc_face_plate", "acc_tapa_face_plate", "acc_tornillos", "acc_patch_cord", "acc_rotulo", "acc_protector"],
    equipment: ["identificado_rack", "ponchado_rack", "funcionando"],
    showNetwork: true,
    customChecks: [],
  },
  camara: {
    label: "Cámara CCTV",
    activities: ["act_perforacion", "act_pesca_cable", "act_ponchado"],
    showPonchadoType: true,
    accessories: ["acc_tornillos", "acc_rotulo"],
    equipment: ["equipo_instalado", "equipo_configurado", "equipo_probado", "funcionando", "identificado_rack", "ponchado_rack"],
    showNetwork: true,
    customChecks: [],
  },
  access_point: {
    label: "Access Point WiFi",
    activities: ["act_perforacion", "act_pesca_cable", "act_ponchado"],
    showPonchadoType: true,
    accessories: ["acc_tornillos", "acc_rotulo"],
    equipment: ["equipo_instalado", "equipo_configurado", "equipo_probado", "funcionando", "identificado_rack", "ponchado_rack"],
    showNetwork: true,
    customChecks: [],
  },
};

export const FIELD_LABELS = {
  act_perforacion: "Perforación",
  act_pesca_cable: "Pesca del cable",
  act_ponchado: "Ponchado",
  acc_face_plate: "Face Plate",
  acc_tapa_face_plate: "Tapa Face Plate",
  acc_tornillos: "Tornillos",
  acc_patch_cord: "Patch Cord",
  acc_rotulo: "Rótulo",
  acc_protector: "Protector",
  equipo_instalado: "Equipo instalado",
  equipo_configurado: "Equipo configurado",
  equipo_probado: "Equipo probado",
  funcionando: "Funcionando correctamente",
  identificado_rack: "Identificado en rack",
  ponchado_rack: "Ponchado en rack",
};

export const ALL_FIELDS = {
  activities: ["act_perforacion", "act_pesca_cable", "act_ponchado"],
  accessories: ["acc_face_plate", "acc_tapa_face_plate", "acc_tornillos", "acc_patch_cord", "acc_rotulo", "acc_protector"],
  equipment: ["equipo_instalado", "equipo_configurado", "equipo_probado", "funcionando", "identificado_rack", "ponchado_rack"],
};

// In-memory cache — updated when templates load from DB
let dbTemplates = null;

export function setCachedTemplates(templates) {
  dbTemplates = {};
  for (const t of templates) {
    dbTemplates[t.device_type] = {
      label: t.name,
      activities: t.activities || [],
      showPonchadoType: t.show_ponchado_type ?? false,
      accessories: t.accessories || [],
      equipment: t.equipment || [],
      showNetwork: t.show_network ?? true,
      customChecks: (t.custom_checks || []).filter((c) => c.enabled !== false),
    };
  }
}

export async function loadTemplatesFromDB() {
  try {
    const templates = await db.entities.ChecklistTemplate.list("-created_date", 50);
    if (templates && templates.length > 0) {
      setCachedTemplates(templates);
    }
  } catch (e) {
    // fall back to static defaults
    console.warn("No se pudieron cargar las plantillas desde la BD; usando defaults estáticos.", e);
  }
}

export function getTemplate(deviceType) {
  if (dbTemplates && dbTemplates[deviceType]) {
    return dbTemplates[deviceType];
  }
  return DEFAULT_TEMPLATES[deviceType] || DEFAULT_TEMPLATES.ethernet;
}