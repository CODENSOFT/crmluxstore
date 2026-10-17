import mongoose from "mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Warehouse from "@/models/Warehouse";
import { UNITS } from "./constants";
import { badRequest, escapeRegex, round2 } from "./api";

const oid = (x) => new mongoose.Types.ObjectId(String(x));

const FIELDS = [
  "name", "description", "sku", "barcode", "brand", "packaging", "unit", "price", "wholesalePrice",
  "costPrice", "vatRate", "minStock", "active", "tags", "category", "externalId", "photo",
];
const NUMERIC = ["price", "wholesalePrice", "costPrice", "vatRate", "minStock"];

// Normalizeaza campurile primite (formular / API / import)
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
  for (const f of ["sku", "barcode", "brand", "packaging", "externalId"]) {
    if (out[f] !== undefined) out[f] = out[f] ? String(out[f]).trim() : undefined;
  }
  if (out.category === "") out.category = null;
  if (typeof out.tags === "string") out.tags = out.tags.split(",").map((t) => t.trim()).filter(Boolean);
  return out;
}

// Componentele unui set / kit
export async function buildComponents(raw, selfId) {
  if (!Array.isArray(raw)) return [];
  const ids = raw.map((c) => c?.product).filter(Boolean);
  const found = await Product.find({ _id: { $in: ids } }).select("name").lean();
  const byId = new Map(found.map((p) => [String(p._id), p]));
  const out = [];
  for (const c of raw) {
    const p = byId.get(String(c?.product));
    if (!p || String(p._id) === String(selfId)) continue;
    const q = Number(c.quantity) || 1;
    if (q > 0) out.push({ product: p._id, productName: p.name, quantity: q });
  }
  return out;
}

