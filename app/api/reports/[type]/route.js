import { db, isUuid } from "@/lib/db";
import { route, badRequest, dateRange } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { visibilityFilter } from "@/lib/orderService";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";
import { csvResponse } from "@/lib/csv";
import { TZ, startOfMonth } from "@/lib/time";
import {
  channelLabel,
  paymentMethodLabel,
  segmentLabel,
  writeoffReasonLabel,
  UNIT_LABELS,
} from "@/lib/constants";

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// Perioada implicita: luna curenta
function period(query, col = "o.created_at") {
  const sql = db();
  const r = dateRange(query);
  const c = sql.unsafe(col);
  if (!r.createdAt) return sql`${c} >= ${startOfMonth(new Date())}`;
  return sql`${r.createdAt.$gte ? sql`${c} >= ${r.createdAt.$gte}` : sql`true`} and ${r.createdAt.$lte ? sql`${c} <= ${r.createdAt.$lte}` : sql`true`}`;
}

// Comenzi de vanzare vizibile utilizatorului, in perioada + filtre (canal, responsabil)
function baseMatch(query, user) {
  const sql = db();
  const ch = query.get("channel");
  const resp = query.get("responsible");
  return sql`${visibilityFilter(user)} and o.status in ${sql(SALE_STAGE_KEYS)} and ${period(query)}
    ${ch ? sql`and o.channel = ${ch}` : sql``}
    ${resp ? (isUuid(resp) ? sql`and o.responsible_id = ${resp}` : sql`and false`) : sql``}`;
}

// Cost si valoare linii per comanda
const orderLines = (sql) => sql`left join lateral (
  select sum(quantity * coalesce(cost_price, 0)) as cost, sum(line_total) as items from order_items where order_id = o.id
) li on true`;

/* ---------- Vanzari ---------- */
async function sales(query, user) {
  const sql = db();
  const match = baseMatch(query, user);
  const group = query.get("group") || "day";
  const fmt = { day: "YYYY-MM-DD", week: 'IYYY-"S"IW', month: "YYYY-MM" }[group] || "YYYY-MM-DD";
  const [[t], series, byChannel, byPayment, byManager, byCategory] = await Promise.all([
    sql`select coalesce(sum(o.total), 0) as revenue, count(*)::int as orders,
               coalesce(sum(li.items), 0) as items, coalesce(sum(li.cost), 0) as cost,
               coalesce(sum(nullif(o.delivery->>'cost', '')::numeric), 0) as delivery,
               coalesce(sum(o.vat_total), 0) as vat, coalesce(sum(o.paid_amount), 0) as paid,
               count(distinct o.customer_id)::int as customers
        from orders o ${orderLines(sql)} where ${match}`,
    sql`select to_char(o.created_at at time zone ${TZ}, ${fmt}) as key, sum(o.total) as revenue, count(*)::int as orders,
               coalesce(sum(li.cost), 0) as cost, coalesce(sum(li.items), 0) as items
        from orders o ${orderLines(sql)} where ${match} group by 1 order by 1`,
    sql`select o.channel as key, sum(o.total) as revenue, count(*)::int as orders
        from orders o where ${match} group by 1 order by revenue desc`,
    sql`select o.payment_method as key, sum(o.total) as revenue, count(*)::int as orders
        from orders o where ${match} group by 1 order by revenue desc`,
    sql`select o.responsible_id as key, coalesce(min(u.name), '—') as name, sum(o.total) as revenue, count(*)::int as orders,
               coalesce(sum(li.cost), 0) as cost, coalesce(sum(li.items), 0) as items
        from orders o ${orderLines(sql)} left join users u on u.id = o.responsible_id
        where ${match} group by o.responsible_id order by revenue desc`,
    sql`select p.category_id as key, coalesce(min(c.name), 'Fără categorie') as name, sum(i.line_total) as revenue,
               sum(i.quantity) as qty, sum(i.quantity * coalesce(i.cost_price, 0)) as cost
        from order_items i join orders o on o.id = i.order_id
        left join products p on p.id = i.product_id left join categories c on c.id = p.category_id
        where ${match} group by p.category_id order by revenue desc`,
  ]);
  const summary = {
    revenue: r2(t.revenue),
    orders: t.orders,
    avg: t.orders ? r2(t.revenue / t.orders) : 0,
    margin: r2(t.items - t.cost),
    marginPct: t.items ? r2(((t.items - t.cost) / t.items) * 100) : 0,
    delivery: r2(t.delivery),
    vat: r2(t.vat),
    paid: r2(t.paid),
    customers: t.customers,
  };
  return {
    summary,
    series: series.map((s) => ({ key: s.key, revenue: r2(s.revenue), orders: s.orders, margin: r2(s.items - s.cost) })),
    byChannel: byChannel.map((c) => ({ key: c.key, label: channelLabel(c.key), revenue: r2(c.revenue), orders: c.orders })),
    byPayment: byPayment.map((c) => ({ key: c.key, label: paymentMethodLabel(c.key), revenue: r2(c.revenue), orders: c.orders })),
    byManager: byManager.map((m) => ({ key: String(m.key), label: m.name, revenue: r2(m.revenue), orders: m.orders, margin: r2(m.items - m.cost) })),
    byCategory: byCategory.map((c) => ({ key: String(c.key), label: c.name, revenue: r2(c.revenue), qty: c.qty, margin: r2(c.revenue - c.cost) })),
    csv: () =>
      series.map((s) => ({
        Perioada: s.key,
        Comenzi: s.orders,
        "Vânzări": r2(s.revenue),
        "Marjă brută": r2(s.items - s.cost),
      })),
  };
}

