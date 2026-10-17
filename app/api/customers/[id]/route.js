import mongoose from "mongoose";
import Customer from "@/models/Customer";
import Order from "@/models/Order";
import Task from "@/models/Task";
import { route, readJson, notFound, badRequest } from "@/lib/api";
import { pickCustomerFields, refreshCustomerStats } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { customerDTO } from "@/lib/dto";
import { visibilityFilter } from "@/lib/orderService";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";

export const GET = route(async ({ params, user }) => {
  const c = await Customer.findById(params.id).populate("manager", "name email").lean();
  if (!c) throw notFound("Clientul nu există");
  const id = new mongoose.Types.ObjectId(params.id);
  const vis = visibilityFilter(user);
  const [orders, tasks, topProducts] = await Promise.all([
    Order.find({ customer: id, ...vis })
      .select("number status total paidAmount paymentStatus createdAt channel items.productName")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    Task.find({ customer: id }).populate("assignedTo", "name").sort({ status: 1, dueDate: 1 }).limit(50).lean(),
    Order.aggregate([
      { $match: { customer: id, status: { $in: SALE_STAGE_KEYS } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.productName" }, qty: { $sum: "$items.quantity" }, total: { $sum: "$items.lineTotal" } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]),
  ]);
  return { ...c, orders, tasks, topProducts };
});

export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  const c = await Customer.findById(params.id);
  if (!c) throw notFound("Clientul nu există");
  const fields = pickCustomerFields(body);
  if (fields.name !== undefined && !String(fields.name).trim()) throw badRequest("Numele nu poate fi gol");
  Object.assign(c, fields);
  await c.save();
  await logAudit({ action: "customer_edited", category: "customer", entity: c, entityName: c.name, user, details: Object.keys(fields).join(", ") });
  emit("customer.updated", () => customerDTO(c.toObject()));
  return c;
});

// Clientii cu comenzi se dezactiveaza (istoricul ramane); ceilalti se sterg
export const DELETE = route(
  async ({ params, user }) => {
    const c = await Customer.findById(params.id);
    if (!c) throw notFound("Clientul nu există");
    if (await Order.exists({ customer: c._id })) {
      c.active = false;
      await c.save();
      return { deleted: false, deactivated: true };
    }
    await c.deleteOne();
    await logAudit({ action: "customer_deleted", category: "customer", entityName: c.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);

// Recalculare statistici (buton „Recalculează”)
export const POST = route(async ({ params }) => {
  await refreshCustomerStats(params.id);
  return Customer.findById(params.id).lean();
});
