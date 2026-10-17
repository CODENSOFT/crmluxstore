import { db, isUuid } from "@/lib/db";
import { route, readJson, notFound } from "@/lib/api";
import { getCustomer, updateCustomer, refreshCustomerStats } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { customerDTO } from "@/lib/dto";
import { visibilityFilter } from "@/lib/orderService";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";

async function load(id) {
  const c = isUuid(id) ? await getCustomer(id) : null;
  if (!c) throw notFound("Clientul nu există");
  return c;
}

export const GET = route(async ({ params, user }) => {
  const c = await load(params.id);
  const sql = db();
  const [[manager], orders, tasks, topProducts] = await Promise.all([
    c.manager ? sql`select id, name, email from users where id = ${c.manager}` : [null],
    sql`
      select o.id, o.number, o.status, o.total, o.paid_amount, o.payment_status, o.created_at, o.channel,
        coalesce((select json_agg(json_build_object('productName', i.product_name) order by i.position)
                  from order_items i where i.order_id = o.id), '[]'::json) as items
      from orders o where o.customer_id = ${c._id} and ${visibilityFilter(user)}
      order by o.created_at desc limit 100`,
    sql`
      select t.*, (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = t.assigned_to_id) as assigned_to
      from tasks t where t.customer_id = ${c._id} order by t.status, t.due_date nulls last limit 50`,
    sql`
      select i.product_id as id, max(i.product_name) as name, sum(i.quantity) as qty, sum(i.line_total) as total
      from order_items i join orders o on o.id = i.order_id
      where o.customer_id = ${c._id} and o.status in ${sql(SALE_STAGE_KEYS)}
      group by i.product_id order by total desc limit 8`,
  ]);
  return { ...c, manager: manager || null, orders, tasks, topProducts };
});

export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  await load(params.id);
  const c = await updateCustomer(params.id, body);
  await logAudit({ action: "customer_edited", category: "customer", entity: c, entityName: c.name, user, details: Object.keys(body).join(", ") });
  emit("customer.updated", customerDTO(c));
  return c;
});

// Clientii cu comenzi se dezactiveaza (istoricul ramane); ceilalti se sterg
export const DELETE = route(
  async ({ params, user }) => {
    const c = await load(params.id);
    const sql = db();
    const [{ used }] = await sql`select exists (select 1 from orders where customer_id = ${c._id}) as used`;
    if (used) {
      await sql`update customers set active = false where id = ${c._id}`;
      return { deleted: false, deactivated: true };
    }
    await sql`delete from customers where id = ${c._id}`;
    await logAudit({ action: "customer_deleted", category: "customer", entityName: c.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);

// Recalculare statistici (buton „Recalculează”)
export const POST = route(async ({ params }) => {
  await load(params.id);
  await refreshCustomerStats(params.id);
  return getCustomer(params.id);
});
