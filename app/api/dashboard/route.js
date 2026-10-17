import mongoose from "mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Task from "@/models/Task";
import Customer from "@/models/Customer";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { visibilityFilter } from "@/lib/orderService";
import { SALE_STAGE_KEYS, OPEN_STAGE_KEYS } from "@/lib/orderStages";
import { TZ, startOfDay, startOfMonth, addDays, addMonths, ymd } from "@/lib/time";

const DAYS = 30;

async function revenue(match) {
  const [r] = await Order.aggregate([
    { $match: { ...match, status: { $in: SALE_STAGE_KEYS } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: "$total" },
        orders: { $sum: 1 },
        cost: { $sum: { $sum: { $map: { input: "$items", in: { $multiply: ["$$this.quantity", { $ifNull: ["$$this.costPrice", 0] }] } } } } },
        items: { $sum: { $sum: "$items.lineTotal" } },
      },
    },
  ]);
  return { revenue: r?.revenue || 0, orders: r?.orders || 0, cost: r?.cost || 0, items: r?.items || 0 };
}

export const GET = route(async ({ user }) => {
  const settings = await getSettings();
  const vis = visibilityFilter(user);
  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const prevMonthStart = addMonths(monthStart, -1);
  // aceeasi perioada din luna trecuta (pentru comparatie corecta)
  const elapsed = now.getTime() - monthStart.getTime();
  const prevSamePeriodEnd = new Date(prevMonthStart.getTime() + elapsed);
  const chartStart = addDays(today, -(DAYS - 1));
  const uid = new mongoose.Types.ObjectId(String(user.id));

  const [
    todayStats,
    monthStats,
    prevStats,
    statusCounts,
    debt,
    series,
    byChannel,
    topProducts,
    topCustomers,
    recentOrders,
    tasks,
    overdueTasks,
    stockAgg,
    lowStock,
    newCustomers,
  ] = await Promise.all([
    revenue({ ...vis, createdAt: { $gte: today } }),
    revenue({ ...vis, createdAt: { $gte: monthStart } }),
    revenue({ ...vis, createdAt: { $gte: prevMonthStart, $lte: prevSamePeriodEnd } }),
    Order.aggregate([{ $match: { ...vis, status: { $in: OPEN_STAGE_KEYS } } }, { $group: { _id: { s: "$status", c: "$channel" }, n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...vis, status: { $in: SALE_STAGE_KEYS }, paymentStatus: { $ne: "paid" } } },
      {
        $group: {
          _id: null,
          amount: { $sum: { $subtract: ["$total", { $ifNull: ["$paidAmount", 0] }] } },
          orders: { $sum: 1 },
          overdue: { $sum: { $cond: [{ $and: [{ $ne: ["$dueDate", null] }, { $lt: ["$dueDate", now] }] }, { $subtract: ["$total", { $ifNull: ["$paidAmount", 0] }] }, 0] } },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...vis, status: { $in: SALE_STAGE_KEYS }, createdAt: { $gte: chartStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      { $match: { ...vis, status: { $in: SALE_STAGE_KEYS }, createdAt: { $gte: monthStart } } },
      { $group: { _id: "$channel", revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: { ...vis, status: { $in: SALE_STAGE_KEYS }, createdAt: { $gte: monthStart } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.productName" }, unit: { $first: "$items.unit" }, qty: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]),
    Order.aggregate([
      { $match: { ...vis, status: { $in: SALE_STAGE_KEYS }, createdAt: { $gte: monthStart }, customer: { $ne: null } } },
      { $group: { _id: "$customer", name: { $first: "$customerName" }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),
    Order.find(vis)
      .select("number customerName total status channel createdAt paymentStatus")
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    Task.find({ assignedTo: uid, status: { $ne: "done" } })
      .select("title dueDate priority status")
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(6)
      .lean(),
    Task.countDocuments({ assignedTo: uid, status: { $ne: "done" }, dueDate: { $lt: today } }),
    Product.aggregate([
      { $match: { active: { $ne: false } } },
      {
        $group: {
          _id: null,
          value: { $sum: { $multiply: [{ $sum: "$stock.quantity" }, { $ifNull: ["$price", 0] }] } },
          cost: { $sum: { $multiply: [{ $sum: "$stock.quantity" }, { $ifNull: ["$costPrice", 0] }] } },
          products: { $sum: 1 },
        },
      },
    ]),
    Product.aggregate([
      { $match: { active: { $ne: false } } },
      { $project: { name: 1, unit: 1, sku: 1, total: { $sum: "$stock.quantity" }, limit: { $ifNull: ["$minStock", settings.lowStockThreshold ?? 5] } } },
      { $match: { $expr: { $lte: ["$total", "$limit"] } } },
      { $sort: { total: 1 } },
      { $facet: { items: [{ $limit: 8 }], count: [{ $count: "n" }] } },
    ]),
    Customer.countDocuments({ createdAt: { $gte: monthStart } }),
  ]);

  // Serie completa pe zile (inclusiv zilele fara vanzari)
  const byDay = new Map(series.map((s) => [s._id, s]));
  const chart = [];
  for (let i = 0; i < DAYS; i++) {
    const key = ymd(addDays(chartStart, i));
    chart.push({ date: key, revenue: byDay.get(key)?.revenue || 0, orders: byDay.get(key)?.orders || 0 });
  }

  const counts = { new: 0, pending_approval: 0, processing: 0, ready: 0, invoicing: 0, siteNew: 0 };
  for (const c of statusCounts) {
    counts[c._id.s] = (counts[c._id.s] || 0) + c.n;
    if (c._id.s === "new" && c._id.c === "site") counts.siteNew += c.n;
  }

  return {
    currency: settings.currency,
    today: todayStats,
    month: { ...monthStats, profit: monthStats.items - monthStats.cost, avg: monthStats.orders ? monthStats.revenue / monthStats.orders : 0 },
    prevMonth: prevStats,
    counts,
    debt: debt[0] || { amount: 0, orders: 0, overdue: 0 },
    chart,
    byChannel,
    topProducts,
    topCustomers,
    recentOrders,
    tasks,
    overdueTasks,
    stock: stockAgg[0] || { value: 0, cost: 0, products: 0 },
    lowStock: { items: lowStock[0]?.items || [], count: lowStock[0]?.count?.[0]?.n || 0 },
    newCustomers,
  };
});
