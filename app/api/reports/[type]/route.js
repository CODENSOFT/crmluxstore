import mongoose from "mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Customer from "@/models/Customer";
import WriteOff from "@/models/WriteOff";
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
const costExpr = { $sum: { $map: { input: "$items", in: { $multiply: ["$$this.quantity", { $ifNull: ["$$this.costPrice", 0] }] } } } };

// Perioada implicita: luna curenta
function period(query) {
  const r = dateRange(query);
  if (r.createdAt) return r;
  return { createdAt: { $gte: startOfMonth(new Date()) } };
}

function baseMatch(query, user) {
  const m = { ...visibilityFilter(user), status: { $in: SALE_STAGE_KEYS }, ...period(query) };
  if (query.get("channel")) m.channel = query.get("channel");
  if (query.get("responsible")) m.responsible = new mongoose.Types.ObjectId(query.get("responsible"));
  return m;
}

/* ---------- Vanzari ---------- */
async function sales(query, user) {
  const match = baseMatch(query, user);
  const group = query.get("group") || "day";
  const fmt = { day: "%Y-%m-%d", week: "%G-S%V", month: "%Y-%m" }[group] || "%Y-%m-%d";
  const [totals, series, byChannel, byPayment, byManager, byCategory] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
          items: { $sum: { $sum: "$items.lineTotal" } },
          cost: { $sum: costExpr },
          delivery: { $sum: { $ifNull: ["$delivery.cost", 0] } },
          vat: { $sum: { $ifNull: ["$vatTotal", 0] } },
          paid: { $sum: { $ifNull: ["$paidAmount", 0] } },
          customers: { $addToSet: "$customer" },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: "$createdAt", timezone: TZ } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
          cost: { $sum: costExpr },
          items: { $sum: { $sum: "$items.lineTotal" } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: "$channel", revenue: { $sum: "$total" }, orders: { $sum: 1 } } }, { $sort: { revenue: -1 } }]),
    Order.aggregate([{ $match: match }, { $group: { _id: "$paymentMethod", revenue: { $sum: "$total" }, orders: { $sum: 1 } } }, { $sort: { revenue: -1 } }]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: "$responsible", revenue: { $sum: "$total" }, orders: { $sum: 1 }, cost: { $sum: costExpr }, items: { $sum: { $sum: "$items.lineTotal" } } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u", pipeline: [{ $project: { name: 1 } }] } },
      { $addFields: { name: { $ifNull: [{ $first: "$u.name" }, "—"] } } },
      { $project: { u: 0 } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "p", pipeline: [{ $project: { category: 1 } }] } },
      { $addFields: { category: { $first: "$p.category" } } },
      { $group: { _id: "$category", revenue: { $sum: "$items.lineTotal" }, qty: { $sum: "$items.quantity" }, cost: { $sum: { $multiply: ["$items.quantity", { $ifNull: ["$items.costPrice", 0] }] } } } },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "c", pipeline: [{ $project: { name: 1 } }] } },
      { $addFields: { name: { $ifNull: [{ $first: "$c.name" }, "Fără categorie"] } } },
      { $project: { c: 0 } },
      { $sort: { revenue: -1 } },
    ]),
  ]);
  const t = totals[0] || {};
  const summary = {
    revenue: r2(t.revenue),
    orders: t.orders || 0,
    avg: t.orders ? r2(t.revenue / t.orders) : 0,
    margin: r2((t.items || 0) - (t.cost || 0)),
    marginPct: t.items ? r2((((t.items || 0) - (t.cost || 0)) / t.items) * 100) : 0,
    delivery: r2(t.delivery),
    vat: r2(t.vat),
    paid: r2(t.paid),
    customers: (t.customers || []).filter(Boolean).length,
  };
  return {
    summary,
    series: series.map((s) => ({ key: s._id, revenue: r2(s.revenue), orders: s.orders, margin: r2(s.items - s.cost) })),
    byChannel: byChannel.map((c) => ({ key: c._id, label: channelLabel(c._id), revenue: r2(c.revenue), orders: c.orders })),
    byPayment: byPayment.map((c) => ({ key: c._id, label: paymentMethodLabel(c._id), revenue: r2(c.revenue), orders: c.orders })),
    byManager: byManager.map((m) => ({ key: String(m._id), label: m.name, revenue: r2(m.revenue), orders: m.orders, margin: r2(m.items - m.cost) })),
    byCategory: byCategory.map((c) => ({ key: String(c._id), label: c.name, revenue: r2(c.revenue), qty: c.qty, margin: r2(c.revenue - c.cost) })),
    csv: () =>
      series.map((s) => ({
        Perioada: s._id,
        Comenzi: s.orders,
        "Vânzări": r2(s.revenue),
        "Marjă brută": r2(s.items - s.cost),
      })),
  };
}

