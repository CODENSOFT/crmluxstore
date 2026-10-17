import { db, likeOf } from "@/lib/db";
import { route, normPhone } from "@/lib/api";
import { visibilityFilter } from "@/lib/orderService";

// Cautare globala (paleta de comenzi Ctrl+K)
export const GET = route(async ({ query, user }) => {
  const q = query.get("q")?.trim();
  if (!q || q.length < 2) return { products: [], customers: [], orders: [] };
  const sql = db();
  const l = likeOf(q);
  const pn = normPhone(q);
  const [products, customers, orders] = await Promise.all([
    sql`select p.id, p.name, p.sku, p.unit, p.price, p.active,
               coalesce((select sum(quantity) from stock s where s.product_id = p.id), 0) as total_stock
        from products p where p.name ilike ${l} or p.sku ilike ${l} or p.barcode ilike ${l} or p.brand ilike ${l}
        order by p.active desc, lower(p.name) limit 6`,
    sql`select id, name, phone, type, number, segment from customers
        where name ilike ${l} or contact_person ilike ${l} or email ilike ${l} or idno ilike ${l} or number ilike ${l}
              ${pn && pn.length >= 4 ? sql`or phone_norm like ${likeOf(pn)}` : sql``}
        order by last_order_at desc nulls last limit 6`,
    sql`select o.id, o.number, o.customer_name, o.total, o.status, o.created_at from orders o
        where ${visibilityFilter(user)} and (o.number ilike ${l} or o.customer_name ilike ${l} or o.customer_phone ilike ${l} or o.external_number ilike ${l})
        order by o.created_at desc limit 6`,
  ]);
  return { products, customers, orders };
});
