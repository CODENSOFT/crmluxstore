// Constante comune (server + client) — sursa unica de adevar pentru etichete.

export const UNITS = ["bucata", "litri", "kg", "metru", "set", "pachet", "pereche"];

export const UNIT_LABELS = {
  bucata: "buc.",
  litri: "l",
  kg: "kg",
  metru: "m",
  set: "set",
  pachet: "pach.",
  pereche: "per.",
};

export const UNIT_NAMES = {
  bucata: "Bucată",
  litri: "Litri",
  kg: "Kilogram",
  metru: "Metru",
  set: "Set",
  pachet: "Pachet",
  pereche: "Pereche",
};

// Canale de vanzare
export const CHANNELS = [
  { key: "store", label: "Magazin" },
  { key: "phone", label: "Telefon" },
  { key: "site", label: "Site luxstore.md" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "b2b", label: "B2B / contract" },
  { key: "api", label: "API extern" },
  { key: "1c", label: "1C" },
];
export const CHANNEL_KEYS = CHANNELS.map((c) => c.key);
export const channelLabel = (k) => CHANNELS.find((c) => c.key === k)?.label || k || "—";

// Metode de livrare implicite (editabile din Setari)
export const DEFAULT_DELIVERY_METHODS = [
  { key: "pickup", label: "Ridicare din magazin", cost: 0, active: true },
  { key: "courier_chisinau", label: "Curier Chișinău (2–3 zile)", cost: 150, active: true },
  { key: "courier_moldova", label: "Curier toată Moldova (3–4 zile)", cost: 250, active: true },
  { key: "own_transport", label: "Transport propriu", cost: 0, active: true },
];

export const PAYMENT_METHODS = [
  { key: "cash", label: "Numerar" },
  { key: "card", label: "Card bancar" },
  { key: "transfer", label: "Transfer bancar" },
  { key: "cod", label: "Ramburs la livrare" },
  { key: "online", label: "Plată online" },
];
export const PAYMENT_METHOD_KEYS = PAYMENT_METHODS.map((p) => p.key);
export const paymentMethodLabel = (k) =>
  PAYMENT_METHODS.find((p) => p.key === k)?.label || k || "—";

export const PAYMENT_STATUS = {
  unpaid: { label: "Neachitată", tone: "bad" },
  partial: { label: "Achitată parțial", tone: "warn" },
  paid: { label: "Achitată", tone: "ok" },
};

// Segmente de clienti — specifice afacerii Lux Store
export const CUSTOMER_SEGMENTS = [
  { key: "retail", label: "Persoană fizică" },
  { key: "carwash", label: "Spălătorie self-service" },
  { key: "detailing", label: "Studio detailing" },
  { key: "service", label: "Service / spălătorie clasică" },
  { key: "dealer", label: "Revânzător" },
  { key: "fleet", label: "Flotă / companie" },
  { key: "other", label: "Altul" },
];
export const CUSTOMER_SEGMENT_KEYS = CUSTOMER_SEGMENTS.map((s) => s.key);
export const segmentLabel = (k) =>
  CUSTOMER_SEGMENTS.find((s) => s.key === k)?.label || k || "—";

export const CUSTOMER_SOURCES = [
  { key: "store", label: "Magazin" },
  { key: "site", label: "Site" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "recommendation", label: "Recomandare" },
  { key: "luxwash", label: "Lux Wash (proiect spălătorie)" },
  { key: "other", label: "Altă sursă" },
];
export const sourceLabel = (k) =>
  CUSTOMER_SOURCES.find((s) => s.key === k)?.label || k || "—";

export const PRICE_TYPES = [
  { key: "retail", label: "Preț cu amănuntul" },
  { key: "wholesale", label: "Preț angro" },
];

// Motive de anulare (casare) a stocului
export const WRITEOFF_REASONS = [
  { key: "expired", label: "Expirat" },
  { key: "damaged", label: "Deteriorat / ambalaj spart" },
  { key: "defect", label: "Defect de fabricație" },
  { key: "internal", label: "Consum intern" },
  { key: "sample", label: "Mostre / testare" },
  { key: "lost", label: "Lipsă / pierdut" },
  { key: "other", label: "Alt motiv" },
];
export const writeoffReasonLabel = (k) =>
  WRITEOFF_REASONS.find((r) => r.key === k)?.label || k || "—";

export const WAREHOUSE_TYPES = [
  { key: "warehouse", label: "Depozit" },
  { key: "store", label: "Magazin" },
  { key: "vehicle", label: "Mașină / livrare" },
];

// Tipuri de miscari de stoc (registrul de stoc)
export const MOVEMENT_TYPES = {
  initial: { label: "Stoc inițial", tone: "neutral" },
  arrival: { label: "Recepție", tone: "ok" },
  sale: { label: "Vânzare", tone: "info" },
  sale_return: { label: "Retur vânzare", tone: "warn" },
  transfer_out: { label: "Transfer ieșire", tone: "neutral" },
  transfer_in: { label: "Transfer intrare", tone: "neutral" },
  writeoff: { label: "Casare", tone: "bad" },
  inventory: { label: "Inventariere", tone: "warn" },
  adjustment: { label: "Corecție manuală", tone: "warn" },
  sync: { label: "Sincronizare 1C / API", tone: "info" },
};

export const TASK_STATUS = [
  { key: "todo", label: "De făcut" },
  { key: "in_progress", label: "În lucru" },
  { key: "done", label: "Finalizată" },
];
export const TASK_PRIORITY = [
  { key: "low", label: "Scăzută", tone: "neutral" },
  { key: "normal", label: "Normală", tone: "info" },
  { key: "high", label: "Urgentă", tone: "bad" },
];

export const ROLES = [
  { key: "admin", label: "Administrator" },
  { key: "manager", label: "Manager" },
];
export const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label || k;

// Evenimente disponibile pentru webhook-uri de iesire
export const WEBHOOK_EVENTS = [
  { key: "order.created", label: "Comandă creată" },
  { key: "order.updated", label: "Comandă modificată" },
  { key: "order.status_changed", label: "Status comandă schimbat" },
  { key: "order.payment_added", label: "Plată înregistrată" },
  { key: "order.deleted", label: "Comandă ștearsă" },
  { key: "product.created", label: "Produs creat" },
  { key: "product.updated", label: "Produs modificat" },
  { key: "product.deleted", label: "Produs șters" },
  { key: "stock.changed", label: "Stoc modificat" },
  { key: "customer.created", label: "Client creat" },
  { key: "customer.updated", label: "Client modificat" },
  { key: "arrival.created", label: "Recepție înregistrată" },
  { key: "transfer.created", label: "Transfer înregistrat" },
  { key: "writeoff.created", label: "Casare înregistrată" },
  { key: "inventory.completed", label: "Inventariere finalizată" },
  { key: "task.created", label: "Sarcină creată" },
];

// Categorii implicite (structura magazinului luxstore.md)
export const DEFAULT_CATEGORIES = [
  "Chimie auto",
  "Spumă activă & detergenți",
  "Detailing & polish",
  "Parfumuri auto",
  "Echipamente spălătorii",
  "Piese pentru echipamente",
  "Pistoale, duze & accesorii",
  "Furtunuri & conexiuni",
  "Pompe & motoare",
  "Diverse",
];
