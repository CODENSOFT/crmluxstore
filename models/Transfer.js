import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    sku: { type: String },
    unit: { type: String },
    quantity: { type: Number, required: true, min: 0.0001 },
  },
  { _id: false }
);

const TransferSchema = new mongoose.Schema(
  {
    number: { type: String }, // TRF-000001
    fromWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    toWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    items: { type: [LineSchema], default: [] },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Campuri vechi (o singura linie)
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String },
    quantity: { type: Number },
  },
  { timestamps: true }
);

TransferSchema.index({ createdAt: -1 });

export default mongoose.models.Transfer || mongoose.model("Transfer", TransferSchema);
