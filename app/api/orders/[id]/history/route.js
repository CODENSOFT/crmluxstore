import AuditLog from "@/models/AuditLog";
import Order from "@/models/Order";
import StockMovement from "@/models/StockMovement";
import { route } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";
import { assertCanView } from "@/lib/orderService";

export const GET = route(async ({ params, user }) => {
  const order = await Order.findById(params.id).select("createdBy responsible status channel").lean();
  assertCanView(order, user);
  const [items, movements] = await Promise.all([
    AuditLog.find({ order: params.id }).sort({ createdAt: -1 }).lean(),
    StockMovement.find({ refId: params.id }).populate("warehouse", "name").sort({ createdAt: -1 }).lean(),
  ]);
  return {
    events: items.map((a) => ({
      _id: a._id,
      action: a.action,
      label: AUDIT_LABELS[a.action] || a.action,
      userName: a.userName || "—",
      userRole: a.userRole,
      details: a.details,
      createdAt: a.createdAt,
    })),
    movements,
  };
});
