import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { generateSecret } from "@/lib/apiKeys";
import { logAudit } from "@/lib/audit";
import { cleanEvents } from "@/lib/webhooks";

export const GET = route(
  async ({ query }) => {
    const sql = db();
    const d = query.get("deliveries");
    if (d) {
      if (!isUuid(d)) return [];
      return sql`select *, webhook_id as webhook from webhook_deliveries where webhook_id = ${d} order by created_at desc limit 50`;
    }
    return sql`select * from webhooks order by created_at desc`;
  },
  { auth: "owner" }
);

export const POST = route(
  async ({ req, user }) => {
    const b = await readJson(req);
    if (!b.name?.trim()) throw badRequest("Numele este obligatoriu");
    if (!/^https?:\/\//.test(b.url || "")) throw badRequest("URL-ul trebuie să înceapă cu https://");
    const sql = db();
    const [hook] = await sql`insert into webhooks ${sql({
      name: b.name.trim(),
      url: b.url.trim(),
      events: cleanEvents(b.events),
      secret: generateSecret(),
      createdById: user.id,
    })} returning *`;
    await logAudit({ action: "webhook_saved", category: "integration", entityName: hook.name, user, details: hook.url });
    return hook;
  },
  { auth: "owner" }
);
