import crypto from "node:crypto";
import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { generateSecret } from "@/lib/apiKeys";
import { deliver } from "@/lib/events";
import { cleanEvents } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";

async function load(id) {
  const [h] = isUuid(id) ? await db()`select * from webhooks where id = ${id}` : [];
  if (!h) throw notFound("Webhook inexistent");
  return h;
}

export const PATCH = route(
  async ({ req, params, user }) => {
    const b = await readJson(req);
    const h = await load(params.id);
    const sql = db();
    const patch = {};
    if (b.name !== undefined && String(b.name).trim()) patch.name = String(b.name).trim();
    if (b.url !== undefined) {
      if (!/^https?:\/\//.test(b.url)) throw badRequest("URL invalid");
      patch.url = b.url.trim();
    }
    if (b.events !== undefined) patch.events = cleanEvents(b.events);
    if (b.active !== undefined) {
      patch.active = !!b.active;
      if (b.active) patch.failures = 0;
    }
    if (b.regenerateSecret) patch.secret = generateSecret();
    if (Object.keys(patch).length) await sql`update webhooks set ${sql(patch, ...Object.keys(patch))} where id = ${h._id}`;
    const fresh = await load(h._id);
    await logAudit({ action: "webhook_saved", category: "integration", entityName: fresh.name, user });
    return fresh;
  },
  { auth: "owner" }
);

export const DELETE = route(
  async ({ params }) => {
    if (isUuid(params.id)) await db()`delete from webhooks where id = ${params.id}`;
    return { deleted: true };
  },
  { auth: "owner" }
);

// Trimite un eveniment de test („ping”)
export const POST = route(
  async ({ params }) => {
    const h = await load(params.id);
    const id = crypto.randomUUID();
    const body = JSON.stringify({
      id,
      event: "ping",
      createdAt: new Date().toISOString(),
      data: { message: "Test de conexiune din CRM Lux Store" },
    });
    return deliver(h, "ping", body, id);
  },
  { auth: "owner" }
);
