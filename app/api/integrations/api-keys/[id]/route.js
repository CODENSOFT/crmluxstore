import { db, isUuid } from "@/lib/db";
import { route, readJson, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const COLS = "id, name, kind, prefix, scopes, active, last_used_at, last_used_ip, usage_count, created_at, updated_at";

export const PATCH = route(
  async ({ req, params, user }) => {
    const b = await readJson(req);
    const sql = db();
    const [k] = isUuid(params.id) ? await sql`select id from api_keys where id = ${params.id}` : [];
    if (!k) throw notFound("Cheia nu există");
    const patch = {};
    if (b.name !== undefined && String(b.name).trim()) patch.name = String(b.name).trim();
    if (b.active !== undefined) patch.active = !!b.active;
    if (Array.isArray(b.scopes)) patch.scopes = b.scopes.filter((s) => ["read", "write"].includes(s));
    if (Object.keys(patch).length) await sql`update api_keys set ${sql(patch, ...Object.keys(patch))} where id = ${k._id}`;
    const [doc] = await sql`select ${sql.unsafe(COLS)} from api_keys where id = ${k._id}`;
    if (b.active === false) await logAudit({ action: "apikey_revoked", category: "integration", entityName: doc.name, user });
    return doc;
  },
  { auth: "owner" }
);

export const DELETE = route(
  async ({ params, user }) => {
    const [k] = isUuid(params.id) ? await db()`delete from api_keys where id = ${params.id} returning name` : [];
    if (k) await logAudit({ action: "apikey_revoked", category: "integration", entityName: k.name, user, details: "Ștearsă" });
    return { deleted: true };
  },
  { auth: "owner" }
);
