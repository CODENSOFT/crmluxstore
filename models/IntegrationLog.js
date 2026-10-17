import mongoose from "mongoose";

// Jurnal de sincronizare cu sistemele externe (site, 1C, API)
const IntegrationLogSchema = new mongoose.Schema(
  {
    source: { type: String }, // woo | 1c | api | webhook | cron
    direction: { type: String }, // in | out
    action: { type: String },
    status: { type: String, default: "ok" }, // ok | error
    message: { type: String },
    count: { type: Number },
    ref: { type: String },
    durationMs: { type: Number },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

IntegrationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
IntegrationLogSchema.index({ source: 1, createdAt: -1 });

export default mongoose.models.IntegrationLog ||
  mongoose.model("IntegrationLog", IntegrationLogSchema);
