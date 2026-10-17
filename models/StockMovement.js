import mongoose from "mongoose";

// Registrul de stoc: fiecare modificare de cantitate, cu soldul dupa operatiune.
const StockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    sku: { type: String },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    quantity: { type: Number, required: true }, // + intrare / - iesire
    balanceAfter: { type: Number },
    type: { type: String, required: true },
    unitCost: { type: Number },
    refType: { type: String }, // Order | StockArrival | Transfer | WriteOff | InventoryCount | Product | api
    refId: { type: mongoose.Schema.Types.ObjectId },
    refNumber: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    note: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

StockMovementSchema.index({ product: 1, createdAt: -1 });
StockMovementSchema.index({ warehouse: 1, createdAt: -1 });
StockMovementSchema.index({ createdAt: -1 });
StockMovementSchema.index({ refId: 1 });

export default mongoose.models.StockMovement ||
  mongoose.model("StockMovement", StockMovementSchema);