export async function assertUniqueSku(sku, exceptId) {
  if (!sku) return;
  const dup = await Product.findOne({
    sku: { $regex: `^${escapeRegex(sku)}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
    .select("name")
    .lean();
  if (dup) throw badRequest(`Codul (SKU) „${sku}” este deja folosit de „${dup.name}”`);
}

export function photoUrlOf(p) {
  if (!p.photoKind) return null;
  if (p.photoKind === "url") return p.photoLink;
  return `/api/products/${p._id}/photo?v=${new Date(p.updatedAt || 0).getTime()}`;
}

/**
 * Lista de produse fara fotografii (raspuns mic), cu stoc total, stare stoc si categorie.
 * opts: { q, category, brand, status: in|low|out, active, warehouse, sort, skip, limit, threshold }
 */
export async function listProducts(opts = {}) {
  const match = {};
  if (opts.q) {
    const rx = { $regex: escapeRegex(opts.q.trim()), $options: "i" };
    match.$or = [{ name: rx }, { sku: rx }, { barcode: rx }, { brand: rx }];
  }
  if (opts.category) match.category = oid(opts.category);
  if (opts.brand) match.brand = opts.brand;
  if (opts.active === "1") match.active = { $ne: false };
  if (opts.active === "0") match.active = false;
  if (opts.ids) match._id = { $in: opts.ids.map(oid) };

  const threshold = opts.threshold ?? 5;
  const wh = opts.warehouse ? oid(opts.warehouse) : null;
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        totalStock: wh
          ? {
              $sum: {
                $map: {
                  input: { $filter: { input: "$stock", cond: { $eq: ["$$this.warehouse", wh] } } },
                  in: "$$this.quantity",
                },
              },
            }
          : { $sum: "$stock.quantity" },
        stockLimit: { $ifNull: ["$minStock", threshold] },
        photoKind: {
          $cond: [
            { $regexMatch: { input: { $ifNull: ["$photo", ""] }, regex: "^https?://" } },
            "url",
            { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$photo", ""] } }, 0] }, "data", null] },
          ],
        },
        photoLink: {
          $cond: [{ $regexMatch: { input: { $ifNull: ["$photo", ""] }, regex: "^https?://" } }, "$photo", null],
        },
      },
    },
    {
      $addFields: {
        stockStatus: {
          $cond: [{ $lte: ["$totalStock", 0] }, "out", { $cond: [{ $lte: ["$totalStock", "$stockLimit"] }, "low", "in"] }],
        },
      },
    },
  ];
  if (opts.status) pipeline.push({ $match: { stockStatus: opts.status } });

  const sorts = {
    name: { name: 1 },
    "-name": { name: -1 },
    price: { price: 1 },
    "-price": { price: -1 },
    stock: { totalStock: 1 },
    "-stock": { totalStock: -1 },
    "-createdAt": { createdAt: -1 },
    "-updatedAt": { updatedAt: -1 },
  };
  pipeline.push({ $project: { photo: 0, description: 0 } });

  const facet = {
    items: [{ $sort: { ...(sorts[opts.sort] || { name: 1 }), _id: 1 } }],
    total: [{ $count: "n" }],
  };
  if (opts.skip) facet.items.push({ $skip: opts.skip });
  if (opts.limit) facet.items.push({ $limit: opts.limit });
  facet.items.push(
    { $lookup: { from: "categories", localField: "category", foreignField: "_id", as: "cat", pipeline: [{ $project: { name: 1 } }] } },
    { $addFields: { categoryName: { $first: "$cat.name" } } },
    { $project: { cat: 0 } }
  );
  pipeline.push({ $facet: facet });

  const [res] = await Product.aggregate(pipeline);
  const items = (res?.items || []).map((p) => ({ ...p, photoUrl: photoUrlOf(p) }));
  return { items, total: res?.total?.[0]?.n || 0 };
}

// Rezolva categoria dupa id / externalId / nume (cu creare optionala)
export async function resolveCategory({ categoryId, categoryExternalId, categoryName }, { create = true } = {}) {
  if (categoryId && mongoose.isValidObjectId(categoryId)) {
    const c = await Category.findById(categoryId).select("_id").lean();
    if (c) return c._id;
  }
  if (categoryExternalId) {
    const c = await Category.findOne({ externalId: String(categoryExternalId) }).select("_id").lean();
    if (c) return c._id;
  }
  if (categoryName) {
    const name = String(categoryName).trim();
    const c = await Category.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } }).select("_id").lean();
    if (c) return c._id;
    if (create && name) return (await Category.create({ name, externalId: categoryExternalId || undefined }))._id;
  }
  return undefined;
}

// Rezolva depozitul dupa id / cod / externalId / nume
export async function resolveWarehouse(ref) {
  if (!ref) return null;
  if (typeof ref === "object") ref = ref.id || ref.externalId || ref.code || ref.name;
  const s = String(ref).trim();
  if (mongoose.isValidObjectId(s)) {
    const w = await Warehouse.findById(s).lean();
    if (w) return w;
  }
  return (
    (await Warehouse.findOne({ externalId: s }).lean()) ||
    (await Warehouse.findOne({ code: { $regex: `^${escapeRegex(s)}$`, $options: "i" } }).lean()) ||
    (await Warehouse.findOne({ name: { $regex: `^${escapeRegex(s)}$`, $options: "i" } }).lean())
  );
}

// Rezolva produsul dupa productId / externalId / sku / barcode
export async function resolveProduct(ref) {
  if (!ref) return null;
  const { productId, id, externalId, sku, barcode } = typeof ref === "object" ? ref : { productId: ref };
  const pid = productId || id;
  if (pid && mongoose.isValidObjectId(pid)) {
    const p = await Product.findById(pid);
    if (p) return p;
  }
  if (externalId) {
    const p = await Product.findOne({ externalId: String(externalId) });
    if (p) return p;
  }
  if (sku) {
    const p = await Product.findOne({ sku: { $regex: `^${escapeRegex(String(sku).trim())}$`, $options: "i" } });
    if (p) return p;
  }
  if (barcode) {
    const p = await Product.findOne({ barcode: String(barcode).trim() });
    if (p) return p;
  }
  if (typeof ref === "string" && !mongoose.isValidObjectId(ref)) {
    return Product.findOne({ sku: { $regex: `^${escapeRegex(ref.trim())}$`, $options: "i" } });
  }
  return null;
}
