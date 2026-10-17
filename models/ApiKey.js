import mongoose from "mongoose";

// Chei API pentru sisteme externe (1C, site, alte aplicatii). Se pastreaza doar hash-ul.
const ApiKeySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["1c", "site", "generic"], default: "generic" },
    prefix: { type: String, required: true }, // primele caractere, pentru identificare
    hash: { type: String, required: true, unique: true },
    scopes: { type: [String], default: ["read", "write"] },
    active: { type: Boolean, default: true },
    lastUsedAt: { type: Date },
    lastUsedIp: { type: String },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.ApiKey || mongoose.model("ApiKey", ApiKeySchema);
