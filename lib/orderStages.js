// Stadiile (pipeline-ul) unei comenzi — sursa unica de adevar (server + client).
// Cheile raman compatibile cu datele existente; etichetele sunt pentru un magazin.

export const ORDER_STAGES = [
  { key: "new", label: "Nouă", short: "Nouă", tone: "neutral" },
  { key: "pending_approval", label: "Așteaptă aprobare", short: "La aprobare", tone: "warn" },
  { key: "processing", label: "În pregătire", short: "În pregătire", tone: "info" },
  { key: "ready", label: "Gata de livrare", short: "Gata", tone: "accent" },
  { key: "invoicing", label: "Livrare & facturare", short: "Livrare", tone: "violet" },
  { key: "completed", label: "Finalizată", short: "Finalizată", tone: "ok" },
];

export const REJECTED_STAGE = { key: "rejected", label: "Respinsă", short: "Respinsă", tone: "bad" };
export const CANCELLED_STAGE = { key: "cancelled", label: "Anulată", short: "Anulată", tone: "bad" };

export const STAGE_KEYS = [
  ...ORDER_STAGES.map((s) => s.key),
  REJECTED_STAGE.key,
  CANCELLED_STAGE.key,
];

// Stadii in care stocul este consumat (dupa aprobare)
export const ACTIVE_STAGE_KEYS = ["processing", "ready", "invoicing", "completed"];
// Comenzi "deschise" (in lucru)
export const OPEN_STAGE_KEYS = ["new", "pending_approval", "processing", "ready", "invoicing"];
// Stadii finale
export const CLOSED_STAGE_KEYS = ["completed", "rejected", "cancelled"];
// Comenzi care conteaza la vanzari
export const SALE_STAGE_KEYS = ACTIVE_STAGE_KEYS;

const LEGACY = { pending: "pending_approval", approved: "processing" };

export function normalizeStage(key) {
  return LEGACY[key] || key;
}

export function stageInfo(key) {
  key = normalizeStage(key);
  return (
    ORDER_STAGES.find((s) => s.key === key) ||
    (key === "rejected" ? REJECTED_STAGE : null) ||
    (key === "cancelled" ? CANCELLED_STAGE : null) || {
      key,
      label: key,
      short: key,
      tone: "neutral",
    }
  );
}

export function stageIndex(key) {
  return ORDER_STAGES.findIndex((s) => s.key === normalizeStage(key));
}

export function nextStage(key) {
  const k = normalizeStage(key);
  if (k === "new" || k === "pending_approval") return "processing";
  const i = stageIndex(k);
  if (i < 0 || i >= ORDER_STAGES.length - 1) return null;
  return ORDER_STAGES[i + 1].key;
}

export function prevStage(key) {
  const i = stageIndex(key);
  if (i <= 2) return null; // nu se revine inainte de "in pregatire"
  return ORDER_STAGES[i - 1].key;
}

export function stageConsumesStock(key) {
  return ACTIVE_STAGE_KEYS.includes(normalizeStage(key));
}

export function isClosed(key) {
  return CLOSED_STAGE_KEYS.includes(normalizeStage(key));
}
