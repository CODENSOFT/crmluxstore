import Settings from "@/models/Settings";

// Setarile globale, cu cache scurt in memorie (se citesc la aproape fiecare cerere)
let cache = { at: 0, doc: null };
const TTL = 30_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.doc && Date.now() - cache.at < TTL) return cache.doc;
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  const doc = s.toObject();
  cache = { at: Date.now(), doc };
  return doc;
}

export async function getSettingsDoc() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

export function invalidateSettings() {
  cache = { at: 0, doc: null };
}

export function lowStockLimit(product, settings) {
  return product?.minStock != null ? product.minStock : settings?.lowStockThreshold ?? 5;
}
