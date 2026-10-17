import { db } from "@/lib/db";
import { route } from "@/lib/api";

// ?read=0 (curente) | ?read=1 (istoric) | ?countOnly=1 (clopotel) | ?limit=
export const GET = route(async ({ user, query }) => {
  const sql = db();
  const [{ unread }] = await sql`select count(*)::int as unread from notifications where recipient_id = ${user.id} and not read`;
  if (query.get("countOnly") === "1") return { items: [], unread };
  const read = query.get("read");
  const type = query.get("type");
  const items = await sql`
    select n.*, (select json_build_object('_id', o.id, 'status', o.status, 'number', o.number) from orders o where o.id = n.order_id) as "order"
    from notifications n
    where n.recipient_id = ${user.id}
      ${read === "0" ? sql`and not n.read` : read === "1" ? sql`and n.read` : sql``}
      ${type ? sql`and n.type = ${type}` : sql``}
    order by n.created_at desc
    limit ${Math.min(200, Number(query.get("limit")) || 100)}`;
  return { items, unread };
});

// Marcheaza toate ca citite
export const POST = route(async ({ user }) => {
  await db()`update notifications set read = true where recipient_id = ${user.id} and not read`;
  return { done: true };
});

// Sterge notificarile citite
export const DELETE = route(async ({ user }) => {
  const r = await db()`delete from notifications where recipient_id = ${user.id} and read`;
  return { deleted: r.count };
});
