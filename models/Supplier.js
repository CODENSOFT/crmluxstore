import mongoose from "mongoose";

const SupplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: { type: String, trim: true },
    address: { type: String, trim: true },
    country: { type: String, trim: true },
    idno: { type: String, trim: true },
    iban: { type: String, trim: true },
    paymentTermDays: { type: Number, default: 0 },
    brands: { type: [String], default: [] }, // marci livrate (Koch-Chemie, FOX LINE...)
    note: { type: String, trim: true },
    active: { type: Boolean, default: true },
    externalId: { type: String, trim: true },
  },
  { timestamps: true }
);

SupplierSchema.index({ externalId: 1 }, { sparse: true });

export default mongoose.models.Supplier || mongoose.model("Supplier", SupplierSchema);
