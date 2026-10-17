import mongoose from "mongoose";
import { STAGE_KEYS } from "@/lib/orderStages";

const OrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String }, // snapshot
    sku: { type: String },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String },
    unitPrice: { type: Number, required: true, min: 0 }, // pret inainte de reducere
    discount: { type: Number, default: 0, min: 0, max: 100 }, // % reducere pe linie
    lineTotal: { type: Number, required: true, min: 0 }, // dupa reducere
    vatRate: { type: Number, default: 0 },
    costPrice: { type: Number }, // pret de achizitie la momentul vanzarii (profit)
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    method: { type: String, default: "cash" },
    date: { type: Date, default: Date.now },
    note: { type: String, trim: true },
    reference: { type: String, trim: true }, // nr. chitanta / ordin de plata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdByName: { type: String },
  },
  { timestamps: false }
);

const DeliverySchema = new mongoose.Schema(
  {
    method: { type: String, default: "pickup" },
    label: { type: String },
    cost: { type: Number, default: 0, min: 0 },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    recipient: { type: String, trim: true },
    phone: { type: String, trim: true },
    date: { type: Date },
    trackingNumber: { type: String, trim: true },
  },
  { _id: false }
);

const PendingEditSchema = new mongoose.Schema(
  {
    items: { type: [OrderItemSchema], default: [] },
    total: Number,
    subtotal: Number,
    vatTotal: Number,
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerName: String,
    customerPhone: String,
    note: String,
    delivery: { type: DeliverySchema },
    responsible: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedByName: String,
    requestedAt: Date,
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true }, // CMD-000123
    items: { type: [OrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 }, // suma liniilor (dupa reduceri)
    vatTotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 }, // total de plata (inclusiv livrare)
    status: { type: String, enum: STAGE_KEYS, default: "new" },
    channel: { type: String, default: "store" },
    // Client
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    priceType: { type: String, default: "retail" },
    // Livrare & plata
    delivery: { type: DeliverySchema, default: () => ({}) },
    paymentMethod: { type: String, default: "cash" },
    payments: { type: [PaymentSchema], default: [] },
    paidAmount: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
    dueDate: { type: Date },
    invoice: {
      number: { type: String, trim: true },
      date: { type: Date },
    },
    // Oameni
    responsible: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, trim: true }, // vizibil pe factura
    internalNote: { type: String, trim: true },
    cancelReason: { type: String, trim: true },
    stockApplied: { type: Boolean, default: false },
    completedAt: { type: Date },
    pendingEdit: { type: PendingEditSchema, default: undefined },
    // Integrari
    externalSource: { type: String }, // woo | api | 1c
    externalId: { type: String },
    externalNumber: { type: String },
    export1c: {
      exportedAt: { type: Date },
      docNumber: { type: String },
      docId: { type: String },
    },
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ customer: 1, createdAt: -1 });
OrderSchema.index({ createdBy: 1 });
OrderSchema.index({ responsible: 1 });
OrderSchema.index({ paymentStatus: 1 });
OrderSchema.index({ updatedAt: 1 });
OrderSchema.index(
  { externalSource: 1, externalId: 1 },
  { unique: true, partialFilterExpression: { externalId: { $type: "string" } } }
);

export default mongoose.models.Order || mongoose.model("Order", OrderSchema);
