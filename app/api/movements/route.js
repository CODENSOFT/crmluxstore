import { db, isUuid, likeOf, where } from "@/lib/db";
import { route, pagination, dateRange } from "@/lib/api";
import { csvResponse } from "@/lib/csv";
import { MOVEMENT_TYPES } from "@/lib/constants";

export const GET = route(async ({ query }) => {
  const sql = db();
  const conds = [];
  const r = dateRange(query);
  if (r.createdAt?.$gte) conds.push(sql`m.created_at >= ${r.createdAt.$gte}`);
  if (r.createdAt?.$lte) conds.push(sql`m.created_at <= ${r.createdAt.$lte}`);
  for (const [param, col] of [["product", "m.product_id"], ["warehouse", "m.warehouse_id"]]) {
    const v = query.get(param);
    if (v) conds.push(isUuid(v) ? sql`${sql(col)} = ${v}` : sql`false`);
  }
  if (query.get("type")) conds.push(sql`m.type = ${query.get("type")}`);
  const q = query.get("q")?.trim();
  if (q) {
    const l = likeOf(q);
    conds.push(sql`(m.product_name ilike ${l} or m.sku ilike ${l} or m.ref_number ilike ${l} or m.user_name ilike ${l})`);
  }
  const select = sql`
    m.*, m.product_id as product,
    (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = m.warehouse_id) as warehouse`;

  if (query.get("format") === "csv") {
    const items = await sql`select ${select} from stock_movements m where ${where(conds)} order by m.created_at desc, m.seq desc limit 20000`;
    return csvResponse(
      items.map((m) => ({
        Data: new Date(m.createdAt).toLocaleString("ro-RO"),
        Tip: MOVEMENT_TYPES[m.type]?.label || m.type,
        Produs: m.productName || "",
        SKU: m.sku || "",
        Depozit: m.warehouse?.name || "",
        Cantitate: m.quantity,
        "Sold după": m.balanceAfter ?? "",
        Document: m.refNumber || "",
        Utilizator: m.userName || "",
        Notă: m.note || "",
      })),
      `miscari_stoc_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }
  const { page, limit, skip } = pagination(query, { defLimit: 50 });
  const rows = await sql`
    select ${select}, count(*) over () as full_count from stock_movements m where ${where(conds)}
    order by m.created_at desc, m.seq desc limit ${limit} offset ${skip}`;
  return { items: rows.map(({ fullCount: _fullCount, ...m }) => m), total: rows[0]?.fullCount || 0, page, limit };
});
