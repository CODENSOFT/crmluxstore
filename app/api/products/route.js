import mongoose from "mongoose";
import Product from "@/models/Product";
import { route, readJson, pagination } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { listProducts, pickProductFields, buildComponents, assertUniqueSku } from "@/lib/products";
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
  if (query.get("light") === "1") {
    const list = await Product.find({ active: { $ne: false } })
      .select("name sku barcode unit price wholesalePrice costPrice stock category brand packaging isComposite")
      .sort({ name: 1 })
      .lean();
    return list;
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
  const { items, total } = await listProducts({ ...opts, skip, limit });
  const brands = await Product.distinct("brand", { brand: { $nin: [null, ""] } });
  return { items, total, page, limit, brands: brands.sort() };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  const fields = pickProductFields(body);
  if (!fields.name) fields.name = "";
  await assertUniqueSku(fields.sku);
  const _id = new mongoose.Types.ObjectId();
  const isComposite = !!body.isComposite;
  const created = await Product.create({
    _id,
    ...fields,
    unit: fields.unit || "bucata",
    isComposite,
    components: isComposite ? await buildComponents(body.components, _id) : [],
  });

  // Stoc initial: [{ warehouse, quantity }] (sau warehouse + quantity, compatibilitate)
  const initial = Array.isArray(body.initialStock)
    ? body.initialStock
    : body.warehouse && Number(body.quantity) > 0
      ? [{ warehouse: body.warehouse, quantity: body.quantity }]
      : [];
  const lines = initial
    .filter((s) => s.warehouse && Number(s.quantity) > 0)
    .map((s) => ({ product: _id, warehouse: s.warehouse, qty: Number(s.quantity), type: "initial", unitCost: fields.costPrice }));
  if (lines.length) await applyMovements(lines, { refType: "Product", refId: _id, user, note: "Stoc inițial la creare" });

  await logAudit({
    action: "product_created",
    category: "product",
    entity: created,
    entityName: created.name,
    user,
    details: `„${created.name}” · preț ${created.price}${lines.length ? ` · stoc inițial ${lines.reduce((s, l) => s + l.qty, 0)}` : ""}`,
  });
  const fresh = await Product.findById(_id).lean();
  emit("product.created", () => productDTO(fresh));
  return fresh;
});
