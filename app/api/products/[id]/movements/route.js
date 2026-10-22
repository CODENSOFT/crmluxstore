import { db, isUuid } from "@/lib/db";
import { route, pagination, notFound } from "@/lib/api";

export const GET = route(async ({ params, query }) => {
  if (!isUuid(params.id)) throw notFound("Produsul nu există");
  const { limit, skip } = pagination(query, { defLimit: 50, maxLimit: 500 });
  const sql = db();
  const wh = isUuid(String(query.get("warehouse") || "")) ? query.get("warehouse") : null;
  const rows = await sql`
    select m.*, m.product_id as product,
      (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = m.warehouse_id) as warehouse,
      count(*) over () as full_count
    from stock_movements m
    where m.product_id = ${params.id} ${wh ? sql`and m.warehouse_id = ${wh}` : sql``}
    order by m.created_at desc, m.seq desc limit ${limit} offset ${skip}`;
  return { items: rows.map(({ fullCount: _fullCount, ...m }) => m), total: rows[0]?.fullCount || 0 };
});
