// Stadiile (pipeline-ul) unei comenzi — sursa unica de adevar (server + client)

export const ORDER_STAGES = [
  { key: "new", label: "Nou creat", short: "Nou", color: "slate" },
  {
    key: "pending_approval",
    label: "In asteptare de aprobare",
    short: "Asteapta aprobare",
    color: "yellow",
  },
  { key: "processing", label: "In procesare", short: "In procesare", color: "sky" },
  { key: "ready", label: "Gata", short: "Gata", color: "blue" },
  {
    key: "invoicing",
    label: "Emiterea facturii",
    short: "Facturare",
    color: "violet",
  },
  { key: "completed", label: "Complet", short: "Complet", color: "green" },
];

export const REJECTED_STAGE = {
  key: "rejected",
  label: "Respinsa",
  short: "Respinsa",
  color: "red",
};

// Toate cheile valide (pentru enum-ul din model)
export const STAGE_KEYS = [...ORDER_STAGES.map((s) => s.key), REJECTED_STAGE.key];

// Cheile care fac parte din pipeline-ul de lucru (dupa aprobare)
export const ACTIVE_STAGE_KEYS = ["processing", "ready", "invoicing", "completed"];

// Compatibilitate cu statusurile vechi (inainte de pipeline-ul de stadii)
const LEGACY = {
  pending: "pending_approval",
  approved: "processing",
};

export function normalizeStage(key) {
  return LEGACY[key] || key;
}

export function stageInfo(key) {
  key = normalizeStage(key);
  return (
    ORDER_STAGES.find((s) => s.key === key) ||
    (key === "rejected" ? REJECTED_STAGE : null) || {
      key,
      label: key,
      short: key,
      color: "slate",
    }
  );
}

export function stageIndex(key) {
  return ORDER_STAGES.findIndex((s) => s.key === normalizeStage(key));
}

// Urmatorul stadiu din pipeline (sau null daca e ultimul / respins)
export function nextStage(key) {
  const i = stageIndex(key);
  if (i < 0 || i >= ORDER_STAGES.length - 1) return null;
  return ORDER_STAGES[i + 1].key;
}

export function prevStage(key) {
  const i = stageIndex(key);
  if (i <= 0) return null;
  return ORDER_STAGES[i - 1].key;
}

// Stocul se scade cand comanda intra in procesare (sau mai departe)
export function stageConsumesStock(key) {
  return ACTIVE_STAGE_KEYS.includes(key);
}
