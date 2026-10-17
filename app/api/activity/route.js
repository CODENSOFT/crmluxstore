import AuditLog from "@/models/AuditLog";
import { route, pagination, dateRange, escapeRegex } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";

export const GET = route(
  async ({ query }) => {
    const f = { ...dateRange(query) };
    if (query.get("category")) f.category = query.get("category");
    if (query.get("user")) f.user = query.get("user");
    const q = query.get("q")?.trim();
    if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      f.$or = [{ details: rx }, { entityName: rx }, { orderNumber: rx }, { userName: rx }];
    }
    const { page, limit, skip } = pagination(query, { defLimit: 50 });
    const [items, total] = await Promise.all([
      AuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(f),
    ]);
    return {
      items: items.map((a) => ({ ...a, label: AUDIT_LABELS[a.action] || a.action })),
      total,
      page,
      limit,
    };
  },
  { auth: "admin" }
);
