import mongoose from "mongoose";
import { escapeRegex, dateRange, pagination } from "./api";
import { docLines } from "./dto";

// Lista generica pentru documentele de stoc (receptii, transferuri, casari, inventarieri)
export async function listDocs(Model, query, { populate = [], warehouseFields = ["warehouse"], extraFilter = {} } = {}) {
  const f = { ...extraFilter, ...dateRange(query) };
  const q = query.get("q")?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    f.$or = [{ number: rx }, { "items.productName": rx }, { productName: rx }, { supplier: rx }, { note: rx }];
  }
  const w = query.get("warehouse");
  if (w && mongoose.isValidObjectId(w)) {
    const or = warehouseFields.map((k) => ({ [k]: new mongoose.Types.ObjectId(w) }));
    f.$and = [...(f.$and || []), { $or: or }];
  }
  if (query.get("supplier")) f.supplierId = query.get("supplier");
  if (query.get("status")) f.status = query.get("status");
  const { page, limit, skip } = pagination(query, { defLimit: 30 });
  let qy = Model.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit);
  for (const [p, s] of populate) qy = qy.populate(p, s);
  const [items, total] = await Promise.all([qy.lean(), Model.countDocuments(f)]);
  return {
    items: items.map((d) => {
      const lines = docLines(d);
      return { ...d, items: lines, linesCount: lines.length, totalQty: lines.reduce((s, l) => s + (l.quantity || 0), 0) };
    }),
    total,
    page,
    limit,
  };
}
