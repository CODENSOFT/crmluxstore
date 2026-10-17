import Warehouse from "@/models/Warehouse";
import Product from "@/models/Product";
import { route, readJson, badRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSettingsDoc, invalidateSettings } from "@/lib/settings";

export const GET = route(async ({ query }) => {
  const list = await Warehouse.find(query.get("all") === "1" ? {} : { active: { $ne: false } })
    .sort({ isDefault: -1, name: 1 })
    .lean();
  if (query.get("stats") !== "1") return list;
  const agg = await Product.aggregate([
    { $unwind: "$stock" },
    {
      $group: {
        _id: "$stock.warehouse",
        positions: { $sum: { $cond: [{ $gt: ["$stock.quantity", 0] }, 1, 0] } },
        units: { $sum: "$stock.quantity" },
        value: { $sum: { $multiply: ["$stock.quantity", { $ifNull: ["$price", 0] }] } },
        cost: { $sum: { $multiply: ["$stock.quantity", { $ifNull: ["$costPrice", 0] }] } },
      },
    },
  ]);
  const byId = new Map(agg.map((a) => [String(a._id), a]));
  return list.map((w) => ({ ...w, stats: byId.get(String(w._id)) || { positions: 0, units: 0, value: 0, cost: 0 } }));
});

export const POST = route(
  async ({ req, user }) => {
    const body = await readJson(req);
    if (!body.name?.trim()) throw badRequest("Numele depozitului este obligatoriu");
    const w = await Warehouse.create({
      name: body.name.trim(),
      code: body.code,
      type: body.type,
      address: body.address,
      note: body.note,
      syncToSite: body.syncToSite !== false,
      isDefault: !!body.isDefault,
    });
    if (w.isDefault) {
      await Warehouse.updateMany({ _id: { $ne: w._id } }, { $set: { isDefault: false } });
      const s = await getSettingsDoc();
      s.defaultWarehouse = w._id;
      await s.save();
      invalidateSettings();
    }
    await logAudit({ action: "warehouse_created", category: "warehouse", entity: w, entityName: w.name, user });
    return w;
  },
  { auth: "admin" }
);
