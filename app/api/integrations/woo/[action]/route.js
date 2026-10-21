import { route, readJson, badRequest } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { wooConfigured, testWoo, syncWooOrders, importWooProducts, pushStockToWoo, ensureWooWebhooks } from "@/lib/woo";
import { publicBaseUrl } from "@/lib/publicUrl";
import { logIntegration } from "@/lib/integrationLog";

export const maxDuration = 300;

export const POST = route(
  async ({ req, params }) => {
    const s = await getSettings({ fresh: true });
    if (!wooConfigured(s)) throw badRequest("Completați adresa site-ului și cheile API WooCommerce, apoi salvați");
    const body = await readJson(req);
    try {
      switch (params.action) {
        case "test":
          return { ok: true, ...(await testWoo(s)) };
        case "sync-orders":
          return syncWooOrders({ days: Math.min(60, Math.max(1, Number(body.days) || 7)) });
        case "import-products":
          return importWooProducts({ importStock: !!body.importStock, warehouse: body.warehouse });
        case "push-stock":
          return pushStockToWoo();
        case "setup-webhooks": {
          const url = `${publicBaseUrl(s, req)}/api/webhooks/woo`;
          if (/localhost|127\.0\.0\.1/.test(url)) throw badRequest("Webhook-urile pot fi create doar de pe adresa publică a CRM-ului (nu localhost)");
          const result = await ensureWooWebhooks(s, url);
          await logIntegration({ source: "woo", direction: "out", action: "webhooks.setup", message: result.map((r) => `${r.topic}: ${r.status}`).join(", ") });
          return { webhooks: result, url };
        }
        default:
          throw badRequest("Acțiune necunoscută");
      }
    } catch (e) {
      if (e.status) throw e;
      await logIntegration({ source: "woo", direction: "out", action: params.action, status: "error", message: e.message });
      throw badRequest(e.message);
    }
  },
  { auth: "owner" }
);
