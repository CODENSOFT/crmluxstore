import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import User from "@/models/User";
import { ok, fail, requireUser } from "@/lib/api";
import { applyOrderStock } from "@/lib/stock";
import { buildOrderItems } from "@/lib/orderItems";
import { dispatchToMake } from "@/lib/make";
import { notifyAdminsForApproval, notifyAssigned } from "@/lib/notify";
import { logAudit } from "@/lib/audit";

async function nextOrderNumber() {
  const count = await Order.countDocuments();
  return `CMD-${String(count + 1).padStart(6, "0")}`;
}

export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const filter = {};
  // Managerul vede doar comenzile create de el sau de care e responsabil
  if (user.role !== "admin") {
    filter.$or = [{ createdBy: user.id }, { responsible: user.id }];
  }
  if (status) filter.status = status;

  const orders = await Order.find(filter)
    .populate("responsible", "name email")
    .populate("createdBy", "name email")
    .populate("approvedBy", "name email")
    .populate("items.warehouse", "name")
    .sort({ createdAt: -1 });

  return ok(orders);
}

export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();

  const body = await req.json();
  const { items, customerName, note } = body;

  // Construim liniile cu preturi din baza de date (sursa de adevar)
  let builtItems, total;
  try {
    ({ items: builtItems, total } = await buildOrderItems(items));
  } catch (e) {
    return fail(e.message);
  }

  // Responsabil: managerul = el insusi (fortat). Adminul poate alege.
  let responsible = user.id;
  if (user.role === "admin" && body.responsible) {
    const r = await User.findById(body.responsible);
    if (!r) return fail("Responsabil inexistent");
    responsible = r._id;
  }

  // Comenzile create de admin intra direct in procesare (stoc scazut);
  // ale managerului asteapta aprobarea adminului.
  const isAdmin = user.role === "admin";
  const status = isAdmin ? "processing" : "pending_approval";

  // Daca intra direct in procesare, scadem stocul (validare totul-sau-nimic)
  if (status === "processing") {
    try {
      await applyOrderStock(builtItems, -1);
    } catch (e) {
      return fail(e.message);
    }
  }

  const order = await Order.create({
    number: await nextOrderNumber(),
    items: builtItems,
    total,
    status,
    responsible,
    createdBy: user.id,
    approvedBy: isAdmin ? user.id : undefined,
    customerName,
    note,
    stockApplied: status === "processing",
  });

  const populated = await Order.findById(order._id)
    .populate("responsible", "name email")
    .populate("createdBy", "name email")
    .populate("items.warehouse", "name");

  // Notificare in sistem catre admini cand comanda asteapta aprobare
  if (status === "pending_approval") {
    await notifyAdminsForApproval(populated);
  }

  // Cand adminul creeaza comanda pentru altcineva, notificam responsabilul
  if (isAdmin) {
    await notifyAssigned(populated);
  }

  await logAudit({
    action: "created",
    order: populated,
    user,
    details: `${builtItems.length} produse · total ${total}`,
  });

  await dispatchToMake("order.created", populated.toJSON());
  return ok(populated, { status: 201 });
}
