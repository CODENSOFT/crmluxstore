import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { visibilityFilter } from "@/lib/orderService";

// Contoare pentru meniu (insigne) + clopotel — un singur apel, la 30s
export const GET = route(async ({ user }) => {
  const sql = db();
  const [r] = await sql`
    select
      (select count(*)::int from orders o where o.status = 'new' and ${visibilityFilter(user)}) as new_orders,
      (select count(*)::int from orders o where o.status = 'pending_approval' and ${visibilityFilter(user)}) as pending,
      (select count(*)::int from orders o where o.pending_edit is not null) as edit_requests,
      (select count(*)::int from tasks t where t.assigned_to_id = ${user.id} and t.status <> 'done') as tasks,
      (select count(*)::int from notifications n where n.recipient_id = ${user.id} and not n.read) as unread`;
  const isAdmin = user.role === "admin";
  return {
    newOrders: r.newOrders,
    pending: r.pending,
    editRequests: isAdmin ? r.editRequests : 0,
    tasks: r.tasks,
    unread: r.unread,
    attention: r.newOrders + (isAdmin ? r.pending + r.editRequests : 0),
  };
});
