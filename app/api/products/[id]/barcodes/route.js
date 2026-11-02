import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// Coduri de bare suplimentare ale produsului (ambalaje diferite, coduri vechi, bax cu multiplicator)
async function product(id) {
  if (!isUuid(String(id))) throw notFound("Produsul nu există");
  const [p] = await db()`select id, name, barcode from products where id = ${id}`;
  if (!p) throw notFound("Produsul nu există");
  return p;
}

export const GET = route(async ({ params }) => {
  await product(params.id);
  return db()`select code, multiplier, note, created_at from product_barcodes where product_id = ${params.id} order by created_at`;
});

export const POST = route(
  async ({ req, params, user }) => {
    const p = await product(params.id);
    const b = await readJson(req);
    const code = String(b.code || "").trim().replace(/\s+/g, "");
    if (!code) throw badRequest("Introduceți codul");
    const multiplier = b.multiplier === undefined || b.multiplier === "" ? 1 : Number(String(b.multiplier).replace(",", "."));
    if (!(multiplier > 0)) throw badRequest("Multiplicatorul trebuie să fie mai mare ca 0");
    const sql = db();
    if (p.barcode === code) throw badRequest("Acesta este deja codul de bare principal al produsului");
    const [main] = await sql`select name from products where barcode = ${code} and id <> ${p._id} limit 1`;
    if (main) throw badRequest(`Codul este codul principal al produsului „${main.name}”`);
    const [other] = await sql`select p.name from product_barcodes b join products p on p.id = b.product_id where b.code = ${code} and b.product_id <> ${p._id}`;
    if (other) throw badRequest(`Codul este deja folosit de „${other.name}”`);
    await sql`insert into product_barcodes ${sql({ code, productId: p._id, multiplier, note: b.note ? String(b.note).slice(0, 200) : null })}
              on conflict (code) do update set multiplier = excluded.multiplier, note = excluded.note`;
    await logAudit({ action: "product_edited", category: "product", entity: p, entityName: p.name, user, details: `Cod de bare suplimentar ${code}${multiplier !== 1 ? ` (× ${multiplier})` : ""}` });
    return sql`select code, multiplier, note, created_at from product_barcodes where product_id = ${p._id} order by created_at`;
  },
  { perm: "products.manage" }
);

export const DELETE = route(
  async ({ params, query, user }) => {
    const p = await product(params.id);
    const code = query.get("code");
    await db()`delete from product_barcodes where product_id = ${p._id} and code = ${code}`;
    await logAudit({ action: "product_edited", category: "product", entity: p, entityName: p.name, user, details: `Cod de bare suplimentar șters: ${code}` });
    return { deleted: true };
  },
  { perm: "products.manage" }
);
