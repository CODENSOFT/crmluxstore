import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { updateSettings } from "@/lib/settings";

async function load(id) {
  if (!isUuid(id)) throw notFound("Depozitul nu există");
  const [w] = await db()`select * from warehouses where id = ${id}`;
  if (!w) throw notFound("Depozitul nu există");
  return w;
}

export const PATCH = route(
  async ({ req, params, user }) => {
    const body = await readJson(req);
    const w = await load(params.id);
    const sql = db();
    const patch = {};
    for (const f of ["name", "code", "type", "address", "note", "externalId"]) if (body[f] !== undefined) patch[f] = body[f] || null;
    for (const f of ["syncToSite", "active"]) if (body[f] !== undefined) patch[f] = !!body[f];
    if (patch.name === null) throw badRequest("Numele depozitului este obligatoriu");
    if (body.isDefault) {
      patch.isDefault = true;
      await sql`update warehouses set is_default = false where id <> ${w._id}`;
      await updateSettings({ defaultWarehouse: w._id });
    }
    if (Object.keys(patch).length) await sql`update warehouses set ${sql(patch, ...Object.keys(patch))} where id = ${w._id}`;
    const fresh = await load(w._id);
    await logAudit({ action: "warehouse_edited", category: "warehouse", entity: fresh, entityName: fresh.name, user });
    return fresh;
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ params, user }) => {
    const w = await load(params.id);
    const sql = db();
    const [{ hasStock, hasHistory }] = await sql`
      select exists (select 1 from stock where warehouse_id = ${w._id} and quantity > 0) as has_stock,
             exists (select 1 from stock_movements where warehouse_id = ${w._id}) as has_history`;
    if (hasStock) throw badRequest("Depozitul conține stoc. Transferați sau casați stocul înainte de ștergere.");
    if (hasHistory) {
      await sql`update warehouses set active = false, is_default = false where id = ${w._id}`;
      return { deleted: false, deactivated: true };
    }
    await sql`delete from warehouses where id = ${w._id}`;
    await logAudit({ action: "warehouse_deleted", category: "warehouse", entityName: w.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
