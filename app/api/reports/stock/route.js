import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { ok, requireUser } from "@/lib/api";
import { csvResponse } from "@/lib/csv";

export async function GET(req) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  const warehouseId = searchParams.get("warehouse");
  const lowOnly = searchParams.get("low") === "1";

  const settings = await Settings.findOne();
  const threshold = settings?.lowStockThreshold ?? 5;

  const products = await Product.find().populate("stock.warehouse", "name");

  // Construim randuri per produs-depozit (filtrate optional dupa depozit)
  const rows = [];
  for (const p of products) {
    const entries = (p.stock || []).filter(
      (s) => !warehouseId || String(s.warehouse?._id || s.warehouse) === warehouseId
    );
    const total = (p.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
    if (lowOnly && total > threshold) continue;

    if (entries.length === 0) {
      rows.push({
        product: p.name,
        sku: p.sku || "",
        unit: p.unit,
        price: p.price || 0,
        warehouse: "—",
        quantity: 0,
        value: 0,
        total,
        low: total <= threshold,
      });
      continue;
    }
    for (const e of entries) {
      rows.push({
        product: p.name,
        sku: p.sku || "",
        unit: p.unit,
        price: p.price || 0,
        warehouse: e.warehouse?.name || "—",
        quantity: e.quantity,
        value: +((p.price || 0) * e.quantity).toFixed(2),
        total,
        low: total <= threshold,
      });
    }
  }

  if (format === "csv") {
    const csvRows = rows.map((r) => ({
      Produs: r.product,
      SKU: r.sku,
      Unitate: r.unit,
      "Pret unitar": r.price,
      Depozit: r.warehouse,
      Cantitate: r.quantity,
      Valoare: r.value,
    }));
    return csvResponse(csvRows, `raport_stoc_${Date.now()}.csv`);
  }

  const summary = {
    productCount: products.length,
    totalValue: +rows.reduce((s, r) => s + r.value, 0).toFixed(2),
    lowStockCount: rows.filter((r) => r.low).length,
    currency: settings?.currency || "MDL",
  };

  return ok({ summary, rows });
}
