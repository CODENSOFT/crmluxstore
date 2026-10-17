import { publicBaseUrl } from "./publicUrl";

const mask = (v) => (v ? `${v.slice(0, 6)}••••••${v.slice(-4)}` : "");

// Configuratia site-ului pentru interfata (cheile sunt mascate)
export function wooView(s, req) {
  const w = s.woo || {};
  return {
    enabled: !!w.enabled,
    url: w.url || "",
    consumerKey: mask(w.consumerKey),
    consumerSecret: mask(w.consumerSecret),
    hasKeys: !!(w.consumerKey && w.consumerSecret),
    webhookSecret: w.webhookSecret || "",
    webhookUrl: `${publicBaseUrl(s, req)}/api/webhooks/woo`,
    importOrders: w.importOrders !== false,
    pushStock: !!w.pushStock,
    pushOrderStatus: !!w.pushOrderStatus,
    warehouse: w.warehouse || null,
    lastOrderSyncAt: w.lastOrderSyncAt || null,
    lastProductImportAt: w.lastProductImportAt || null,
    lastStockPushAt: w.lastStockPushAt || null,
  };
}

