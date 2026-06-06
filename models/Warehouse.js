import mongoose from "mongoose";

const WarehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    note: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.Warehouse ||
  mongoose.model("Warehouse", WarehouseSchema);
