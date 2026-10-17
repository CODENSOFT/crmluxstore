import mongoose from "mongoose";

const WebhookDeliverySchema = new mongoose.Schema(
  {
    webhook: { type: mongoose.Schema.Types.ObjectId, ref: "Webhook", index: true },
    event: { type: String },
    deliveryId: { type: String },
    status: { type: String }, // success | failed
    httpStatus: { type: Number },
    error: { type: String },
    durationMs: { type: Number },
    attempts: { type: Number, default: 1 },
    payloadPreview: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

WebhookDeliverySchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

export default mongoose.models.WebhookDelivery ||
  mongoose.model("WebhookDelivery", WebhookDeliverySchema);