/* ---------- Produse ---------- */
async function products(query, user) {
  const sql = db();
  const match = baseMatch(query, user);
  const rows = await sql`
    select i.product_id as id, min(i.product_name) as name, min(i.sku) as sku, min(i.unit) as unit,
           sum(i.quantity) as qty, sum(i.line_total) as revenue,
           sum(i.quantity * coalesce(i.cost_price, 0)) as cost, count(distinct o.id)::int as orders
    from order_items i join orders o on o.id = i.order_id
    where ${match} group by i.product_id order by revenue desc limit 500`;
  const total = rows.reduce((s, r) => s + r.revenue, 0) || 1;
  let acc = 0;
  const items = rows.map((r) => {
    acc += r.revenue;
    const share = (acc / total) * 100;
    return {
      _id: r._id,
      name: r.name,
      sku: r.sku,
      unit: r.unit,
      qty: r.qty,
      revenue: r2(r.revenue),
      margin: r2(r.revenue - r.cost),
      orders: r.orders,
      abc: share <= 80 ? "A" : share <= 95 ? "B" : "C",
    };
  });

  // Stoc fara miscare: produse cu stoc, fara vanzari in perioada
  const soldIds = rows.map((r) => r._id).filter(Boolean);
  const dead = await sql`
    select p.id, p.name, p.sku, p.unit, t.qty as total, t.qty * coalesce(p.cost_price, p.price, 0) as value
    from products p cross join lateral (select coalesce(sum(quantity), 0) as qty from stock where product_id = p.id) t
    where p.active and t.qty > 0 ${soldIds.length ? sql`and p.id not in ${sql(soldIds)}` : sql``}
    order by value desc limit 50`;
  return {
    items,
    dead,
    csv: () =>
      items.map((i) => ({
        Produs: i.name,
        SKU: i.sku || "",
        "Cantitate vândută": i.qty,
        Unitate: UNIT_LABELS[i.unit] || i.unit,
        "Vânzări": i.revenue,
        "Marjă brută": i.margin,
        Comenzi: i.orders,
        "Clasa ABC": i.abc,
      })),
  };
}

/* ---------- Clienti ---------- */
async function customers(query, user) {
  const sql = db();
  const match = sql`${baseMatch(query, user)} and o.customer_id is not null`;
  const [rows, bySegment, [{ created }]] = await Promise.all([
    sql`select o.customer_id as id, coalesce(min(c.name), min(o.customer_name)) as name, min(c.phone) as phone, min(c.segment) as segment,
               coalesce(min(c.balance), 0) as balance, sum(o.total) as revenue, count(*)::int as orders, max(o.created_at) as last
        from orders o left join customers c on c.id = o.customer_id
        where ${match} group by o.customer_id order by revenue desc limit 300`,
    sql`select coalesce(c.segment, 'retail') as key, sum(o.total) as revenue, count(*)::int as orders, count(distinct o.customer_id)::int as customers
        from orders o left join customers c on c.id = o.customer_id
        where ${match} group by 1 order by revenue desc`,
    sql`select count(*)::int as created from customers c where ${period(query, "c.created_at")}`,
  ]);
  const items = rows.map((r) => ({
    _id: r._id,
    name: r.name,
    phone: r.phone,
    segment: r.segment,
    revenue: r2(r.revenue),
    orders: r.orders,
    avg: r2(r.revenue / r.orders),
    last: r.last,
    balance: r.balance,
  }));
  return {
    items,
    newCustomers: created,
    bySegment: bySegment.map((s) => ({ key: s.key, label: segmentLabel(s.key), revenue: r2(s.revenue), orders: s.orders, customers: s.customers })),
    csv: () =>
      items.map((i) => ({
        Client: i.name,
        Telefon: i.phone || "",
        Segment: segmentLabel(i.segment),
        Comenzi: i.orders,
        "Vânzări": i.revenue,
        "Bon mediu": i.avg,
        Datorie: i.balance,
        "Ultima comandă": i.last ? new Date(i.last).toLocaleDateString("ro-RO") : "",
      })),
  };
}

