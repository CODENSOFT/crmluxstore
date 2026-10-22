import { db } from "@/lib/db";
import { route, readJson, pagination, badRequest } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { listProducts, pickProductFields, buildComponents, assertUniqueSku, stockJson } from "@/lib/products";
import { applyMovements } from "@/lib/stock";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { productDTO } from "@/lib/dto";
import { csvResponse } from "@/lib/csv";
import { UNIT_LABELS } from "@/lib/constants";

// Lista produse: ?q=&category=&brand=&status=in|low|out&active=1&warehouse=&sort=&page=&limit=
// ?light=1 -> toate produsele active, campuri minime (pentru selectoare in formulare)
export const GET = route(async ({ query }) => {
  const settings = await getSettings();
  const sql = db();
  if (query.get("light") === "1") {
    return sql`
      select p.id, p.name, p.sku, p.barcode, p.unit, p.price, p.wholesale_price, p.cost_price, p.category_id as category,
             p.brand, p.packaging, p.is_composite, ${stockJson(sql)} as stock
      from products p where p.active order by lower(p.name)`;
  }
  const { page, limit, skip } = pagination(query, { defLimit: 50, maxLimit: 2000 });
  const opts = {
    q: query.get("q") || "",
    category: query.get("category") || "",
    brand: query.get("brand") || "",
    status: query.get("status") || "",
    active: query.get("active") ?? "1",
    warehouse: query.get("warehouse") || "",
    sort: query.get("sort") || "name",
    threshold: settings.lowStockThreshold,
  };
  if (query.get("format") === "csv") {
    const { items } = await listProducts(opts);
    return csvResponse(
      items.map((p) => ({
        Denumire: p.name,
        SKU: p.sku || "",
        "Cod de bare": p.barcode || "",
        Categorie: p.categoryName || "",
        Marca: p.brand || "",
        Ambalaj: p.packaging || "",
        Unitate: UNIT_LABELS[p.unit] || p.unit,
        "Preț amănunt": p.price || 0,
        "Preț angro": p.wholesalePrice ?? "",
        "Preț achiziție": p.costPrice ?? "",
        "Stoc total": p.totalStock,
        "Stoc minim": p.minStock ?? settings.lowStockThreshold,
        Activ: p.active === false ? "nu" : "da",
      })),
      `produse_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }
  const [{ items, total }, brands] = await Promise.all([
    listProducts({ ...opts, skip, limit }),
    sql`select distinct brand from products where brand is not null and brand <> '' order by brand`,
  ]);
  return { items, total, page, limit, brands: brands.map((b) => b.brand) };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  const sql = db();
  const fields = pickProductFields(body);
  if (!fields.name) throw badRequest("Denumirea produsului este obligatorie");
  await assertUniqueSku(fields.sku);
  const isComposite = !!body.isComposite;
  const [created] = await sql`insert into products ${sql({ unit: "bucata", ...fields, isComposite })} returning id, name, price`;
  if (isComposite) {
    const components = await buildComponents(body.components, created._id);
    await sql`update products set components = ${sql.json(components)} where id = ${created._id}`;
  }

  // Stoc initial: [{ warehouse, quantity }] (sau warehouse + quantity, compatibilitate)
  const initial = Array.isArray(body.initialStock)
    ? body.initialStock
    : body.warehouse && Number(body.quantity) > 0
      ? [{ warehouse: body.warehouse, quantity: body.quantity }]
      : [];
  const lines = initial
    .filter((s) => s.warehouse && Number(s.quantity) > 0)
    .map((s) => ({ product: created._id, warehouse: s.warehouse, qty: Number(s.quantity), type: "initial", unitCost: fields.costPrice }));
  if (lines.length) await applyMovements(lines, { refType: "Product", refId: created._id, user, note: "Stoc inițial la creare" });

  await logAudit({
    action: "product_created",
    category: "product",
    entity: created,
    entityName: created.name,
    user,
    details: `„${created.name}” · preț ${created.price}${lines.length ? ` · stoc inițial ${lines.reduce((s, l) => s + l.qty, 0)}` : ""}`,
  });
  const [fresh] = await sql`select p.*, ${stockJson(sql)} as stock from products p where p.id = ${created._id}`;
  delete fresh.photo;
  delete fresh.photos;
  emit("product.created", () => productDTO(fresh));
  return fresh;
}, { perm: "products.manage" });
