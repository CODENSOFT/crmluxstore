import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    sku: { type: String },
    unit: { type: String },
    quantity: { type: Number, required: true, min: 0.0001 },
    unitCost: { type: Number },
  },
  { _id: false }
);

// Casare (anulare) stoc: produse expirate, deteriorate, consum intern...
const WriteOffSchema = new mongoose.Schema(
  {
    number: { type: String }, // ANL-000001
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    reasonCode: { type: String, default: "other" },
    reason: { type: String, trim: true }, // detalii / motiv liber
    items: { type: [LineSchema], default: [] },
    totalCost: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Campuri vechi
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String },
    quantity: { type: Number },
  },
  { timestamps: true }
);

WriteOffSchema.index({ createdAt: -1 });

export default mongoose.models.WriteOff || mongoose.model("WriteOff", WriteOffSchema);
