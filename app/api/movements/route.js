import mongoose from "mongoose";
import StockMovement from "@/models/StockMovement";
import { route, pagination, dateRange, escapeRegex } from "@/lib/api";
import { csvResponse } from "@/lib/csv";
import { MOVEMENT_TYPES } from "@/lib/constants";

export const GET = route(async ({ query }) => {
  const f = { ...dateRange(query) };
  for (const k of ["product", "warehouse"]) {
    const v = query.get(k);
    if (v && mongoose.isValidObjectId(v)) f[k] = new mongoose.Types.ObjectId(v);
  }
  if (query.get("type")) f.type = query.get("type");
  const q = query.get("q")?.trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: "i" };
    f.$or = [{ productName: rx }, { sku: rx }, { refNumber: rx }, { userName: rx }];
  }
  if (query.get("format") === "csv") {
    const items = await StockMovement.find(f).populate("warehouse", "name").sort({ createdAt: -1 }).limit(20000).lean();
    return csvResponse(
      items.map((m) => ({
        Data: new Date(m.createdAt).toLocaleString("ro-RO"),
        Tip: MOVEMENT_TYPES[m.type]?.label || m.type,
        Produs: m.productName || "",
        SKU: m.sku || "",
        Depozit: m.warehouse?.name || "",
        Cantitate: m.quantity,
        "Sold după": m.balanceAfter ?? "",
        Document: m.refNumber || "",
        Utilizator: m.userName || "",
        Notă: m.note || "",
      })),
      `miscari_stoc_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }
  const { page, limit, skip } = pagination(query, { defLimit: 50 });
  const [items, total] = await Promise.all([
    StockMovement.find(f).populate("warehouse", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StockMovement.countDocuments(f),
  ]);
  return { items, total, page, limit };
});
