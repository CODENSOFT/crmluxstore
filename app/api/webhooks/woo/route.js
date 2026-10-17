import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { verifyWooSignature, importWooOrder } from "@/lib/woo";
import { logIntegration } from "@/lib/integrationLog";
import { notifyIntegrationError } from "@/lib/notify";

export const maxDuration = 60;

// Receptor pentru webhook-urile trimise de site-ul WooCommerce (comenzi noi / modificate).
// Securitate: semnatura HMAC-SHA256 (antet X-WC-Webhook-Signature) cu secretul din CRM.
export async function POST(req) {
  const raw = await req.text();
  // La crearea webhook-ului, WooCommerce trimite un "ping" (webhook_id=...) — raspundem 200
  if (!raw || raw.startsWith("webhook_id=")) return Response.json({ ok: true, ping: true });

  await connectDB();
  const s = await getSettings();
  if (!s.woo?.enabled || !s.woo?.importOrders) {
    return Response.json({ ok: true, ignored: "integrare dezactivată" });
  }
  const signature = req.headers.get("x-wc-webhook-signature");
  if (!verifyWooSignature(raw, signature, s.woo.webhookSecret)) {
    await logIntegration({ source: "woo", direction: "in", action: "webhook", status: "error", message: "Semnătură invalidă — verificați secretul webhook-ului pe site" });
    return Response.json({ ok: false, error: "Semnătură invalidă" }, { status: 401 });
  }

  const topic = req.headers.get("x-wc-webhook-topic") || "";
  if (!topic.startsWith("order.")) return Response.json({ ok: true, ignored: topic });
  let wo;
  try {
    wo = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "JSON invalid" }, { status: 400 });
  }
  if (topic === "order.deleted" || !wo?.id) return Response.json({ ok: true, ignored: topic });

  const started = Date.now();
  try {
    const r = await importWooOrder(wo, s);
    await logIntegration({
      source: "woo",
      direction: "in",
      action: topic,
      ref: r.order?.number || `#${wo.number || wo.id}`,
      message: `Comanda site #${wo.number || wo.id}: ${{ created: "importată", cancelled: "anulată", paid: "plată confirmată", unchanged: "fără modificări", skipped: "ignorată" }[r.result] || r.result}`,
      durationMs: Date.now() - started,
    });
    return Response.json({ ok: true, result: r.result, order: r.order?.number || null });
  } catch (e) {
    await logIntegration({ source: "woo", direction: "in", action: topic, status: "error", ref: `#${wo.number || wo.id}`, message: e.message });
    await notifyIntegrationError(`Comanda de pe site #${wo.number || wo.id} nu a putut fi importată`, e.message).catch(() => {});
    // 500 -> WooCommerce reincearca automat livrarea webhook-ului
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
