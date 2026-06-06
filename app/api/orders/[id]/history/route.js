import connectDB from "@/lib/mongodb";
import AuditLog from "@/models/AuditLog";
import Order from "@/models/Order";
import { ok, fail, requireUser } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";

// Istoricul unei comenzi (cine, ce, cand)
export async function GET(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;

  const order = await Order.findById(id).select("createdBy responsible");
  if (!order) return fail("Comanda inexistenta", 404);
  if (
    user.role !== "admin" &&
    String(order.createdBy) !== String(user.id) &&
    String(order.responsible) !== String(user.id)
  ) {
    return fail("Acces interzis", 403);
  }

  const items = await AuditLog.find({ order: id }).sort({ createdAt: -1 });
  return ok(
    items.map((a) => ({
      _id: a._id,
      action: a.action,
      label: AUDIT_LABELS[a.action] || a.action,
      userName: a.userName || "—",
      userRole: a.userRole,
      details: a.details,
      createdAt: a.createdAt,
    }))
  );
}
