import { db, isUuid, likeOf, where } from "@/lib/db";
import { route, pagination, dateRange } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";

export const GET = route(
  async ({ query }) => {
    const sql = db();
    const conds = [];
    const r = dateRange(query);
    if (r.createdAt?.$gte) conds.push(sql`created_at >= ${r.createdAt.$gte}`);
    if (r.createdAt?.$lte) conds.push(sql`created_at <= ${r.createdAt.$lte}`);
    if (query.get("category")) conds.push(sql`category = ${query.get("category")}`);
    const u = query.get("user");
    if (u) conds.push(isUuid(u) ? sql`user_id = ${u}` : sql`false`);
    const q = query.get("q")?.trim();
    if (q) {
      const l = likeOf(q);
      conds.push(sql`(details ilike ${l} or entity_name ilike ${l} or order_number ilike ${l} or user_name ilike ${l})`);
    }
    const { page, limit, skip } = pagination(query, { defLimit: 50 });
    const rows = await sql`
      select *, user_id as "user", count(*) over () as full_count from audit_logs
      where ${where(conds)} order by created_at desc limit ${limit} offset ${skip}`;
    return {
      items: rows.map(({ fullCount, ...a }) => ({ ...a, label: AUDIT_LABELS[a.action] || a.action })),
      total: rows[0]?.fullCount || 0,
      page,
      limit,
    };
  },
  { auth: "admin" }
);
