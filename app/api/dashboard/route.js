import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { visibilityFilter } from "@/lib/orderService";
import { can } from "@/lib/permissions";
import { OPEN_STAGE_KEYS } from "@/lib/orderStages";
import { startOfDay, addDays } from "@/lib/time";

// Panoul = ce trebuie facut acum, pentru contul care il deschide (fara statistici — acelea sunt in Rapoarte):
//   - sarcinile mele (intarziate / azi / urmeaza) + sarcinile intarziate ale echipei (cine le gestioneaza)
//   - comenzile de preluat (noi), de aprobat (cine aproba) si cate sunt in fiecare etapa
//   - produsele fara stoc sau sub minim (de suplinit), inventarierile neterminate
// Angajatul vede doar comenzile lui + cele noi venite de pe site / bot / API (visibilityFilter).
export const GET = route(async ({ user }) => {
  const sql = db();
  const settings = await getSettings();
  const vis = visibilityFilter(user);
  const approver = can(user, "orders.approve");
  const teamTasks = can(user, "tasks.manage");
  const inventory = can(user, "stock.inventory");
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const threshold = settings.lowStockThreshold ?? 5;

  const [stages, newOrders, approval, myTasks, [taskCounts], teamOverdue, stock, inventories] = await Promise.all([
    sql`select o.status, count(*)::int as n from orders o
        where ${vis} and o.status in ${sql(OPEN_STAGE_KEYS)} group by o.status`,
    // cele care asteapta de cel mai mult timp — primele
    sql`select o.id, o.number, o.customer_name, o.customer_phone, o.total, o.channel, o.created_at, u.name as responsible_name
        from orders o left join users u on u.id = o.responsible_id
        where ${vis} and o.status = 'new' order by o.created_at limit 8`,
    sql`select o.id, o.number, o.customer_name, o.total, o.created_at, u.name as created_by_name
        from orders o left join users u on u.id = o.created_by_id
        where ${vis} and o.status = 'pending_approval' order by o.created_at limit 6`,
    sql`select t.id, t.title, t.due_date, t.priority, t.status, c.name as customer_name
        from tasks t left join customers c on c.id = t.customer_id
        where t.assigned_to_id = ${user.id} and t.status <> 'done'
        order by (t.due_date is null), t.due_date, (t.priority = 'high') desc, t.created_at
        limit 12`,
    sql`select count(*)::int as open,
               count(*) filter (where due_date < ${today})::int as overdue,
               count(*) filter (where due_date >= ${today} and due_date < ${tomorrow})::int as today
        from tasks where assigned_to_id = ${user.id} and status <> 'done'`,
    teamTasks
      ? sql`select t.id, t.title, t.due_date, u.name as assignee, count(*) over () as full_count
            from tasks t join users u on u.id = t.assigned_to_id
            where t.status <> 'done' and t.due_date < ${today} and t.assigned_to_id <> ${user.id}
            order by t.due_date limit 6`
      : [],
    sql`select p.id, p.name, p.sku, p.unit, t.qty as total, coalesce(p.min_stock, ${threshold}) as "limit"
        from products p
        cross join lateral (select coalesce(sum(quantity), 0) as qty from stock where product_id = p.id) t
        where p.active and t.qty <= coalesce(p.min_stock, ${threshold})
        order by t.qty, lower(p.name)`,
    inventory
      ? sql`select i.id, i.number, i.created_at, w.name as warehouse_name, jsonb_array_length(i.items) as lines
            from inventory_counts i left join warehouses w on w.id = i.warehouse_id
            where i.status = 'draft' order by i.created_at limit 5`
      : [],
  ]);

  const counts = Object.fromEntries(OPEN_STAGE_KEYS.map((k) => [k, 0]));
  for (const s of stages) counts[s.status] = s.n;

  // de suplinit: pana la dublul pragului minim
  const withSuggestion = (p) => ({ ...p, suggested: Math.max(1, Math.ceil(Math.max(p.limit * 2, 1) - Math.max(p.total, 0))) });
  const out = stock.filter((p) => p.total <= 0);
  const low = stock.filter((p) => p.total > 0);

  return {
    can: { approve: approver, teamTasks, inventory },
    counts,
    newOrders,
    approval,
    tasks: { items: myTasks, ...taskCounts },
    teamOverdue: teamTasks ? { items: teamOverdue.map(({ fullCount, ...t }) => t), count: teamOverdue[0]?.fullCount || 0 } : null,
    stock: {
      out: { items: out.slice(0, 8).map(withSuggestion), count: out.length },
      low: { items: low.slice(0, 8).map(withSuggestion), count: low.length },
    },
    inventories,
  };
});