/* ---------- Datorii (de incasat) ---------- */
async function debts(query, user) {
  const sql = db();
  const now = new Date();
  const orders = await sql`
    select o.id, o.number, o.customer_id as customer, o.customer_name, o.customer_phone, o.total, o.paid_amount,
           o.created_at, o.due_date, o.payment_method, o.status
    from orders o
    where ${visibilityFilter(user)} and o.status in ${sql(SALE_STAGE_KEYS)} and o.payment_status <> 'paid'
    order by o.due_date nulls last, o.created_at`;
  const items = orders.map((o) => {
    const balance = r2(o.total - (o.paidAmount || 0));
    const overdueDays = o.dueDate && o.dueDate < now ? Math.floor((now - o.dueDate) / 86400000) : 0;
    return { ...o, balance, overdueDays };
  });
  const byCustomer = new Map();
  for (const o of items) {
    const k = String(o.customer || o.customerName || "—");
    const cur = byCustomer.get(k) || { key: k, customer: o.customer, name: o.customerName || "Fără client", phone: o.customerPhone, balance: 0, orders: 0, overdue: 0 };
    cur.balance += o.balance;
    cur.orders += 1;
    if (o.overdueDays > 0) cur.overdue += o.balance;
    byCustomer.set(k, cur);
  }
  const customersList = [...byCustomer.values()].map((c) => ({ ...c, balance: r2(c.balance), overdue: r2(c.overdue) })).sort((a, b) => b.balance - a.balance);
  return {
    summary: {
      total: r2(items.reduce((s, o) => s + o.balance, 0)),
      overdue: r2(items.filter((o) => o.overdueDays > 0).reduce((s, o) => s + o.balance, 0)),
      orders: items.length,
      customers: customersList.length,
    },
    items,
    customers: customersList,
    csv: () =>
      items.map((o) => ({
        Comanda: o.number,
        Client: o.customerName || "",
        Telefon: o.customerPhone || "",
        Data: new Date(o.createdAt).toLocaleDateString("ro-RO"),
        Scadență: o.dueDate ? new Date(o.dueDate).toLocaleDateString("ro-RO") : "",
        Total: o.total,
        Achitat: o.paidAmount || 0,
        Rest: o.balance,
        "Zile întârziere": o.overdueDays,
      })),
  };
}

/* ---------- Stoc ---------- */
async function stock() {
  const sql = db();
  const settings = await getSettings();
  const [byWarehouse, byCategory] = await Promise.all([
    sql`select s.warehouse_id as id, coalesce(min(w.name), '—') as name, sum(s.quantity) as units,
               count(*) filter (where s.quantity > 0)::int as positions,
               sum(s.quantity * coalesce(p.price, 0)) as value, sum(s.quantity * coalesce(p.cost_price, 0)) as cost
        from stock s join products p on p.id = s.product_id left join warehouses w on w.id = s.warehouse_id
        where p.active group by s.warehouse_id order by value desc`,
    sql`select p.category_id as id, coalesce(min(c.name), 'Fără categorie') as name, count(*)::int as products,
               sum(t.qty) as units, sum(t.qty * coalesce(p.price, 0)) as value, sum(t.qty * coalesce(p.cost_price, 0)) as cost
        from products p cross join lateral (select coalesce(sum(quantity), 0) as qty from stock where product_id = p.id) t
        left join categories c on c.id = p.category_id
        where p.active group by p.category_id order by value desc`,
  ]);
  return {
    currency: settings.currency,
    byWarehouse,
    byCategory,
    csv: () =>
      byCategory.map((c) => ({ Categorie: c.name, Produse: c.products, Unități: c.units, "Valoare vânzare": r2(c.value), "Valoare cost": r2(c.cost) })),
  };
}

/* ---------- Casari ---------- */
async function writeoffs(query) {
  const sql = db();
  const docs = await sql`
    select d.*, (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = d.warehouse_id) as warehouse
    from writeoffs d where ${period(query, "d.created_at")} order by d.created_at desc`;
  const byReason = new Map();
  for (const d of docs) {
    const k = d.reasonCode || "other";
    const cur = byReason.get(k) || { key: k, label: writeoffReasonLabel(k), docs: 0, cost: 0 };
    cur.docs += 1;
    cur.cost += d.totalCost || 0;
    byReason.set(k, cur);
  }
  return {
    items: docs,
    byReason: [...byReason.values()].sort((a, b) => b.cost - a.cost),
    total: r2(docs.reduce((s, d) => s + (d.totalCost || 0), 0)),
    csv: () =>
      docs.map((d) => ({
        Document: d.number || "",
        Data: new Date(d.createdAt).toLocaleDateString("ro-RO"),
        Depozit: d.warehouse?.name || "",
        Motiv: writeoffReasonLabel(d.reasonCode),
        Detalii: d.reason || "",
        "Valoare (cost)": d.totalCost || 0,
      })),
  };
}

const REPORTS = { sales, products, customers, debts, stock, writeoffs };

export const GET = route(async ({ params, query, user }) => {
  const fn = REPORTS[params.type];
  if (!fn) throw badRequest("Raport necunoscut");
  if (params.type === "writeoffs" && user.role !== "admin") throw badRequest("Raport disponibil doar administratorului");
  const data = await fn(query, user);
  const { csv, ...rest } = data;
  if (query.get("format") === "csv") {
    return csvResponse(csv(), `raport_${params.type}_${new Date().toISOString().slice(0, 10)}.csv`);
  }
  return rest;
});
