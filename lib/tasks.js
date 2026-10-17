// Sarcini: select cu relatiile populate (responsabil, autor, client, comanda)
import { db, isUuid } from "./db";

export const taskSelect = (sql) => sql`
  t.*,
  (select json_build_object('_id', u.id, 'name', u.name, 'email', u.email) from users u where u.id = t.assigned_to_id) as assigned_to,
  (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = t.created_by_id) as created_by,
  (select json_build_object('_id', c.id, 'name', c.name, 'phone', c.phone, 'type', c.type) from customers c where c.id = t.customer_id) as customer,
  (select json_build_object('_id', o.id, 'number', o.number) from orders o where o.id = t.order_id) as "order"`;

export async function getTask(id, q = db()) {
  if (!isUuid(String(id))) return null;
  const [t] = await q`select ${taskSelect(q)} from tasks t where t.id = ${id}`;
  return t || null;
}
