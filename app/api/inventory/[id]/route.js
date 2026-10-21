import { db } from "@/lib/db";
import { isAdminUser } from "@/lib/permissions";
import { route, readJson, badRequest } from "@/lib/api";
import { getInventory, updateInventory, completeInventory, cancelInventory } from "@/lib/stockDocs";

// Detaliu inventariere + stocul curent din sistem pentru fiecare linie
export const GET = route(async ({ params }) => {
  const inv = await getInventory(params.id);
  if (inv.status === "draft" && inv.items.length) {
    const sql = db();
    const rows = await sql`
      select p.id, p.barcode, coalesce(s.quantity, 0) as current
      from products p left join stock s on s.product_id = p.id and s.warehouse_id = ${inv.warehouseId}
      where p.id in ${sql(inv.items.map((l) => l.product))}`;
    const byId = new Map(rows.map((r) => [String(r._id), r]));
    inv.items = inv.items.map((l) => ({ ...l, current: byId.get(String(l.product))?.current ?? 0, barcode: byId.get(String(l.product))?.barcode }));
  }
  return inv;
});

// Salvare cantitati numarate: { items: [{ product, counted }], note }
export const PATCH = route(async ({ req, params }) => {
  await getInventory(params.id);
  return updateInventory(params.id, await readJson(req));
}, { perm: "stock.inventory" });

// { action: "complete" | "cancel" }
export const POST = route(async ({ req, params, user }) => {
  const body = await readJson(req);
  await getInventory(params.id);
  if (body.action === "complete") {
    if (!isAdminUser(user)) throw badRequest("Doar administratorul poate finaliza inventarierea");
    return completeInventory(params.id, user, body.items ? { items: body.items } : null);
  }
  if (body.action === "cancel") return cancelInventory(params.id);
  throw badRequest("Acțiune invalidă");
}, { perm: "stock.inventory" });
