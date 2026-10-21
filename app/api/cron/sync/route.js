import { connectDB, db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { wooReady, syncWooOrders, pushStockToWoo } from "@/lib/woo";
import { logIntegration } from "@/lib/integrationLog";

export const maxDuration = 300;

// Sincronizare periodica (Vercel Cron): plasa de siguranta pentru comenzile de pe site,
// publicarea completa a stocului si curatarea jurnalelor vechi. Protejat cu CRON_SECRET (Authorization: Bearer).
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
  // Retentie: jurnalele tehnice nu cresc la nesfarsit (plan gratuit Supabase = 500 MB)
  const sql = db();
  const purged = await Promise.all([
    sql`delete from audit_logs where created_at < now() - interval '180 days'`,
    sql`delete from notifications where read and created_at < now() - interval '90 days'`,
    sql`delete from webhook_deliveries where created_at < now() - interval '14 days'`,
    sql`delete from integration_logs where created_at < now() - interval '30 days'`,
    // fluxul de modificari pentru 1C: se pastreaza 60 de zile (1C confirma de obicei la cateva minute)
    sql`delete from change_log where at < now() - interval '60 days'`,
  ]).catch((e) => ({ error: e.message }));
  result.purged = Array.isArray(purged) ? purged.reduce((n, r) => n + r.count, 0) : purged;
  await logIntegration({ source: "cron", direction: "in", action: "cron.sync", message: JSON.stringify(result).slice(0, 500) });
  return Response.json({ ok: true, result });
}