/* ---------- Produse ---------- */
async function products(query, user) {
  const match = baseMatch(query, user);
  const rows = await Order.aggregate([
    { $match: match },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        name: { $first: "$items.productName" },
        sku: { $first: "$items.sku" },
        unit: { $first: "$items.unit" },
        qty: { $sum: "$items.quantity" },
        revenue: { $sum: "$items.lineTotal" },
        cost: { $sum: { $multiply: ["$items.quantity", { $ifNull: ["$items.costPrice", 0] }] } },
        orders: { $addToSet: "$_id" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 500 },
  ]);
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
      orders: r.orders.length,
      abc: share <= 80 ? "A" : share <= 95 ? "B" : "C",
    };
  });

  // Stoc fara miscare: produse cu stoc, fara vanzari in perioada
  const soldIds = rows.map((r) => r._id);
  const dead = await Product.aggregate([
    { $match: { active: { $ne: false }, _id: { $nin: soldIds } } },
    { $project: { name: 1, sku: 1, unit: 1, total: { $sum: "$stock.quantity" }, value: { $multiply: [{ $sum: "$stock.quantity" }, { $ifNull: ["$costPrice", "$price"] }] } } },
    { $match: { total: { $gt: 0 } } },
    { $sort: { value: -1 } },
    { $limit: 50 },
  ]);
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
  const match = { ...baseMatch(query, user), customer: { $ne: null } };
  const [rows, bySegment, created] = await Promise.all([
    Order.aggregate([
      { $match: match },
      { $group: { _id: "$customer", name: { $first: "$customerName" }, revenue: { $sum: "$total" }, orders: { $sum: 1 }, last: { $max: "$createdAt" } } },
      { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "c", pipeline: [{ $project: { name: 1, segment: 1, phone: 1, "stats.balance": 1 } }] } },
      { $addFields: { c: { $first: "$c" } } },
      { $sort: { revenue: -1 } },
      { $limit: 300 },
    ]),
    Order.aggregate([
      { $match: match },
      { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "c", pipeline: [{ $project: { segment: 1 } }] } },
      { $group: { _id: { $ifNull: [{ $first: "$c.segment" }, "retail"] }, revenue: { $sum: "$total" }, orders: { $sum: 1 }, customers: { $addToSet: "$customer" } } },
      { $sort: { revenue: -1 } },
    ]),
    Customer.countDocuments(period(query)),
  ]);
  const items = rows.map((r) => ({
    _id: r._id,
    name: r.c?.name || r.name,
    phone: r.c?.phone,
    segment: r.c?.segment,
    revenue: r2(r.revenue),
    orders: r.orders,
    avg: r2(r.revenue / r.orders),
    last: r.last,
    balance: r.c?.stats?.balance || 0,
  }));
  return {
    items,
    newCustomers: created,
    bySegment: bySegment.map((s) => ({ key: s._id, label: segmentLabel(s._id), revenue: r2(s.revenue), orders: s.orders, customers: s.customers.length })),
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
  const now = new Date();
  const orders = await Order.find({
    ...visibilityFilter(user),
    status: { $in: SALE_STAGE_KEYS },
    paymentStatus: { $ne: "paid" },
  })
    .select("number customer customerName customerPhone total paidAmount createdAt dueDate paymentMethod status")
    .sort({ dueDate: 1, createdAt: 1 })
    .lean();
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
  const settings = await getSettings();
  const [byWarehouse, byCategory] = await Promise.all([
    Product.aggregate([
      { $match: { active: { $ne: false } } },
      { $unwind: "$stock" },
      {
        $group: {
          _id: "$stock.warehouse",
          units: { $sum: "$stock.quantity" },
          positions: { $sum: { $cond: [{ $gt: ["$stock.quantity", 0] }, 1, 0] } },
          value: { $sum: { $multiply: ["$stock.quantity", { $ifNull: ["$price", 0] }] } },
          cost: { $sum: { $multiply: ["$stock.quantity", { $ifNull: ["$costPrice", 0] }] } },
        },
      },
      { $lookup: { from: "warehouses", localField: "_id", foreignField: "_id", as: "w", pipeline: [{ $project: { name: 1 } }] } },
      { $addFields: { name: { $ifNull: [{ $first: "$w.name" }, "—"] } } },
      { $project: { w: 0 } },
      { $sort: { value: -1 } },
    ]),
    Product.aggregate([
      { $match: { active: { $ne: false } } },
      { $project: { category: 1, total: { $sum: "$stock.quantity" }, price: 1, costPrice: 1 } },
      {
        $group: {
          _id: "$category",
          products: { $sum: 1 },
          units: { $sum: "$total" },
          value: { $sum: { $multiply: ["$total", { $ifNull: ["$price", 0] }] } },
          cost: { $sum: { $multiply: ["$total", { $ifNull: ["$costPrice", 0] }] } },
        },
      },
      { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "c", pipeline: [{ $project: { name: 1 } }] } },
      { $addFields: { name: { $ifNull: [{ $first: "$c.name" }, "Fără categorie"] } } },
      { $project: { c: 0 } },
      { $sort: { value: -1 } },
    ]),
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
  const match = { ...period(query) };
  const docs = await WriteOff.find(match).populate("warehouse", "name").sort({ createdAt: -1 }).lean();
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
