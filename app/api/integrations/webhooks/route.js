import Webhook from "@/models/Webhook";
import WebhookDelivery from "@/models/WebhookDelivery";
import { route, readJson, badRequest } from "@/lib/api";
import { generateSecret } from "@/lib/apiKeys";
import { logAudit } from "@/lib/audit";
import { cleanEvents } from "@/lib/webhooks";

export const GET = route(
  async ({ query }) => {
    if (query.get("deliveries")) {
      return WebhookDelivery.find({ webhook: query.get("deliveries") }).sort({ createdAt: -1 }).limit(50).lean();
    }
    return Webhook.find().sort({ createdAt: -1 }).lean();
  },
  { auth: "admin" }
);

export const POST = route(
  async ({ req, user }) => {
    const b = await readJson(req);
    if (!b.name?.trim()) throw badRequest("Numele este obligatoriu");
    if (!/^https?:\/\//.test(b.url || "")) throw badRequest("URL-ul trebuie să înceapă cu https://");
    const hook = await Webhook.create({
      name: b.name.trim(),
      url: b.url.trim(),
      events: cleanEvents(b.events),
      secret: generateSecret(),
      createdBy: user.id,
    });
    await logAudit({ action: "webhook_saved", category: "integration", entityName: hook.name, user, details: hook.url });
    return hook;
  },
  { auth: "admin" }
);
