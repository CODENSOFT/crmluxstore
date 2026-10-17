import { db } from "./db";
import { DEFAULT_DELIVERY_METHODS } from "./constants";

// Setarile globale: un singur rand JSONB, completat cu valorile implicite
export const SETTINGS_DEFAULTS = {
  companyName: "Lux Store",
  legalName: "",
  idno: "",
  vatCode: "",
  iban: "",
  bank: "",
  bankCode: "",
  address: "mun. Chișinău, str. Lunca Bîcului 23",
  phone: "+373 678 19 777",
  email: "",
  website: "https://luxstore.md",
  currency: "MDL",
  vatPayer: true,
  vatRate: 20,
  pricesIncludeVat: true,
  requireApproval: true,
  lowStockThreshold: 5,
  defaultWarehouse: null,
  deliveryMethods: DEFAULT_DELIVERY_METHODS,
  invoiceTerms: "Marfa a fost recepționată fără obiecții privind cantitatea și calitatea.",
  publicUrl: "",
  woo: {
    enabled: false,
    url: "",
    consumerKey: "",
    consumerSecret: "",
    webhookSecret: "",
    importOrders: true,
    pushStock: false,
    pushOrderStatus: false,
    warehouse: null,
    lastOrderSyncAt: null,
    lastProductImportAt: null,
    lastStockPushAt: null,
  },
};

function merge(data = {}, updatedAt) {
  return {
    ...SETTINGS_DEFAULTS,
    ...data,
    woo: { ...SETTINGS_DEFAULTS.woo, ...(data.woo || {}) },
    _id: 1,
    updatedAt,
  };
}

// Cache scurt in memorie (setarile se citesc la aproape fiecare cerere)
let cache = { at: 0, doc: null };
const TTL = 30_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache.doc && Date.now() - cache.at < TTL) return cache.doc;
  const [row] = await db()`select data, updated_at from settings where id = 1`;
  const doc = merge(row?.data, row?.updatedAt);
  cache = { at: Date.now(), doc };
  return doc;
}

/** Salveaza modificari (patch superficial; `woo` se combina separat). Intoarce setarile complete. */
export async function updateSettings(patch) {
  const current = await getSettings({ fresh: true });
  const { _id, updatedAt, ...base } = current;
  const next = { ...base, ...patch, woo: { ...base.woo, ...(patch.woo || {}) } };
  const [row] = await db()`
    insert into settings (id, data) values (1, ${db().json(next)})
    on conflict (id) do update set data = excluded.data
    returning data, updated_at`;
  invalidateSettings();
  return merge(row.data, row.updatedAt);
}

export function invalidateSettings() {
  cache = { at: 0, doc: null };
}

export function lowStockLimit(product, settings) {
  return product?.minStock != null ? product.minStock : settings?.lowStockThreshold ?? 5;
}
