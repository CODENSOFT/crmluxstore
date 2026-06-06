import connectDB from "@/lib/mongodb";
import AuditLog from "@/models/AuditLog";
import { ok, requireAdmin } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";

// Istoric global de activitate (doar admin). Pastrat 1 luna (TTL).
export async function GET(req) {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const filter = {};
  if (category) filter.category = category;

  const items = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(300);

  return ok(
    items.map((a) => ({
      _id: a._id,
      action: a.action,
      label: AUDIT_LABELS[a.action] || a.action,
      category: a.category,
      userName: a.userName || "—",
      userRole: a.userRole,
      orderNumber: a.orderNumber,
      entityName: a.entityName,
      details: a.details,
      createdAt: a.createdAt,
    }))
  );
}
