import { db, where } from "@/lib/db";
import { route, pagination } from "@/lib/api";

export const GET = route(
  async ({ query }) => {
    const sql = db();
    const conds = [];
    if (query.get("source")) conds.push(sql`source = ${query.get("source")}`);
    if (query.get("status")) conds.push(sql`status = ${query.get("status")}`);
    const { limit, skip, page } = pagination(query, { defLimit: 50 });
    const rows = await sql`
      select *, count(*) over () as full_count from integration_logs where ${where(conds)}
      order by created_at desc limit ${limit} offset ${skip}`;
    return { items: rows.map(({ fullCount, ...r }) => r), total: rows[0]?.fullCount || 0, page, limit };
  },
  { auth: "admin" }
);
