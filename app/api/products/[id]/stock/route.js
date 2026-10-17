import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { applyMovements } from "@/lib/stock";
import { stockJson } from "@/lib/products";
import { logAudit } from "@/lib/audit";

// Corectie manuala de stoc (doar admin): seteaza cantitatea exacta intr-un depozit
export const POST = route(
  async ({ req, params, user }) => {
    const { warehouse, quantity, note } = await readJson(req);
    if (!warehouse) throw badRequest("Alegeți depozitul");
    const q = Number(quantity);
    if (!(q >= 0)) throw badRequest("Cantitatea trebuie să fie 0 sau mai mare");
    if (!isUuid(params.id)) throw notFound("Produsul nu există");
    const sql = db();
    const [product] = await sql`select id, name from products where id = ${params.id}`;
    if (!product) throw notFound("Produsul nu există");
    const [r] = await applyMovements([{ product: product._id, warehouse, set: q, type: "adjustment" }], {
      refType: "Product",
      refId: product._id,
      user,
      note: note || "Corecție manuală",
    });
    await logAudit({
      action: "stock_adjusted",
      category: "stock",
      entity: product,
      entityName: product.name,
      user,
      details: `Stoc setat la ${q} (diferență ${r?.delta ?? 0})${note ? ` · ${note}` : ""}`,
    });
    const [fresh] = await sql`select p.id, p.name, ${stockJson(sql, { populated: true })} as stock from products p where p.id = ${product._id}`;
    return fresh;
  },
  { auth: "admin" }
);
