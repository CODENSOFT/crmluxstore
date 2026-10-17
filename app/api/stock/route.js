import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { listProducts } from "@/lib/products";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";
import { csvResponse } from "@/lib/csv";
import { UNIT_LABELS } from "@/lib/constants";

// Situatia stocului: matrice produs × depozit, valori, stari, sugestii de reaprovizionare.
// ?view=reorder -> doar produsele sub prag, cu cantitatea sugerata (acoperire 30 zile)
export const GET = route(async ({ query }) => {
  const settings = await getSettings();
  const view = query.get("view");
  const sql = db();
  const warehouses = await sql`select * from warehouses where active order by is_default desc, lower(name)`;
  const { items } = await listProducts({
    q: query.get("q") || "",
    category: query.get("category") || "",
    status: view === "reorder" ? "" : query.get("status") || "",
    warehouse: query.get("warehouse") || "",
    active: "1",
    threshold: settings.lowStockThreshold,
    sort: query.get("sort") || "name",
  });

  let rows = items.map((p) => ({
    _id: p._id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    categoryName: p.categoryName,
    brand: p.brand,
    price: p.price || 0,
    costPrice: p.costPrice || 0,
    stockLimit: p.stockLimit,
    totalStock: p.totalStock,
    stockStatus: p.stockStatus,
    byWarehouse: Object.fromEntries((p.stock || []).map((s) => [String(s.warehouse), s.quantity])),
    value: (p.price || 0) * Math.max(0, p.totalStock),
    costValue: (p.costPrice || 0) * Math.max(0, p.totalStock),
  }));

  if (view === "reorder") {
    rows = rows.filter((r) => r.stockStatus !== "in");
    const ids = rows.map((r) => r._id);
    const sales = ids.length
      ? await sql`
          select i.product_id as id, sum(i.quantity) as qty
          from order_items i join orders o on o.id = i.order_id
          where o.status in ${sql(SALE_STAGE_KEYS)} and o.created_at >= now() - interval '30 days'
            and i.product_id in ${sql(ids)}
          group by i.product_id`
      : [];
    const sold = new Map(sales.map((s) => [String(s._id), s.qty]));
    rows = rows
      .map((r) => {
        const sold30 = sold.get(String(r._id)) || 0;
        const target = Math.max(sold30, r.stockLimit * 2, 1);
        return { ...r, sold30, suggested: Math.max(0, Math.ceil(target - r.totalStock)) };
      })
      .sort((a, b) => a.totalStock - a.stockLimit - (b.totalStock - b.stockLimit));
  }

  if (query.get("format") === "csv") {
    return csvResponse(
      rows.map((r) => ({
        Produs: r.name,
        SKU: r.sku || "",
        Categorie: r.categoryName || "",
        Unitate: UNIT_LABELS[r.unit] || r.unit,
        ...Object.fromEntries(warehouses.map((w) => [w.name, r.byWarehouse[String(w._id)] || 0])),
        "Stoc total": r.totalStock,
        "Stoc minim": r.stockLimit,
        ...(view === "reorder" ? { "Vândut 30 zile": r.sold30, "De comandat": r.suggested } : {}),
        "Preț achiziție": r.costPrice,
        "Valoare (preț vânzare)": +r.value.toFixed(2),
        "Valoare (cost)": +r.costValue.toFixed(2),
      })),
      `${view === "reorder" ? "de_comandat" : "stoc"}_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const summary = {
    positions: rows.length,
    value: rows.reduce((s, r) => s + r.value, 0),
    costValue: rows.reduce((s, r) => s + r.costValue, 0),
    low: rows.filter((r) => r.stockStatus === "low").length,
    out: rows.filter((r) => r.stockStatus === "out").length,
  };
  return { warehouses, rows, summary, currency: settings.currency };
});
