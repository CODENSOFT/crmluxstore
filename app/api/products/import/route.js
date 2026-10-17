import { db } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { pickProductFields, resolveCategory, resolveWarehouse } from "@/lib/products";
import { applyMovements } from "@/lib/stock";
import { logAudit } from "@/lib/audit";
import { UNITS, UNIT_LABELS } from "@/lib/constants";

export const maxDuration = 300;

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
    const sql = db();
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
        if (r.category) fields.categoryId = await resolveCategory({ categoryName: r.category });

        let p = null;
        if (fields.sku) [p] = await sql`select id from products where lower(sku) = ${fields.sku.toLowerCase()} limit 1`;
        if (!p && fields.barcode) [p] = await sql`select id from products where barcode = ${fields.barcode} limit 1`;
        if (!p && fields.name) [p] = await sql`select id from products where lower(name) = ${fields.name.toLowerCase()} limit 1`;

        let isNew = false;
        if (p) {
          if (Object.keys(fields).length) await sql`update products set ${sql(fields, ...Object.keys(fields))} where id = ${p._id}`;
          stats.updated++;
        } else {
          if (!fields.name) throw new Error("lipsește denumirea");
          [p] = await sql`insert into products ${sql({ unit: "bucata", ...fields })} returning id`;
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
    await logAudit({ action: "products_imported", category: "product", user, details: `Import: ${stats.created} noi, ${stats.updated} actualizate, ${stats.failed} erori` });
    return stats;
  },
  { auth: "admin" }
);
