import Product from "@/models/Product";
import { route, readJson, badRequest, escapeRegex } from "@/lib/api";
import { pickProductFields, resolveCategory, resolveWarehouse } from "@/lib/products";
import { applyMovements } from "@/lib/stock";
import { logAudit } from "@/lib/audit";
import { UNITS, UNIT_LABELS } from "@/lib/constants";

// Unitatea poate veni ca eticheta ("buc.", "l") sau ca nume intern
const UNIT_ALIASES = Object.fromEntries([
  ...UNITS.map((u) => [u, u]),
  ...Object.entries(UNIT_LABELS).map(([k, v]) => [v.toLowerCase(), k]),
  ["buc", "bucata"], ["bucată", "bucata"], ["l", "litri"], ["litru", "litri"], ["m", "metru"],
]);

/**
 * Import produse din CSV/Excel (randurile sunt parsate in browser).
 * rows: [{ name, sku, barcode, category, brand, packaging, unit, price, wholesalePrice, costPrice, minStock, description, warehouse, quantity }]
 */
export const POST = route(
  async ({ req, user }) => {
    const { rows } = await readJson(req);
    if (!Array.isArray(rows) || !rows.length) throw badRequest("Fișierul nu conține rânduri");
    if (rows.length > 5000) throw badRequest("Maximum 5000 de rânduri per import");
    const stats = { created: 0, updated: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const unit = r.unit ? UNIT_ALIASES[String(r.unit).trim().toLowerCase()] : undefined;
        const fields = pickProductFields({
          name: r.name,
          sku: r.sku,
          barcode: r.barcode,
          brand: r.brand,
          packaging: r.packaging,
          description: r.description,
          unit,
          price: r.price,
          wholesalePrice: r.wholesalePrice,
          costPrice: r.costPrice,
          minStock: r.minStock,
        });
        for (const k of Object.keys(fields)) if (fields[k] === undefined || fields[k] === null || fields[k] === "") delete fields[k];
        if (r.category) fields.category = await resolveCategory({ categoryName: r.category });

        let p = null;
        if (fields.sku) p = await Product.findOne({ sku: { $regex: `^${escapeRegex(fields.sku)}$`, $options: "i" } });
        if (!p && fields.barcode) p = await Product.findOne({ barcode: fields.barcode });
        if (!p && fields.name) p = await Product.findOne({ name: { $regex: `^${escapeRegex(fields.name)}$`, $options: "i" } });

        let isNew = false;
        if (p) {
          Object.assign(p, fields);
          await p.save();
          stats.updated++;
        } else {
          if (!fields.name) throw new Error("lipsește denumirea");
          p = await Product.create({ unit: "bucata", ...fields });
          isNew = true;
          stats.created++;
        }

        if (r.warehouse && r.quantity !== undefined && r.quantity !== "") {
          const w = await resolveWarehouse(r.warehouse);
          if (!w) throw new Error(`depozit necunoscut „${r.warehouse}”`);
          const q = Number(String(r.quantity).replace(",", "."));
          if (q >= 0) {
            await applyMovements([{ product: p._id, warehouse: w._id, set: q, type: isNew ? "initial" : "adjustment" }], {
              refType: "Product",
              refId: p._id,
              user,
              note: "Import din fișier",
              silent: true,
            });
          }
        }
      } catch (e) {
        stats.failed++;
        if (stats.errors.length < 30) stats.errors.push(`Rândul ${i + 2}: ${e.message}`);
      }
    }
    await logAudit({
      action: "products_imported",
      category: "product",
      user,
      details: `Import: ${stats.created} noi, ${stats.updated} actualizate, ${stats.failed} erori`,
    });
    return stats;
  },
  { auth: "admin" }
);
