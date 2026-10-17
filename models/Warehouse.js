import mongoose from "mongoose";

const WarehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true },
    type: { type: String, enum: ["warehouse", "store", "vehicle"], default: "warehouse" },
    address: { type: String, trim: true },
    note: { type: String, trim: true },
    isDefault: { type: Boolean, default: false },
    // Stocul acestui depozit este publicat pe site (WooCommerce)?
    syncToSite: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    externalId: { type: String, trim: true },
  },
  { timestamps: true }
);

WarehouseSchema.index({ externalId: 1 }, { sparse: true });
WarehouseSchema.index({ code: 1 }, { sparse: true });

export default mongoose.models.Warehouse || mongoose.model("Warehouse", WarehouseSchema);
