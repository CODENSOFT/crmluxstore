import Supplier from "@/models/Supplier";
import StockArrival from "@/models/StockArrival";
import { route, readJson, badRequest, escapeRegex } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { pickSupplier } from "@/lib/suppliers";

export const GET = route(async ({ query }) => {
  const filter = query.get("all") === "1" ? {} : { active: { $ne: false } };
  if (query.get("q")) filter.name = { $regex: escapeRegex(query.get("q")), $options: "i" };
  const [suppliers, agg] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).lean(),
    StockArrival.aggregate([
      { $match: { supplierId: { $ne: null } } },
      {
        $group: {
          _id: "$supplierId",
          arrivals: { $sum: 1 },
          total: { $sum: { $ifNull: ["$total", { $multiply: [{ $ifNull: ["$quantity", 0] }, { $ifNull: ["$unitCost", 0] }] }] } },
          last: { $max: "$createdAt" },
        },
      },
    ]),
  ]);
  const stats = new Map(agg.map((a) => [String(a._id), a]));
  return suppliers.map((s) => {
    const st = stats.get(String(s._id));
    return { ...s, stats: { arrivals: st?.arrivals || 0, total: st?.total || 0, lastArrivalAt: st?.last || null } };
  });
});

export const POST = route(async ({ req, user }) => {
  const body = pickSupplier(await readJson(req));
  if (!body.name?.trim()) throw badRequest("Numele furnizorului este obligatoriu");
  const created = await Supplier.create(body);
  await logAudit({ action: "supplier_created", category: "supplier", entity: created, entityName: created.name, user });
  return created;
});
