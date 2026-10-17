import mongoose from "mongoose";

// Webhook de iesire: CRM-ul trimite evenimente semnate HMAC catre un URL extern
const WebhookSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    events: { type: [String], default: ["*"] },
    secret: { type: String, required: true },
    active: { type: Boolean, default: true },
    lastStatus: { type: String }, // success | failed
    lastHttpStatus: { type: Number },
    lastError: { type: String },
    lastDeliveryAt: { type: Date },
    failures: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.Webhook || mongoose.model("Webhook", WebhookSchema);
