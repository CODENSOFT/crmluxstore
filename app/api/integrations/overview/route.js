import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { publicBaseUrl } from "@/lib/publicUrl";
import { wooConfigured } from "@/lib/woo";

// Rezumat pentru pagina Integrari
export const GET = route(
  async ({ req }) => {
    const sql = db();
    const s = await getSettings({ fresh: true });
    const [keys, [c], [last1c]] = await Promise.all([
      sql`select name, kind, last_used_at from api_keys where active`,
      sql`select
        (select count(*)::int from webhooks where active) as hooks,
        (select count(*)::int from orders where external_source = 'woo') as site_orders,
        (select count(*)::int from products where woo_id is not null) as woo_products,
        (select count(*)::int from orders where status in ('processing', 'ready', 'invoicing', 'completed')
           and (export1c->>'exportedAt') is null) as not_exported,
        (select count(*)::int from products where coalesce(external_id, '') <> '') as products_mapped,
        (select count(*)::int from products) as products_total,
        (select count(*)::int from customers where coalesce(external_id, '') <> '') as customers_mapped,
        (select count(*)::int from customers) as customers_total,
        (select count(*)::int from orders where channel = 'telegram') as telegram_orders,
        (select count(*)::int from telegram_chats) as telegram_chats,
        (select count(*)::int from products where coalesce(barcode, '') <> '') as products_barcode,
        (select count(*)::int from product_barcodes) as extra_barcodes,
        (select count(*)::int from scan_sessions) as scan_total,
        (select count(*)::int from scan_sessions where status in ('pending', 'error')) as scan_pending,
        (select max(created_at) from scan_sessions where source = 'scanner') as scan_last_at`,
      sql`select * from integration_logs where source = '1c' order by created_at desc limit 1`,
    ]);
    const key1c = keys.filter((k) => k.kind === "1c");
    const keyScan = keys.filter((k) => k.kind === "scanner");
    const lastUsed = (list) => list.reduce((m, k) => (k.lastUsedAt && (!m || k.lastUsedAt > m) ? k.lastUsedAt : m), null);
    return {
      baseUrl: publicBaseUrl(s, req),
      woo: {
        configured: wooConfigured(s),
        enabled: !!s.woo?.enabled,
        siteOrders: c.siteOrders,
        linkedProducts: c.wooProducts,
        lastOrderSyncAt: s.woo?.lastOrderSyncAt || null,
      },
      api: { activeKeys: keys.length, webhooks: c.hooks },
      telegram: { enabled: !!s.telegram?.enabled, botUsername: s.telegram?.botUsername || "", orders: c.telegramOrders, chats: c.telegramChats },
      onec: {
        keys: key1c.length,
        lastUsedAt: lastUsed(key1c),
        lastLog: last1c || null,
        notExported: c.notExported,
        productsMapped: c.productsMapped,
        productsTotal: c.productsTotal,
        customersMapped: c.customersMapped,
        customersTotal: c.customersTotal,
      },
      scanner: {
        keys: keyScan.length,
        lastUsedAt: lastUsed(keyScan),
        lastSessionAt: c.scanLastAt || null,
        sessions: c.scanTotal,
        pending: c.scanPending,
        productsBarcode: c.productsBarcode,
        productsTotal: c.productsTotal,
        extraBarcodes: c.extraBarcodes,
      },
    };
  },
  { auth: "owner" }
);
