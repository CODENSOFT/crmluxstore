import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { AUDIT_LABELS } from "@/lib/audit";
import { assertCanView, loadOrderRow } from "@/lib/orderService";

export const GET = route(async ({ params, user }) => {
  const order = await loadOrderRow(params.id);
  assertCanView(order, user);
  const sql = db();
  const [events, movements] = await Promise.all([
    sql`select * from audit_logs where order_id = ${order._id} order by created_at desc`,
    sql`select m.*, (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = m.warehouse_id) as warehouse
        from stock_movements m where m.ref_id = ${order._id} order by m.created_at desc`,
  ]);
  return {
    events: events.map((a) => ({
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
