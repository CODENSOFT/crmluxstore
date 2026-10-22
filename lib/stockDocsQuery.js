// Liste si detalii pentru documentele de stoc (receptii, transferuri, casari, inventarieri)
import { db, isUuid, likeOf, where } from "./db";
import { dateRange, pagination } from "./api";

const userObj = (sql, col) => sql`(select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = ${sql(col)})`;
const whObj = (sql, col) => sql`(select json_build_object('_id', w.id, 'name', w.name, 'address', w.address) from warehouses w where w.id = ${sql(col)})`;

const KINDS = {
  arrivals: {
    table: "arrivals",
    select: (sql) => sql`d.*, ${whObj(sql, "d.warehouse_id")} as warehouse, ${userObj(sql, "d.created_by_id")} as created_by,
      (select json_build_object('_id', s.id, 'name', s.name, 'idno', s.idno, 'phone', s.phone) from suppliers s where s.id = d.supplier_id) as supplier_ref`,
    search: (sql, l) => sql`(d.number ilike ${l} or d.supplier ilike ${l} or d.note ilike ${l} or d.items::text ilike ${l})`,
    warehouse: (sql, w) => sql`d.warehouse_id = ${w}`,
  },
  transfers: {
    table: "transfers",
    select: (sql) => sql`d.*, ${whObj(sql, "d.from_warehouse_id")} as from_warehouse, ${whObj(sql, "d.to_warehouse_id")} as to_warehouse, ${userObj(sql, "d.created_by_id")} as created_by`,
    search: (sql, l) => sql`(d.number ilike ${l} or d.note ilike ${l} or d.items::text ilike ${l})`,
    warehouse: (sql, w) => sql`(d.from_warehouse_id = ${w} or d.to_warehouse_id = ${w})`,
  },
  writeoffs: {
    table: "writeoffs",
    select: (sql) => sql`d.*, ${whObj(sql, "d.warehouse_id")} as warehouse, ${userObj(sql, "d.created_by_id")} as created_by`,
    search: (sql, l) => sql`(d.number ilike ${l} or d.reason ilike ${l} or d.items::text ilike ${l})`,
    warehouse: (sql, w) => sql`d.warehouse_id = ${w}`,
  },
  inventory: {
    table: "inventory_counts",
    select: (sql) => sql`d.id, d.number, d.warehouse_id, d.status, d.note, d.summary, d.created_at, d.updated_at, d.completed_at,
      jsonb_array_length(d.items) as lines_count,
      (select count(*)::int from jsonb_array_elements(d.items) e where e->>'counted' is not null) as counted_lines,
      ${whObj(sql, "d.warehouse_id")} as warehouse, ${userObj(sql, "d.created_by_id")} as created_by, ${userObj(sql, "d.completed_by_id")} as completed_by`,
    search: (sql, l) => sql`(d.number ilike ${l} or d.note ilike ${l})`,
    warehouse: (sql, w) => sql`d.warehouse_id = ${w}`,
  },
};

export async function listDocs(kind, query, extra = []) {
  const sql = db();
  const k = KINDS[kind];
  const conds = [...extra];
  const r = dateRange(query);
  if (r.createdAt?.$gte) conds.push(sql`d.created_at >= ${r.createdAt.$gte}`);
  if (r.createdAt?.$lte) conds.push(sql`d.created_at <= ${r.createdAt.$lte}`);
  const q = query.get("q")?.trim();
  if (q) conds.push(k.search(sql, likeOf(q)));
  const w = query.get("warehouse");
  if (isUuid(String(w || ""))) conds.push(k.warehouse(sql, w));
  if (kind === "arrivals" && isUuid(String(query.get("supplier") || ""))) conds.push(sql`d.supplier_id = ${query.get("supplier")}`);
  if (kind === "inventory" && query.get("status")) conds.push(sql`d.status = ${query.get("status")}`);
  const { page, limit, skip } = pagination(query, { defLimit: 30 });
  const rows = await sql`
    select ${k.select(sql)}, count(*) over () as full_count
    from ${sql(k.table)} d where ${where(conds)}
    order by d.created_at desc limit ${limit} offset ${skip}`;
  const total = rows[0]?.fullCount || 0;
  const items = rows.map(({ fullCount: _fullCount, ...d }) => ({
    ...d,
    linesCount: d.linesCount ?? d.items?.length ?? 0,
    totalQty: (d.items || []).reduce((s, l) => s + (Number(l.quantity) || 0), 0),
  }));
  return { items, total, page, limit };
}

export async function getDoc(kind, id) {
  if (!isUuid(String(id))) return null;
  const sql = db();
  const k = KINDS[kind];
  const [d] = await sql`select ${k.select(sql)} from ${sql(k.table)} d where d.id = ${id}`;
  return d || null;
}
