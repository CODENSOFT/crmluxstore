import mongoose from "mongoose";

// Istoric general de activitate (cine, ce, cum). Se sterge automat dupa 1 luna.
const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // created, edited, transfer, writeoff, arrival...
    category: { type: String }, // order | product | stock | warehouse | user
    // Referinta generica catre entitatea afectata
    entityId: { type: mongoose.Schema.Types.ObjectId },
    entityName: { type: String },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNumber: { type: String },
    // Cine a facut actiunea
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    userRole: { type: String },
    // Descriere "ce si cum"
    details: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// TTL: stergere automata dupa 30 de zile
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
AuditLogSchema.index({ category: 1, createdAt: -1 });

export default mongoose.models.AuditLog ||
  mongoose.model("AuditLog", AuditLogSchema);
