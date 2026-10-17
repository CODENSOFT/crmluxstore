import mongoose from "mongoose";
import Order from "@/models/Order";
import { route, readJson, pagination, escapeRegex, dateRange } from "@/lib/api";
import { createOrder, visibilityFilter } from "@/lib/orderService";
import { OPEN_STAGE_KEYS, STAGE_KEYS, stageInfo } from "@/lib/orderStages";
import { csvResponse } from "@/lib/csv";
import { channelLabel, paymentMethodLabel, PAYMENT_STATUS, UNIT_LABELS } from "@/lib/constants";

function buildFilter(query, user) {
  const f = { ...visibilityFilter(user) };
  const and = [];
  const q = query.get("q")?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    const or = [{ number: rx }, { customerName: rx }, { customerPhone: rx }, { externalNumber: rx }, { "items.productName": rx }];
    and.push({ $or: or });
  }
  for (const k of ["channel", "paymentStatus"]) if (query.get(k)) f[k] = query.get(k);
  if (query.get("responsible")) f.responsible = new mongoose.Types.ObjectId(query.get("responsible"));
  if (query.get("customer")) f.customer = new mongoose.Types.ObjectId(query.get("customer"));
  if (query.get("pendingEdit") === "1") f.pendingEdit = { $exists: true, $ne: null };
  Object.assign(f, dateRange(query));
  if (and.length) f.$and = and;
  return f;
}

function statusFilter(status) {
  if (!status) return {};
  if (status === "open") return { status: { $in: OPEN_STAGE_KEYS } };
  if (status === "closed") return { status: { $in: ["completed", "rejected", "cancelled"] } };
  if (status === "cancelled") return { status: { $in: ["cancelled", "rejected"] } };
  if (status === "debt") return { paymentStatus: { $ne: "paid" }, status: { $in: ["processing", "ready", "invoicing", "completed"] } };
  return STAGE_KEYS.includes(status) ? { status } : {};
}

export const GET = route(async ({ query, user }) => {
  const base = buildFilter(query, user);
  const filter = { ...base, ...statusFilter(query.get("status")) };
  const sorts = { "-createdAt": { createdAt: -1 }, createdAt: { createdAt: 1 }, "-total": { total: -1 }, "-updatedAt": { updatedAt: -1 } };
  const sort = sorts[query.get("sort")] || { createdAt: -1 };

  if (query.get("format") === "csv") {
    const orders = await Order.find(filter)
      .populate("responsible", "name")
      .populate("items.warehouse", "name")
      .sort(sort)
      .lean();
    const rows = [];
    for (const o of orders) {
      const head = {
        "Număr": o.number,
        Data: new Date(o.createdAt).toLocaleString("ro-RO"),
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
  const [items, total, counts, sums] = await Promise.all([
    Order.find(filter)
      .select("-items.costPrice -pendingEdit.items -payments")
      .populate("responsible", "name")
      .populate("createdBy", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: base }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: { $cond: [{ $in: ["$status", ["rejected", "cancelled"]] }, 0, "$total"] } },
          debt: {
            $sum: {
              $cond: [
                { $in: ["$status", ["processing", "ready", "invoicing", "completed"]] },
                { $subtract: ["$total", { $ifNull: ["$paidAmount", 0] }] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  for (const it of items) {
    it.itemsCount = it.items?.length || 0;
    it.hasPendingEdit = !!it.pendingEdit;
    it.items = (it.items || []).slice(0, 3).map((x) => ({ productName: x.productName, quantity: x.quantity, unit: x.unit }));
    delete it.pendingEdit;
  }
  return {
    items,
    total,
    page,
    limit,
    counts: byStatus,
    sums: { total: sums[0]?.total || 0, debt: Math.max(0, sums[0]?.debt || 0) },
  };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  return createOrder(body, user);
});
