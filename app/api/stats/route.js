import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Order from "@/models/Order";
import Task from "@/models/Task";
import Warehouse from "@/models/Warehouse";
import Settings from "@/models/Settings";
import { ok, requireUser } from "@/lib/api";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();

  const settings = await Settings.findOne();
  const threshold = settings?.lowStockThreshold ?? 5;

  const orderFilter =
    user.role === "admin"
      ? {}
      : { $or: [{ createdBy: user.id }, { responsible: user.id }] };
  const taskFilter =
    user.role === "admin"
      ? {}
      : { $or: [{ assignedTo: user.id }, { createdBy: user.id }] };

  const [
    productCount,
    warehouseCount,
    pendingOrders,
    inProgressOrders,
    completedOrders,
    openTasks,
    products,
    recentOrders,
  ] = await Promise.all([
    Product.countDocuments(),
    Warehouse.countDocuments(),
    Order.countDocuments({ ...orderFilter, status: "pending_approval" }),
    Order.countDocuments({
      ...orderFilter,
      status: { $in: ["processing", "ready", "invoicing"] },
    }),
    Order.countDocuments({ ...orderFilter, status: "completed" }),
    Task.countDocuments({ ...taskFilter, status: { $ne: "done" } }),
    Product.find().populate("stock.warehouse", "name"),
    Order.find(orderFilter)
      .populate("responsible", "name")
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  // Produse cu stoc total sub prag
  const lowStock = products
    .map((p) => ({
      _id: p._id,
      name: p.name,
      unit: p.unit,
      total: (p.stock || []).reduce((s, x) => s + (x.quantity || 0), 0),
    }))
    .filter((p) => p.total <= threshold)
    .sort((a, b) => a.total - b.total)
    .slice(0, 8);

  const inventoryValue = products.reduce(
    (sum, p) =>
      sum +
      (p.price || 0) *
        (p.stock || []).reduce((s, x) => s + (x.quantity || 0), 0),
    0
  );

  // === Date pentru grafice ===

  // Valoare stoc pe depozite
  const whMap = {};
  for (const p of products) {
    for (const s of p.stock || []) {
      const name = s.warehouse?.name || "Necunoscut";
      whMap[name] = (whMap[name] || 0) + (p.price || 0) * (s.quantity || 0);
    }
  }
  const stockByWarehouse = Object.entries(whMap)
    .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
    .sort((a, b) => b.value - a.value);

  // Vanzari pe ultimele 14 zile (comenzi neresinse) — chei pe data locala
  const localKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);
  const recentForChart = await Order.find({
    ...orderFilter,
    status: { $ne: "rejected" },
    createdAt: { $gte: since },
  }).select("total createdAt");

  const dayMap = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    dayMap[localKey(d)] = 0;
  }
  for (const o of recentForChart) {
    const key = localKey(new Date(o.createdAt));
    if (key in dayMap) dayMap[key] += o.total || 0;
  }
  const salesByDay = Object.entries(dayMap).map(([date, total]) => ({
    date,
    total: +total.toFixed(2),
  }));

  // Top produse vandute (dupa cantitate) — comenzi neresinse
  const soldOrders = await Order.find({
    ...orderFilter,
    status: { $ne: "rejected" },
  }).select("items");
  const prodMap = {};
  for (const o of soldOrders) {
    for (const it of o.items || []) {
      prodMap[it.productName] = (prodMap[it.productName] || 0) + it.quantity;
    }
  }
  const topProducts = Object.entries(prodMap)
    .map(([name, qty]) => ({ name, qty: +qty.toFixed(2) }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return ok({
    productCount,
    warehouseCount,
    pendingOrders,
    inProgressOrders,
    completedOrders,
    openTasks,
    lowStock,
    inventoryValue: +inventoryValue.toFixed(2),
    recentOrders,
    currency: settings?.currency || "MDL",
    stockByWarehouse,
    salesByDay,
    topProducts,
  });
}
