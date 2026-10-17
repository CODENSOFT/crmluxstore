import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    sku: { type: String },
    unit: { type: String },
    expected: { type: Number, default: 0 }, // stoc in sistem la start
    counted: { type: Number, default: null }, // numarat fizic
    unitCost: { type: Number },
  },
  { _id: false }
);

// Inventariere: numararea fizica a stocului dintr-un depozit si corectarea diferentelor
const InventoryCountSchema = new mongoose.Schema(
  {
    number: { type: String }, // INV-000001
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    status: { type: String, enum: ["draft", "completed", "cancelled"], default: "draft" },
    items: { type: [LineSchema], default: [] },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedAt: { type: Date },
    summary: {
      lines: Number,
      surplus: Number, // cantitate in plus
      shortage: Number, // cantitate lipsa
      valueDiff: Number, // diferenta valorica (la pret de achizitie)
    },
  },
  { timestamps: true }
);

InventoryCountSchema.index({ createdAt: -1 });

export default mongoose.models.InventoryCount ||
  mongoose.model("InventoryCount", InventoryCountSchema);
