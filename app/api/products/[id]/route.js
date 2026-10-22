import { db, isUuid } from "@/lib/db";
import { route, readJson, notFound } from "@/lib/api";
import { pickProductFields, buildComponents, assertUniqueSku, stockJson } from "@/lib/products";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { productDTO } from "@/lib/dto";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";

async function loadFull(id) {
  const sql = db();
  const [p] = await sql`
    select p.*, ${stockJson(sql, { populated: true })} as stock,
      (select json_build_object('_id', c.id, 'name', c.name) from categories c where c.id = p.category_id) as category,
      coalesce((select json_agg(json_build_object(
          'product', json_build_object('_id', cp.id, 'name', cp.name, 'sku', cp.sku, 'unit', cp.unit),
          'productName', comp->>'productName', 'quantity', (comp->>'quantity')::numeric))
        from jsonb_array_elements(p.components) comp
        left join products cp on cp.id = (comp->>'product')::uuid), '[]'::json) as components
    from products p where p.id = ${id}`;
  return p || null;
}

export const GET = route(async ({ params }) => {
  if (!isUuid(params.id)) throw notFound("Produsul nu există");
  const product = await loadFull(params.id);
  if (!product) throw notFound("Produsul nu există");
  const sql = db();
  const since90 = new Date(Date.now() - 90 * 86400000);
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [[sales], [lastArrival]] = await Promise.all([
    sql`
      select coalesce(sum(i.quantity), 0) as qty90,
             coalesce(sum(i.line_total), 0) as revenue90,
             coalesce(sum(i.quantity) filter (where o.created_at >= ${since30}), 0) as qty30,
             count(distinct o.id)::int as orders90
      from order_items i join orders o on o.id = i.order_id
      where i.product_id = ${params.id} and o.status in ${sql(SALE_STAGE_KEYS)} and o.created_at >= ${since90}`,
    sql`select created_at from stock_movements where product_id = ${params.id} and type = 'arrival' order by created_at desc limit 1`,
  ]);
  product.totalStock = (product.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
  product.stats = {
    qty30: sales?.qty30 || 0,
    qty90: sales?.qty90 || 0,
    revenue90: sales?.revenue90 || 0,
    orders90: sales?.orders90 || 0,
    lastArrivalAt: lastArrival?.createdAt || null,
  };
  return product;
});

export const PATCH = route(async ({ req, params, user }) => {
  if (!isUuid(params.id)) throw notFound("Produsul nu există");
  const body = await readJson(req);
  const sql = db();
  const [product] = await sql`select id, name, sku from products where id = ${params.id}`;
  if (!product) throw notFound("Produsul nu există");
  const fields = pickProductFields(body);
  if (fields.sku !== undefined && fields.sku !== product.sku) await assertUniqueSku(fields.sku, product._id);
  if (body.isComposite !== undefined) {
    fields.isComposite = !!body.isComposite;
    fields.components = sql.json(fields.isComposite ? await buildComponents(body.components, product._id) : []);
  }
  const keys = Object.keys(fields);
  if (keys.length) await sql`update products set ${sql(fields, ...keys)} where id = ${product._id}`;
  const changed = keys.filter((k) => !["photo", "photos", "components"].includes(k));
  await logAudit({
    action: "product_edited",
    category: "product",
    entity: product,
    entityName: fields.name || product.name,
    user,
    details: `Modificat: ${changed.join(", ")}${fields.photo !== undefined ? ", foto" : ""}`,
  });
  const [fresh] = await sql`select p.*, ${stockJson(sql)} as stock from products p where p.id = ${product._id}`;
  const dto = productDTO({ ...fresh, photo: undefined, photos: undefined });
  emit("product.updated", dto);
  return fresh;
}, { perm: "products.manage" });

// Produsele cu istoric (comenzi / miscari) se dezactiveaza, nu se sterg — istoricul ramane corect
export const DELETE = route(
  async ({ params, user }) => {
    if (!isUuid(params.id)) throw notFound("Produsul nu există");
    const sql = db();
    const [product] = await sql`select id, name, sku, external_id from products where id = ${params.id}`;
    if (!product) throw notFound("Produsul nu există");
    const [{ used }] = await sql`
      select (exists (select 1 from order_items where product_id = ${product._id})
           or exists (select 1 from stock_movements where product_id = ${product._id} and type <> 'initial')) as used`;
    if (used) {
      await sql`update products set active = false where id = ${product._id}`;
      await logAudit({ action: "product_edited", category: "product", entity: product, entityName: product.name, user, details: "Dezactivat (are istoric)" });
      return { deleted: false, deactivated: true };
    }
    await sql`delete from products where id = ${product._id}`;
    await logAudit({ action: "product_deleted", category: "product", entityName: product.name, user, details: `Șters „${product.name}”` });
    emit("product.deleted", { id: product._id, sku: product.sku || null, externalId: product.externalId || null });
    return { deleted: true };
  },
  { perm: ["products.manage", "delete"] }
);
