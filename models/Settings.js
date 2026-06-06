import mongoose from "mongoose";

// Document unic de configurare globala a CRM-ului
const SettingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "CRM Lux Store" },
    currency: { type: String, default: "MDL" },
    makeWebhookUrl: { type: String, default: "" },
    lowStockThreshold: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", SettingsSchema);
