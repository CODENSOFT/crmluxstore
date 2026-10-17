import mongoose from "mongoose";
import Product from "@/models/Product";
import Order from "@/models/Order";
import StockMovement from "@/models/StockMovement";
import { route, readJson, notFound } from "@/lib/api";
import { pickProductFields, buildComponents, assertUniqueSku } from "@/lib/products";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { productDTO } from "@/lib/dto";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";

export const GET = route(async ({ params }) => {
  const product = await Product.findById(params.id)
    .populate("stock.warehouse", "name code")
    .populate("category", "name")
    .populate("components.product", "name sku unit stock")
    .lean();
  if (!product) throw notFound("Produsul nu există");

  const id = new mongoose.Types.ObjectId(params.id);
  const since90 = new Date(Date.now() - 90 * 86400000);
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [sales] = await Order.aggregate([
    { $match: { "items.product": id, status: { $in: SALE_STAGE_KEYS }, createdAt: { $gte: since90 } } },
    { $unwind: "$items" },
    { $match: { "items.product": id } },
    {
      $group: {
        _id: null,
        qty90: { $sum: "$items.quantity" },
        revenue90: { $sum: "$items.lineTotal" },
        qty30: { $sum: { $cond: [{ $gte: ["$createdAt", since30] }, "$items.quantity", 0] } },
        orders: { $addToSet: "$_id" },
      },
    },
  ]);
  const lastArrival = await StockMovement.findOne({ product: id, type: "arrival" }).sort({ createdAt: -1 }).lean();
  product.totalStock = (product.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
  product.stats = {
    qty30: sales?.qty30 || 0,
    qty90: sales?.qty90 || 0,
    revenue90: sales?.revenue90 || 0,
    orders90: sales?.orders?.length || 0,
    lastArrivalAt: lastArrival?.createdAt || null,
  };
  return product;
});

export const PATCH = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  const product = await Product.findById(params.id);
  if (!product) throw notFound("Produsul nu există");
  const fields = pickProductFields(body);
  if (fields.sku !== undefined && fields.sku !== product.sku) await assertUniqueSku(fields.sku, product._id);
  Object.assign(product, fields);
  if (body.isComposite !== undefined) {
    product.isComposite = !!body.isComposite;
    product.components = product.isComposite ? await buildComponents(body.components, product._id) : [];
  }
  await product.save();
  await logAudit({
    action: "product_edited",
    category: "product",
    entity: product,
    entityName: product.name,
    user,
    details: `Modificat: ${Object.keys(fields).filter((k) => k !== "photo").join(", ")}${fields.photo !== undefined ? ", foto" : ""}`,
  });
  const fresh = await Product.findById(product._id).lean();
  emit("product.updated", () => productDTO(fresh));
  return fresh;
});

// Produsele cu istoric (comenzi / miscari) se dezactiveaza, nu se sterg — istoricul ramane corect
export const DELETE = route(
  async ({ params, user }) => {
    const product = await Product.findById(params.id);
    if (!product) throw notFound("Produsul nu există");
    const used =
      (await Order.exists({ "items.product": product._id })) ||
      (await StockMovement.exists({ product: product._id, type: { $ne: "initial" } }));
    if (used) {
      product.active = false;
      await product.save();
      await logAudit({ action: "product_edited", category: "product", entity: product, entityName: product.name, user, details: "Dezactivat (are istoric)" });
      emit("product.updated", () => productDTO(product.toObject()));
      return { deleted: false, deactivated: true };
    }
    await product.deleteOne();
    await StockMovement.deleteMany({ product: product._id });
    await logAudit({ action: "product_deleted", category: "product", entityName: product.name, user, details: `Șters „${product.name}”` });
    emit("product.deleted", { id: String(product._id), sku: product.sku || null, externalId: product.externalId || null });
    return { deleted: true };
  },
  { auth: "admin" }
);
