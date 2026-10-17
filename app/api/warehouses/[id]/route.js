import Warehouse from "@/models/Warehouse";
import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { getSettingsDoc, invalidateSettings } from "@/lib/settings";

export const PATCH = route(
  async ({ req, params, user }) => {
    const body = await readJson(req);
    const w = await Warehouse.findById(params.id);
    if (!w) throw notFound("Depozitul nu există");
    for (const f of ["name", "code", "type", "address", "note", "syncToSite", "active", "externalId"]) {
      if (body[f] !== undefined) w[f] = body[f];
    }
    if (body.isDefault) {
      w.isDefault = true;
      await Warehouse.updateMany({ _id: { $ne: w._id } }, { $set: { isDefault: false } });
      const s = await getSettingsDoc();
      s.defaultWarehouse = w._id;
      await s.save();
      invalidateSettings();
    }
    await w.save();
    await logAudit({ action: "warehouse_edited", category: "warehouse", entity: w, entityName: w.name, user });
    return w;
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ params, user }) => {
    const w = await Warehouse.findById(params.id);
    if (!w) throw notFound("Depozitul nu există");
    if (await Product.exists({ stock: { $elemMatch: { warehouse: w._id, quantity: { $gt: 0 } } } }))
      throw badRequest("Depozitul conține stoc. Transferați sau casați stocul înainte de ștergere.");
    if (await StockMovement.exists({ warehouse: w._id })) {
      w.active = false;
      w.isDefault = false;
      await w.save();
      return { deleted: false, deactivated: true };
    }
    await Product.updateMany({}, { $pull: { stock: { warehouse: w._id } } });
    await w.deleteOne();
    await logAudit({ action: "warehouse_deleted", category: "warehouse", entityName: w.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
