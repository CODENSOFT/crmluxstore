import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/settings";
import { generateSecret } from "@/lib/apiKeys";
import { wooView } from "@/lib/wooView";
import { logAudit } from "@/lib/audit";

export const GET = route(async ({ req }) => wooView(await getSettings({ fresh: true }), req), { auth: "admin" });

export const PUT = route(
  async ({ req, user }) => {
    const b = await readJson(req);
    const s = await getSettings({ fresh: true });
    const woo = {};
    if (b.url !== undefined) {
      const url = String(b.url).trim().replace(/\/+$/, "");
      if (url && !/^https?:\/\//.test(url)) throw badRequest("Adresa site-ului trebuie să înceapă cu https://");
      woo.url = url;
    }
    // cheile se trimit doar cand sunt schimbate (valorile mascate se ignora)
    if (b.consumerKey && !b.consumerKey.includes("•")) woo.consumerKey = b.consumerKey.trim();
    if (b.consumerSecret && !b.consumerSecret.includes("•")) woo.consumerSecret = b.consumerSecret.trim();
    for (const f of ["enabled", "importOrders", "pushStock", "pushOrderStatus"]) if (b[f] !== undefined) woo[f] = !!b[f];
    if (b.warehouse !== undefined) {
      if (b.warehouse) {
        const [w] = isUuid(String(b.warehouse)) ? await db()`select id from warehouses where id = ${b.warehouse}` : [];
        if (!w) throw badRequest("Depozit inexistent");
      }
      woo.warehouse = b.warehouse || null;
    }
    if (!s.woo.webhookSecret || b.regenerateSecret) woo.webhookSecret = generateSecret(20);
    const next = await updateSettings({ woo });
    await logAudit({ action: "settings_saved", category: "integration", user, details: "Configurare site WooCommerce" });
    return wooView(next, req);
  },
  { auth: "admin" }
);
