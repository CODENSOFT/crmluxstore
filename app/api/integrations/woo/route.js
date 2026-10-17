import Warehouse from "@/models/Warehouse";
import { route, readJson, badRequest } from "@/lib/api";
import { getSettingsDoc, invalidateSettings } from "@/lib/settings";
import { generateSecret } from "@/lib/apiKeys";
import { wooView } from "@/lib/wooView";
import { logAudit } from "@/lib/audit";

export const GET = route(async ({ req }) => wooView(await getSettingsDoc(), req), { auth: "admin" });

export const PUT = route(
  async ({ req, user }) => {
    const b = await readJson(req);
    const s = await getSettingsDoc();
    s.woo = s.woo || {};
    if (b.url !== undefined) {
      const url = String(b.url).trim().replace(/\/+$/, "");
      if (url && !/^https?:\/\//.test(url)) throw badRequest("Adresa site-ului trebuie să înceapă cu https://");
      s.woo.url = url;
    }
    // cheile se trimit doar cand sunt schimbate (valorile mascate se ignora)
    if (b.consumerKey && !b.consumerKey.includes("•")) s.woo.consumerKey = b.consumerKey.trim();
    if (b.consumerSecret && !b.consumerSecret.includes("•")) s.woo.consumerSecret = b.consumerSecret.trim();
    for (const f of ["enabled", "importOrders", "pushStock", "pushOrderStatus"]) if (b[f] !== undefined) s.woo[f] = !!b[f];
    if (b.warehouse !== undefined) {
      if (b.warehouse && !(await Warehouse.exists({ _id: b.warehouse }))) throw badRequest("Depozit inexistent");
      s.woo.warehouse = b.warehouse || undefined;
    }
    if (!s.woo.webhookSecret || b.regenerateSecret) s.woo.webhookSecret = generateSecret(20);
    s.markModified("woo");
    await s.save();
    invalidateSettings();
    await logAudit({ action: "settings_saved", category: "integration", user, details: "Configurare site WooCommerce" });
    return wooView(s, req);
  },
  { auth: "admin" }
);
