import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { visibilityFilter } from "@/lib/orderService";
import { SALE_STAGE_KEYS, OPEN_STAGE_KEYS } from "@/lib/orderStages";
import { TZ, startOfDay, startOfMonth, addDays, addMonths, ymd } from "@/lib/time";

const DAYS = 30;

export const GET = route(async ({ user }) => {
  const sql = db();
  const settings = await getSettings();
  const vis = visibilityFilter(user);
  const sale = sql`o.status in ${sql(SALE_STAGE_KEYS)}`;
  const now = new Date();
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const prevMonthStart = addMonths(monthStart, -1);
  // aceeasi perioada din luna trecuta (pentru comparatie corecta)
  const prevSamePeriodEnd = new Date(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()));
  const chartStart = addDays(today, -(DAYS - 1));
  const threshold = settings.lowStockThreshold ?? 5;

  const revenue = async (from, to) => {
    const [r] = await sql`
      select coalesce(sum(o.total), 0) as revenue, count(*)::int as orders,
             coalesce(sum(i.cost), 0) as cost, coalesce(sum(i.items), 0) as items
      from orders o
      left join lateral (
        select sum(quantity * coalesce(cost_price, 0)) as cost, sum(line_total) as items from order_items where order_id = o.id
      ) i on true
      where ${vis} and ${sale} and o.created_at >= ${from} ${to ? sql`and o.created_at <= ${to}` : sql``}`;
    return r;
  };

  const [
    todayStats,
    monthStats,
    prevStats,
    statusCounts,
    [debt],
    series,
    byChannel,
    topProducts,
    topCustomers,
    recentOrders,
    tasks,
    [{ overdueTasks }],
    [stockAgg],
    lowStock,
    [{ newCustomers }],
  ] = await Promise.all([
    revenue(today),
    revenue(monthStart),
    revenue(prevMonthStart, prevSamePeriodEnd),
    sql`select o.status, o.channel, count(*)::int as n from orders o
        where ${vis} and o.status in ${sql(OPEN_STAGE_KEYS)} group by o.status, o.channel`,
    sql`select coalesce(sum(o.total - o.paid_amount), 0) as amount, count(*)::int as orders,
               coalesce(sum(o.total - o.paid_amount) filter (where o.due_date is not null and o.due_date < now()), 0) as overdue
        from orders o where ${vis} and ${sale} and o.payment_status <> 'paid'`,
    sql`select to_char(o.created_at at time zone ${TZ}, 'YYYY-MM-DD') as day, sum(o.total) as revenue, count(*)::int as orders
        from orders o where ${vis} and ${sale} and o.created_at >= ${chartStart} group by 1`,
    sql`select o.channel as id, sum(o.total) as revenue, count(*)::int as orders
        from orders o where ${vis} and ${sale} and o.created_at >= ${monthStart}
        group by o.channel order by revenue desc`,
    sql`select i.product_id as id, min(i.product_name) as name, min(i.unit) as unit, sum(i.quantity) as qty, sum(i.line_total) as revenue
        from order_items i join orders o on o.id = i.order_id
        where ${vis} and ${sale} and o.created_at >= ${monthStart}
        group by i.product_id order by revenue desc limit 6`,
    sql`select o.customer_id as id, min(o.customer_name) as name, sum(o.total) as revenue, count(*)::int as orders
        from orders o where ${vis} and ${sale} and o.created_at >= ${monthStart} and o.customer_id is not null
        group by o.customer_id order by revenue desc limit 5`,
    sql`select o.id, o.number, o.customer_name, o.total, o.status, o.channel, o.created_at, o.payment_status
        from orders o where ${vis} order by o.created_at desc limit 8`,
    sql`select id, title, due_date, priority, status from tasks
        where assigned_to_id = ${user.id} and status <> 'done'
        order by due_date nulls last, created_at desc limit 6`,
    sql`select count(*)::int as overdue_tasks from tasks
        where assigned_to_id = ${user.id} and status <> 'done' and due_date < ${today}`,
    sql`select coalesce(sum(t.qty * coalesce(p.price, 0)), 0) as value,
               coalesce(sum(t.qty * coalesce(p.cost_price, 0)), 0) as cost, count(*)::int as products
        from products p
        left join lateral (select coalesce(sum(quantity), 0) as qty from stock where product_id = p.id) t on true
        where p.active`,
    sql`select p.id, p.name, p.unit, p.sku, t.qty as total, coalesce(p.min_stock, ${threshold}) as "limit",
               count(*) over () as full_count
        from products p
        cross join lateral (select coalesce(sum(quantity), 0) as qty from stock where product_id = p.id) t
        where p.active and t.qty <= coalesce(p.min_stock, ${threshold})
        order by t.qty, lower(p.name) limit 8`,
    sql`select count(*)::int as new_customers from customers where created_at >= ${monthStart}`,
  ]);

  // Serie completa pe zile (inclusiv zilele fara vanzari)
  const byDay = new Map(series.map((s) => [s.day, s]));
  const chart = [];
  for (let i = 0; i < DAYS; i++) {
    const key = ymd(addDays(chartStart, i));
    chart.push({ date: key, revenue: byDay.get(key)?.revenue || 0, orders: byDay.get(key)?.orders || 0 });
  }

  const counts = { new: 0, pending_approval: 0, processing: 0, ready: 0, invoicing: 0, siteNew: 0 };
  for (const c of statusCounts) {
    counts[c.status] = (counts[c.status] || 0) + c.n;
    if (c.status === "new" && c.channel === "site") counts.siteNew += c.n;
  }

  return {
    currency: settings.currency,
    today: todayStats,
    month: { ...monthStats, profit: monthStats.items - monthStats.cost, avg: monthStats.orders ? monthStats.revenue / monthStats.orders : 0 },
    prevMonth: prevStats,
    counts,
    debt,
    chart,
    byChannel,
    topProducts,
    topCustomers,
    recentOrders,
    tasks,
    overdueTasks,
    stock: stockAgg,
    lowStock: { items: lowStock.map(({ fullCount, ...p }) => p), count: lowStock[0]?.fullCount || 0 },
    newCustomers,
  };
});
