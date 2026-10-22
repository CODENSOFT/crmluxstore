import { db, idOf, isUuid, likeOf, where } from "./db";
import { UNITS } from "./constants";
import { badRequest, round2 } from "./api";

const FIELDS = [
  "name", "description", "sku", "barcode", "brand", "packaging", "unit", "price", "wholesalePrice",
  "costPrice", "vatRate", "minStock", "active", "tags", "category", "externalId", "photo",
];
const NUMERIC = ["price", "wholesalePrice", "costPrice", "vatRate", "minStock"];
export const MAX_PHOTOS = 10;

// Normalizeaza campurile primite (formular / API / import) -> coloane DB (camelCase)
export function pickProductFields(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  for (const f of NUMERIC) {
    if (out[f] === undefined) continue;
    if (out[f] === "" || out[f] === null) out[f] = f === "price" ? 0 : null;
    else {
      const n = Number(out[f]);
      if (!(n >= 0)) throw badRequest(`Valoare invalidă pentru ${f}`);
      out[f] = f === "minStock" || f === "vatRate" ? n : round2(n);
    }
  }
  if (out.unit !== undefined && !UNITS.includes(out.unit)) throw badRequest("Unitate de măsură invalidă");
  if (out.name !== undefined) {
    out.name = String(out.name).trim();
    if (!out.name) throw badRequest("Denumirea produsului este obligatorie");
  }
  for (const f of ["sku", "barcode", "brand", "packaging", "externalId", "description"]) {
    if (out[f] !== undefined) out[f] = out[f] ? String(out[f]).trim() : null;
  }
  // Fotografii: `photos` = toata galeria (max 10), prima e cea principala (si in `photo`).
  // Daca vine doar `photo` (API / import vechi), devine galeria cu o singura imagine.
  if (body.photos !== undefined) {
    const list = (Array.isArray(body.photos) ? body.photos : [])
      .map((x) => String(x || "").trim())
      .filter((x) => /^data:image\/[a-z+.-]+;base64,/i.test(x) || /^https?:\/\//i.test(x))
      .slice(0, MAX_PHOTOS);
    out.photos = db().json(list);
    out.photo = list[0] || null;
  } else if (out.photo !== undefined) {
    out.photo = out.photo || null;
    out.photos = db().json(out.photo ? [out.photo] : []);
  }
  if (out.active !== undefined) out.active = !!out.active;
  if (out.category !== undefined) {
    const c = idOf(out.category);
    out.categoryId = isUuid(String(c)) ? c : null;
    delete out.category;
  }
  if (typeof out.tags === "string") out.tags = out.tags.split(",").map((t) => t.trim()).filter(Boolean);
  if (out.tags !== undefined && !Array.isArray(out.tags)) out.tags = [];
  return out;
}

// Componentele unui set / kit
export async function buildComponents(raw, selfId, q = db()) {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((c) => idOf(c?.product)).filter((x) => isUuid(String(x)));
  if (!ids.length) return [];
  const found = await q`select id, name from products where id in ${q(ids)}`;
  const byId = new Map(found.map((p) => [String(p._id), p]));
  const out = [];
  for (const c of raw) {
    const p = byId.get(String(idOf(c?.product)));
    if (!p || String(p._id) === String(selfId)) continue;
    const qn = Number(c.quantity) || 1;
    if (qn > 0) out.push({ product: p._id, productName: p.name, quantity: qn });
  }
  return out;
}

export async function assertUniqueSku(sku, exceptId, q = db()) {
  if (!sku) return;
  const [dup] = await q`
    select name from products where lower(sku) = ${sku.toLowerCase()}
    ${exceptId ? q`and id <> ${exceptId}` : q``} limit 1`;
  if (dup) throw badRequest(`Codul (SKU) „${sku}” este deja folosit de „${dup.name}”`);
}

// Stocul produsului ca lista [{ warehouse, quantity }] (warehouse = id sau obiect cu nume)
export function stockJson(q, { populated = false } = {}) {
  return populated
    ? q`coalesce((select json_agg(json_build_object('warehouse', json_build_object('_id', w.id, 'name', w.name, 'code', w.code), 'quantity', s.quantity) order by w.is_default desc, w.name)
                 from stock s join warehouses w on w.id = s.warehouse_id where s.product_id = p.id), '[]'::json)`
    : q`coalesce((select json_agg(json_build_object('warehouse', s.warehouse_id, 'quantity', s.quantity))
                 from stock s where s.product_id = p.id), '[]'::json)`;
}

export function photoUrlOf(p) {
  if (!p.hasPhoto) return null;
  if (p.photoLink) return p.photoLink;
  return `/api/products/${p._id}/photo?v=${new Date(p.updatedAt || 0).getTime()}`;
}

const SORTS = {
  name: "lower(name) asc",
  "-name": "lower(name) desc",
  price: "price asc",
  "-price": "price desc",
  stock: "total_stock asc",
  "-stock": "total_stock desc",
  "-createdAt": "created_at desc",
  "-updatedAt": "updated_at desc",
};

/**
 * Lista de produse fara fotografii (raspuns mic), cu stoc total, stare stoc si categorie.
 * opts: { q, category, brand, status: in|low|out, active, warehouse, sort, skip, limit, threshold, ids }
 */
export async function listProducts(opts = {}) {
  const sql = db();
  const conds = [];
  if (opts.q?.trim()) {
    const l = likeOf(opts.q.trim());
    conds.push(sql`(p.name ilike ${l} or p.sku ilike ${l} or p.barcode ilike ${l} or p.brand ilike ${l})`);
  }
  if (isUuid(String(opts.category || ""))) conds.push(sql`p.category_id = ${opts.category}`);
  if (opts.brand) conds.push(sql`p.brand = ${opts.brand}`);
  if (opts.active === "1") conds.push(sql`p.active`);
  if (opts.active === "0") conds.push(sql`not p.active`);
  if (opts.ids?.length) conds.push(sql`p.id in ${sql(opts.ids)}`);
  const wh = isUuid(String(opts.warehouse || "")) ? opts.warehouse : null;
  const threshold = opts.threshold ?? 5;

  const base = sql`
    select p.id, p.name, p.sku, p.barcode, p.category_id as category, p.brand, p.packaging, p.unit, p.price,
           p.wholesale_price, p.cost_price, p.vat_rate, p.min_stock, p.is_composite, p.components, p.tags, p.active,
           p.external_id, p.woo_id, p.woo_parent_id, p.source, p.created_at, p.updated_at,
           c.name as category_name,
           (p.photo is not null and p.photo <> '') as has_photo,
           case when p.photo ~ '^https?://' then p.photo end as photo_link,
           ${stockJson(sql)} as stock,
           coalesce((select sum(s.quantity) from stock s where s.product_id = p.id ${wh ? sql`and s.warehouse_id = ${wh}` : sql``}), 0) as total_stock,
           coalesce(p.min_stock, ${threshold}) as stock_limit
    from products p left join categories c on c.id = p.category_id
    where ${where(conds)}`;

  const statusFilter = opts.status ? sql`where stock_status = ${opts.status}` : sql``;
  const order = sql.unsafe(SORTS[opts.sort] || SORTS.name);
  const limit = opts.limit ? sql`limit ${opts.limit} offset ${opts.skip || 0}` : sql``;
  const rows = await sql`
    with b as (
      select b0.*, case when b0.total_stock <= 0 then 'out' when b0.total_stock <= b0.stock_limit then 'low' else 'in' end as stock_status
      from (${base}) b0
    )
    select *, count(*) over () as full_count from b ${statusFilter}
    order by ${order}, id ${limit}`;
  const total = rows[0]?.fullCount || 0;
  const items = rows.map(({ fullCount: _fullCount, ...p }) => ({ ...p, photoUrl: photoUrlOf(p) }));
  return { items, total };
}

// Rezolva categoria dupa id / externalId / nume (cu creare optionala)
export async function resolveCategory({ categoryId, categoryExternalId, categoryName } = {}, { create = true } = {}, q = db()) {
  if (isUuid(String(categoryId || ""))) {
    const [c] = await q`select id from categories where id = ${categoryId}`;
    if (c) return c._id;
  }
  if (categoryExternalId) {
    const [c] = await q`select id from categories where external_id = ${String(categoryExternalId)} limit 1`;
    if (c) return c._id;
  }
  if (categoryName) {
    const name = String(categoryName).trim();
    const [c] = await q`select id from categories where lower(name) = ${name.toLowerCase()} limit 1`;
    if (c) return c._id;
    if (create && name) {
      const [n] = await q`insert into categories ${q({ name, externalId: categoryExternalId ? String(categoryExternalId) : null })} returning id`;
      return n._id;
    }
  }
  return undefined;
}

// Rezolva depozitul dupa id / externalId / cod / nume
export async function resolveWarehouse(ref, q = db()) {
  if (!ref) return null;
  if (typeof ref === "object") ref = ref.id || ref._id || ref.externalId || ref.code || ref.name;
  const s = String(ref).trim();
  if (isUuid(s)) {
    const [w] = await q`select * from warehouses where id = ${s}`;
    if (w) return w;
  }
  const [w] = await q`
    select * from warehouses
    where external_id = ${s} or lower(code) = ${s.toLowerCase()} or lower(name) = ${s.toLowerCase()}
    order by (external_id = ${s}) desc nulls last, (lower(code) = ${s.toLowerCase()}) desc nulls last
    limit 1`;
  return w || null;
}

// Rezolva produsul dupa productId / externalId / sku / barcode
export async function resolveProduct(ref, q = db()) {
  if (!ref) return null;
  const { productId, id, _id, externalId, sku, barcode } = typeof ref === "object" ? ref : { productId: ref };
  const pid = productId || id || _id;
  const one = async (frag) => {
    const [p] = await q`select id, name, sku, barcode, unit, price, wholesale_price, cost_price, external_id, active from products where ${frag} limit 1`;
    return p || null;
  };
  if (pid && isUuid(String(pid))) {
    const p = await one(q`id = ${pid}`);
    if (p) return p;
  }
  if (externalId) {
    const p = await one(q`external_id = ${String(externalId)}`);
    if (p) return p;
  }
  if (sku) {
    const p = await one(q`lower(sku) = ${String(sku).trim().toLowerCase()}`);
    if (p) return p;
  }
  if (barcode) {
    const p = await one(q`barcode = ${String(barcode).trim()}`);
    if (p) return p;
  }
  if (typeof ref === "string" && !isUuid(ref)) return one(q`lower(sku) = ${ref.trim().toLowerCase()} or barcode = ${ref.trim()}`);
  return null;
}
