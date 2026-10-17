import Product from "@/models/Product";
import { route, readJson, badRequest } from "@/lib/api";
import { getInventory, updateInventory, completeInventory } from "@/lib/stockDocs";
import { stockInWarehouse } from "@/lib/stock";

// Detaliu inventariere + stocul curent din sistem pentru fiecare linie
export const GET = route(async ({ params }) => {
  const inv = await getInventory(params.id);
  const obj = inv.toObject();
  if (inv.status === "draft") {
    const products = await Product.find({ _id: { $in: inv.items.map((l) => l.product) } }).select("stock barcode").lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    obj.items = obj.items.map((l) => ({
      ...l,
      current: stockInWarehouse(byId.get(String(l.product)), inv.warehouse._id),
      barcode: byId.get(String(l.product))?.barcode,
    }));
  }
  return obj;
});

// Salvare cantitati numarate: { items: [{ product, counted }], note }
export const PATCH = route(async ({ req, params }) => {
  const inv = await getInventory(params.id);
  return updateInventory(inv, await readJson(req));
});

// { action: "complete" | "cancel" }
export const POST = route(async ({ req, params, user }) => {
  const { action, items } = await readJson(req);
  const inv = await getInventory(params.id);
  if (action === "complete") {
    if (user.role !== "admin") throw badRequest("Doar administratorul poate finaliza inventarierea");
    if (items) await updateInventory(inv, { items });
    return completeInventory(inv, user);
  }
  if (action === "cancel") {
    if (inv.status !== "draft") throw badRequest("Inventarierea este deja închisă");
    inv.status = "cancelled";
    await inv.save();
    return inv;
  }
  throw badRequest("Acțiune invalidă");
});
