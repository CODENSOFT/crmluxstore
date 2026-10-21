import { db, isUuid, idOf } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { stockJson } from "@/lib/products";

async function assertCustomer(id) {
  const [c] = isUuid(id) ? await db()`select id from customers where id = ${id}` : [];
  if (!c) throw notFound("Clientul nu există");
  return c._id;
}

async function list(customerId) {
  const sql = db();
  return sql`
    select cp.product_id as product, cp.price, cp.position, cp.updated_at,
           p.name, p.sku, p.unit, p.price as retail_price, p.wholesale_price, p.cost_price, p.active,
           ${stockJson(sql)} as stock,
           coalesce((select sum(s.quantity) from stock s where s.product_id = p.id), 0) as total_stock
    from customer_prices cp join products p on p.id = cp.product_id
    where cp.customer_id = ${customerId}
    order by cp.position, lower(p.name)`;
}

// Produsele cumparate des de client, cu pretul lui individual
export const GET = route(async ({ params }) => list(await assertCustomer(params.id)));

// Inlocuieste lista: { items: [{ product, price }] } (ordinea din lista = ordinea afisarii)
export const PUT = route(
  async ({ req, params }) => {
    const customerId = await assertCustomer(params.id);
    const { items } = await readJson(req);
    if (!Array.isArray(items)) throw badRequest("Lista de produse lipsește");
    const seen = new Set();
    const rows = [];
    items.forEach((it, i) => {
      const product = idOf(it?.product);
      if (!isUuid(String(product)) || seen.has(String(product))) return;
      const price = Number(it.price);
      if (!(price >= 0) || it.price === "" || it.price == null) throw badRequest(`Completați prețul pentru produsul ${i + 1}`);
      seen.add(String(product));
      rows.push({ customerId, productId: product, price: Math.round(price * 100) / 100, position: i });
    });
    await db().begin(async (t) => {
      await t`delete from customer_prices where customer_id = ${customerId}`;
      if (rows.length) await t`insert into customer_prices ${t(rows, "customerId", "productId", "price", "position")}`;
    });
    return list(customerId);
  },
  { perm: "customers.manage" }
);
