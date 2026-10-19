import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { pickSupplier } from "@/lib/suppliers";

async function load(id) {
  if (!isUuid(id)) throw notFound("Furnizorul nu există");
  const [s] = await db()`select * from suppliers where id = ${id}`;
  if (!s) throw notFound("Furnizorul nu există");
  return s;
}

export const GET = route(async ({ params }) => {
  const s = await load(params.id);
  const arrivals = await db()`
    select a.id, a.number, a.created_at, a.total, a.supplier_invoice,
           (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = a.warehouse_id) as warehouse
    from arrivals a where a.supplier_id = ${s._id} order by a.created_at desc limit 100`;
  return { ...s, arrivals };
});

export const PATCH = route(async ({ req, params, user }) => {
  const s = await load(params.id);
  const patch = pickSupplier(await readJson(req));
  if (patch.name !== undefined && !patch.name) throw badRequest("Numele furnizorului este obligatoriu");
  const sql = db();
  if (Object.keys(patch).length) await sql`update suppliers set ${sql(patch, ...Object.keys(patch))} where id = ${s._id}`;
  const fresh = await load(s._id);
  await logAudit({ action: "supplier_edited", category: "supplier", entity: fresh, entityName: fresh.name, user });
  return fresh;
}, { perm: "suppliers.manage" });

export const DELETE = route(
  async ({ params, user }) => {
    const s = await load(params.id);
    const sql = db();
    const [{ used }] = await sql`select exists (select 1 from arrivals where supplier_id = ${s._id}) as used`;
    if (used) {
      await sql`update suppliers set active = false where id = ${s._id}`;
      return { deleted: false, deactivated: true };
    }
    await sql`delete from suppliers where id = ${s._id}`;
    await logAudit({ action: "supplier_deleted", category: "supplier", entityName: s.name, user });
    return { deleted: true };
  },
  { perm: ["suppliers.manage", "delete"] }
);
