import mongoose from "mongoose";

const LineSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    sku: { type: String },
    unit: { type: String },
    quantity: { type: Number, required: true, min: 0.0001 },
    unitCost: { type: Number, min: 0 },
    lineTotal: { type: Number, default: 0 },
  },
  { _id: false }
);

// Receptie marfa (intrare in stoc), cu mai multe linii
const StockArrivalSchema = new mongoose.Schema(
  {
    number: { type: String }, // REC-000001
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier" },
    supplier: { type: String, trim: true }, // nume furnizor (snapshot)
    supplierInvoice: { type: String, trim: true }, // nr. factura furnizor
    supplierInvoiceDate: { type: Date },
    items: { type: [LineSchema], default: [] },
    total: { type: Number, default: 0 },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    externalId: { type: String },
    source: { type: String, default: "crm" },
    // Campuri vechi (receptii cu o singura linie, inainte de v2)
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    productName: { type: String },
    quantity: { type: Number },
    unitCost: { type: Number },
  },
  { timestamps: true }
);

StockArrivalSchema.index({ createdAt: -1 });
StockArrivalSchema.index({ supplierId: 1 });
StockArrivalSchema.index({ externalId: 1 }, { sparse: true });

export default mongoose.models.StockArrival ||
  mongoose.model("StockArrival", StockArrivalSchema);
