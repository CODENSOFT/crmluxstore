import mongoose from "mongoose";
import { STAGE_KEYS } from "@/lib/orderStages";

const OrderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String }, // snapshot la momentul comenzii
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true }, // ex: CMD-000123
    items: { type: [OrderItemSchema], default: [] },
    total: { type: Number, default: 0 },
    // Stadiul comenzii in pipeline (vezi lib/orderStages.js)
    status: {
      type: String,
      enum: STAGE_KEYS,
      default: "new",
    },
    // Persoana responsabila de comanda
    responsible: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    customerName: { type: String, trim: true },
    note: { type: String, trim: true },
    stockApplied: { type: Boolean, default: false }, // stocul a fost scazut?
    // Modificare propusa de un manager, in asteptarea aprobarii adminului
    pendingEdit: {
      type: new mongoose.Schema(
        {
          items: { type: [OrderItemSchema], default: [] },
          total: Number,
          customerName: String,
          note: String,
          responsible: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          requestedByName: String,
          requestedAt: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
