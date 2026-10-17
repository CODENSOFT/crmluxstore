import crypto from "node:crypto";
import { after } from "next/server";
import Webhook from "@/models/Webhook";
import WebhookDelivery from "@/models/WebhookDelivery";

// Ruleaza o sarcina dupa trimiterea raspunsului (nu blocheaza utilizatorul).
export function runAfter(task) {
  const run = () => Promise.resolve().then(task).catch((e) => console.error("[after]", e));
  try {
    after(run);
  } catch {
    run(); // in afara unei cereri (scripturi) — rulam direct
  }
}

export function sign(secret, body) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Emite un eveniment catre webhook-urile de iesire active.
 * `data` poate fi o functie (async) — se evalueaza doar daca exista abonati.
 */
export function emit(event, data) {
  runAfter(async () => {
    const hooks = await Webhook.find({
      active: true,
      $or: [{ events: "*" }, { events: event }],
    }).lean();
    if (!hooks.length) return;
    const resolved = typeof data === "function" ? await data() : data;
    const payload = {
      id: crypto.randomUUID(),
      event,
      createdAt: new Date().toISOString(),
      data: resolved,
    };
    const body = JSON.stringify(payload);
    await Promise.all(hooks.map((h) => deliver(h, event, body, payload.id)));
  });
}

// Trimite un singur eveniment (cu o reincercare la erori de retea / 5xx) si il jurnalizeaza
export async function deliver(hook, event, body, deliveryId) {
  const started = Date.now();
  let httpStatus = null;
  let error = null;
  let attempts = 0;
  for (attempts = 1; attempts <= 2; attempts++) {
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "LuxStore-CRM/2.0",
          "X-Lux-Event": event,
          "X-Lux-Delivery": deliveryId,
          "X-Lux-Signature": sign(hook.secret, body),
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      httpStatus = res.status;
      if (res.ok) {
        error = null;
        break;
      }
      error = `HTTP ${res.status}`;
      if (res.status < 500) break;
    } catch (e) {
      error = e?.name === "TimeoutError" ? "Timeout (8s)" : e?.message || "Eroare de rețea";
    }
    if (attempts < 2) await new Promise((r) => setTimeout(r, 800));
  }
  const status = error ? "failed" : "success";
  await Promise.all([
    WebhookDelivery.create({
      webhook: hook._id,
      event,
      deliveryId,
      status,
      httpStatus,
      error,
      durationMs: Date.now() - started,
      attempts: Math.min(attempts, 2),
      payloadPreview: body.slice(0, 2000),
    }),
    Webhook.updateOne(
      { _id: hook._id },
      error
        ? {
            $set: { lastStatus: status, lastHttpStatus: httpStatus, lastError: error, lastDeliveryAt: new Date() },
            $inc: { failures: 1 },
          }
        : {
            $set: { lastStatus: status, lastHttpStatus: httpStatus, lastError: null, lastDeliveryAt: new Date(), failures: 0 },
          }
    ),
  ]).catch(() => {});
  return { status, httpStatus, error };
}
