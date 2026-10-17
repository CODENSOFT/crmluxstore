import crypto from "node:crypto";
import Webhook from "@/models/Webhook";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { generateSecret } from "@/lib/apiKeys";
import { deliver } from "@/lib/events";
import { cleanEvents } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";

export const PATCH = route(
  async ({ req, params, user }) => {
    const b = await readJson(req);
    const h = await Webhook.findById(params.id);
    if (!h) throw notFound("Webhook inexistent");
    if (b.name !== undefined) h.name = b.name;
    if (b.url !== undefined) {
      if (!/^https?:\/\//.test(b.url)) throw badRequest("URL invalid");
      h.url = b.url.trim();
    }
    if (b.events !== undefined) h.events = cleanEvents(b.events);
    if (b.active !== undefined) h.active = !!b.active;
    if (b.regenerateSecret) h.secret = generateSecret();
    await h.save();
    await logAudit({ action: "webhook_saved", category: "integration", entityName: h.name, user });
    return h;
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ params }) => {
    await Webhook.findByIdAndDelete(params.id);
    return { deleted: true };
  },
  { auth: "admin" }
);

// Trimite un eveniment de test („ping”)
export const POST = route(
  async ({ params }) => {
    const h = await Webhook.findById(params.id).lean();
    if (!h) throw notFound("Webhook inexistent");
    const id = crypto.randomUUID();
    const body = JSON.stringify({
      id,
      event: "ping",
      createdAt: new Date().toISOString(),
      data: { message: "Test de conexiune din CRM Lux Store" },
    });
    return deliver(h, "ping", body, id);
  },
  { auth: "admin" }
);
