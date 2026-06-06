import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import { ok, requireUser } from "@/lib/api";
import { csvResponse } from "@/lib/csv";
import { stageInfo } from "@/lib/orderStages";

const STATUS_LABEL = new Proxy(
  {},
  { get: (_t, key) => stageInfo(String(key)).label }
);

function buildFilter(searchParams, user) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");

  const filter = {};
  // Managerul vede doar comenzile lui (consecvent cu /api/orders)
  if (user.role !== "admin") {
    filter.$or = [{ createdBy: user.id }, { responsible: user.id }];
  }
  if (status) filter.status = status;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = d;
    }
  }
  return filter;
}

export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const filter = buildFilter(searchParams, user);

  const orders = await Order.find(filter)
    .populate("responsible", "name")
    .populate("createdBy", "name")
    .populate("items.warehouse", "name")
    .sort({ createdAt: -1 });

  // Export CSV: un rand per linie de produs (usor de pivotat in Excel)
  if (format === "csv") {
    const rows = [];
    for (const o of orders) {
      if (o.items.length === 0) {
        rows.push({
          "Numar comanda": o.number,
          Data: new Date(o.createdAt).toLocaleString("ro-RO"),
          Status: STATUS_LABEL[o.status] || o.status,
          Responsabil: o.responsible?.name || "",
          "Creata de": o.createdBy?.name || "",
          Client: o.customerName || "",
          Produs: "",
          Depozit: "",
          Cantitate: "",
          Unitate: "",
          "Pret unitar": "",
          "Total linie": "",
          "Total comanda": o.total,
        });
        continue;
      }
      for (const it of o.items) {
        rows.push({
          "Numar comanda": o.number,
          Data: new Date(o.createdAt).toLocaleString("ro-RO"),
          Status: STATUS_LABEL[o.status] || o.status,
          Responsabil: o.responsible?.name || "",
          "Creata de": o.createdBy?.name || "",
          Client: o.customerName || "",
          Produs: it.productName,
          Depozit: it.warehouse?.name || "",
          Cantitate: it.quantity,
          Unitate: it.unit,
          "Pret unitar": it.unitPrice,
          "Total linie": it.lineTotal,
          "Total comanda": o.total,
        });
      }
    }
    return csvResponse(rows, `raport_comenzi_${Date.now()}.csv`);
  }

  // JSON: rezumat + lista pentru afisare in pagina
  const summary = {
    count: orders.length,
    totalValue: +orders
      .reduce((s, o) => s + (o.total || 0), 0)
      .toFixed(2),
    // Valoarea comenzilor finalizate (complete)
    approvedValue: +orders
      .filter((o) => o.status === "completed")
      .reduce((s, o) => s + (o.total || 0), 0)
      .toFixed(2),
    byStatus: {
      pending: orders.filter((o) => o.status === "pending_approval").length,
      processing: orders.filter((o) =>
        ["processing", "ready", "invoicing"].includes(o.status)
      ).length,
      completed: orders.filter((o) => o.status === "completed").length,
      rejected: orders.filter((o) => o.status === "rejected").length,
    },
  };

  return ok({
    summary,
    orders: orders.map((o) => ({
      _id: o._id,
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      responsible: o.responsible?.name || "",
      itemsCount: o.items.length,
      total: o.total,
    })),
  });
}
