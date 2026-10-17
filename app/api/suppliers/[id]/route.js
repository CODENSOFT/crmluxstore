import Supplier from "@/models/Supplier";
import StockArrival from "@/models/StockArrival";
import { route, readJson, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { pickSupplier } from "@/lib/suppliers";

export const GET = route(async ({ params }) => {
  const s = await Supplier.findById(params.id).lean();
  if (!s) throw notFound("Furnizorul nu există");
  const arrivals = await StockArrival.find({ supplierId: s._id })
    .populate("warehouse", "name")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return { ...s, arrivals };
});

export const PATCH = route(async ({ req, params, user }) => {
  const s = await Supplier.findByIdAndUpdate(params.id, pickSupplier(await readJson(req)), { returnDocument: "after", runValidators: true });
  if (!s) throw notFound("Furnizorul nu există");
  await logAudit({ action: "supplier_edited", category: "supplier", entity: s, entityName: s.name, user });
  return s;
});

export const DELETE = route(
  async ({ params, user }) => {
    const s = await Supplier.findById(params.id);
    if (!s) throw notFound("Furnizorul nu există");
    if (await StockArrival.exists({ supplierId: s._id })) {
      s.active = false;
      await s.save();
      return { deleted: false, deactivated: true };
    }
    await s.deleteOne();
    await logAudit({ action: "supplier_deleted", category: "supplier", entityName: s.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
