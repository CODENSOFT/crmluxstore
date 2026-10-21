import { db } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { generateApiKey } from "@/lib/apiKeys";
import { logAudit } from "@/lib/audit";

const KEY_COLS = (sql) => sql`
  k.id, k.name, k.kind, k.prefix, k.scopes, k.active, k.last_used_at, k.last_used_ip, k.usage_count, k.created_at, k.updated_at,
  (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = k.created_by_id) as created_by`;

export const GET = route(
  async () => {
    const sql = db();
    return sql`select ${KEY_COLS(sql)} from api_keys k order by k.created_at desc`;
  },
  { auth: "owner" }
);

// Cheia completa se afiseaza O SINGURA DATA, la creare
export const POST = route(
  async ({ req, user }) => {
    const { name, kind, scopes } = await readJson(req);
    if (!name?.trim()) throw badRequest("Dați un nume cheii (ex: „1C Contabilitate”)");
    const sql = db();
    const k = generateApiKey();
    const clean = Array.isArray(scopes) ? scopes.filter((s) => ["read", "write"].includes(s)) : [];
    const [row] = await sql`insert into api_keys ${sql({
      name: name.trim(),
      kind: ["1c", "site", "generic"].includes(kind) ? kind : "generic",
      prefix: k.prefix,
      hash: k.hash,
      scopes: clean.length ? clean : ["read", "write"],
      createdById: user.id,
    })} returning id`;
    const [doc] = await sql`select ${KEY_COLS(sql)} from api_keys k where k.id = ${row._id}`;
    await logAudit({ action: "apikey_created", category: "integration", entityName: doc.name, user });
    return { ...doc, key: k.raw };
  },
  { auth: "owner" }
);
