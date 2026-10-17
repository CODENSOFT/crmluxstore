import connectDB from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { wooReady, syncWooOrders, pushStockToWoo } from "@/lib/woo";
import { logIntegration } from "@/lib/integrationLog";

export const maxDuration = 300;

// Sincronizare periodica (Vercel Cron): plasa de siguranta pentru comenzile de pe site
// si publicarea completa a stocului. Protejat cu CRON_SECRET (Authorization: Bearer).
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const fromVercel = (req.headers.get("user-agent") || "").startsWith("vercel-cron");
  if (secret ? auth !== `Bearer ${secret}` : !fromVercel) {
    return Response.json({ ok: false, error: "Neautorizat" }, { status: 401 });
  }
  await connectDB();
  const s = await getSettings({ fresh: true });
  const result = {};
  if (wooReady(s)) {
    if (s.woo.importOrders) result.orders = await syncWooOrders({ days: 3 }).catch((e) => ({ error: e.message }));
    if (s.woo.pushStock) result.stock = await pushStockToWoo().catch((e) => ({ error: e.message }));
  }
  await logIntegration({ source: "cron", direction: "in", action: "cron.sync", message: JSON.stringify(result).slice(0, 500) });
  return Response.json({ ok: true, result });
}
