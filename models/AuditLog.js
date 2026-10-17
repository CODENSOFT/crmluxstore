import mongoose from "mongoose";

// Istoric general de activitate (cine, ce, cum). Pastrat 30 de zile (TTL).
const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    category: { type: String }, // order | product | stock | warehouse | user | customer | supplier | integration | settings
    entityId: { type: mongoose.Schema.Types.ObjectId },
    entityName: { type: String },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    orderNumber: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    userRole: { type: String },
    details: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
AuditLogSchema.index({ category: 1, createdAt: -1 });
AuditLogSchema.index({ order: 1, createdAt: -1 });
AuditLogSchema.index({ entityId: 1, createdAt: -1 });

export default mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
