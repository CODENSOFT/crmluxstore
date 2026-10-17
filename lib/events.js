import crypto from "node:crypto";
import { after } from "next/server";
import { db } from "./db";

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
    const hooks = await db()`select * from webhooks where active and (${"*"} = any(events) or ${event} = any(events))`;
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
  const sql = db();
  await Promise.all([
    sql`insert into webhook_deliveries ${sql({
      webhookId: hook._id,
      event,
      deliveryId,
      status,
      httpStatus,
      error,
      durationMs: Date.now() - started,
      attempts: Math.min(attempts, 2),
      payloadPreview: body.slice(0, 2000),
    })}`,
    error
      ? sql`update webhooks set last_status = ${status}, last_http_status = ${httpStatus}, last_error = ${error},
                 last_delivery_at = now(), failures = failures + 1 where id = ${hook._id}`
      : sql`update webhooks set last_status = ${status}, last_http_status = ${httpStatus}, last_error = null,
                 last_delivery_at = now(), failures = 0 where id = ${hook._id}`,
  ]).catch(() => {});
  return { status, httpStatus, error };
}
