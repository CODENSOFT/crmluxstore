import { db, isUuid, likeOf, where } from "@/lib/db";
import { route, readJson, pagination, dateRange } from "@/lib/api";
import { createOrder, visibilityFilter, orderSelect } from "@/lib/orderService";
import { OPEN_STAGE_KEYS, SALE_STAGE_KEYS, STAGE_KEYS, stageInfo } from "@/lib/orderStages";
import { csvResponse } from "@/lib/csv";
import { channelLabel, paymentMethodLabel, PAYMENT_STATUS, UNIT_LABELS } from "@/lib/constants";

function baseFilter(query, user) {
  const sql = db();
  const conds = [visibilityFilter(user)];
  const q = query.get("q")?.trim();
  if (q) {
    const l = likeOf(q);
    conds.push(sql`(o.number ilike ${l} or o.customer_name ilike ${l} or o.customer_phone ilike ${l} or o.external_number ilike ${l}
                    or exists (select 1 from order_items i where i.order_id = o.id and i.product_name ilike ${l}))`);
  }
  if (query.get("channel")) conds.push(sql`o.channel = ${query.get("channel")}`);
  if (query.get("paymentStatus")) conds.push(sql`o.payment_status = ${query.get("paymentStatus")}`);
  if (isUuid(String(query.get("responsible") || ""))) conds.push(sql`o.responsible_id = ${query.get("responsible")}`);
  if (isUuid(String(query.get("customer") || ""))) conds.push(sql`o.customer_id = ${query.get("customer")}`);
  if (query.get("pendingEdit") === "1") conds.push(sql`o.pending_edit is not null`);
  const r = dateRange(query);
  if (r.createdAt?.$gte) conds.push(sql`o.created_at >= ${r.createdAt.$gte}`);
  if (r.createdAt?.$lte) conds.push(sql`o.created_at <= ${r.createdAt.$lte}`);
  return conds;
}

function statusFilter(status) {
  const sql = db();
  if (!status) return null;
  if (status === "open") return sql`o.status in ${sql(OPEN_STAGE_KEYS)}`;
  if (status === "closed") return sql`o.status in ('completed', 'rejected', 'cancelled')`;
  if (status === "cancelled") return sql`o.status in ('cancelled', 'rejected')`;
  if (status === "debt") return sql`o.payment_status <> 'paid' and o.status in ${sql(SALE_STAGE_KEYS)}`;
  return STAGE_KEYS.includes(status) ? sql`o.status = ${status}` : null;
}

const SORTS = {
  "-createdAt": "o.created_at desc",
  createdAt: "o.created_at asc",
  "-total": "o.total desc",
  "-updatedAt": "o.updated_at desc",
};

export const GET = route(async ({ query, user }) => {
  const sql = db();
  const base = baseFilter(query, user);
  const all = where([...base, statusFilter(query.get("status"))]);
  const order = sql.unsafe(SORTS[query.get("sort")] || SORTS["-createdAt"]);

  if (query.get("format") === "csv") {
    const orders = await sql`${orderSelect(sql)} where ${all} order by ${order}`;
    const rows = [];
    for (const o of orders) {
      const head = {
        "Număr": o.number,
        Data: new Date(o.createdAt).toLocaleString("ro-RO", { timeZone: "Europe/Chisinau" }),
        Status: stageInfo(o.status).label,
        Canal: channelLabel(o.channel),
        Client: o.customerName || "",
        Telefon: o.customerPhone || "",
        Responsabil: o.responsible?.name || "",
        Plată: paymentMethodLabel(o.paymentMethod),
        "Status plată": PAYMENT_STATUS[o.paymentStatus || "unpaid"]?.label,
      };
      const items = o.items?.length ? o.items : [{}];
      for (const it of items) {
        rows.push({
          ...head,
          Produs: it.productName || "",
          SKU: it.sku || "",
          Depozit: it.warehouse?.name || "",
          Cantitate: it.quantity ?? "",
          Unitate: UNIT_LABELS[it.unit] || it.unit || "",
          "Preț unitar": it.unitPrice ?? "",
          "Reducere %": it.discount || 0,
          "Total linie": it.lineTotal ?? "",
          Livrare: o.delivery?.cost || 0,
          "Total comandă": o.total,
          Achitat: o.paidAmount || 0,
        });
      }
    }
    return csvResponse(rows, `comenzi_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const { page, limit, skip } = pagination(query, { defLimit: 30, maxLimit: 500 });
  const [items, counts, [sums]] = await Promise.all([
    sql`
      select o.id, o.number, o.status, o.channel, o.customer_id as customer, o.customer_name, o.customer_phone, o.total,
             o.paid_amount, o.payment_status, o.created_at, o.updated_at, o.external_source, o.external_number,
             (o.pending_edit is not null) as has_pending_edit,
             (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = o.responsible_id) as responsible,
             (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = o.created_by_id) as created_by,
             (select count(*)::int from order_items i where i.order_id = o.id) as items_count,
             coalesce((select json_agg(x) from (
                select i.product_name, i.quantity, i.unit from order_items i where i.order_id = o.id order by i.position limit 3
             ) x), '[]'::json) as items,
             count(*) over () as full_count
      from orders o where ${all} order by ${order}, o.id limit ${limit} offset ${skip}`,
    sql`select o.status, count(*)::int as n from orders o where ${where(base)} group by o.status`,
    sql`select coalesce(sum(o.total) filter (where o.status not in ('rejected', 'cancelled')), 0) as total,
               coalesce(sum(o.total - o.paid_amount) filter (where o.status in ${sql(SALE_STAGE_KEYS)}), 0) as debt
        from orders o where ${all}`,
  ]);
  return {
    items: items.map(({ fullCount, ...o }) => o),
    total: items[0]?.fullCount || 0,
    page,
    limit,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    sums: { total: sums.total, debt: Math.max(0, sums.debt) },
  };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  return createOrder(body, user);
});
