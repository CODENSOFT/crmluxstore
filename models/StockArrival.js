import mongoose from "mongoose";

// Receptie marfa: produs deja existent in CRM care soseste in stoc
const StockArrivalSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0.0001 },
    unitCost: { type: Number, min: 0 }, // pret de achizitie optional
    supplier: { type: String, trim: true }, // nume furnizor (snapshot)
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    note: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.StockArrival ||
  mongoose.model("StockArrival", StockArrivalSchema);
