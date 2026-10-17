import mongoose from "mongoose";
import { CUSTOMER_SEGMENT_KEYS } from "@/lib/constants";

const CustomerSchema = new mongoose.Schema(
  {
    number: { type: String }, // CL-00001
    type: { type: String, enum: ["individual", "company"], default: "individual" },
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    phoneNorm: { type: String }, // doar cifre, pentru cautare / potrivire
    phone2: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // Date fiscale (persoane juridice)
    idno: { type: String, trim: true }, // cod fiscal (13 cifre)
    vatCode: { type: String, trim: true },
    iban: { type: String, trim: true },
    bank: { type: String, trim: true },
    legalAddress: { type: String, trim: true },
    // Livrare
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    // Comercial
    segment: { type: String, enum: CUSTOMER_SEGMENT_KEYS, default: "retail" },
    priceType: { type: String, enum: ["retail", "wholesale"], default: "retail" },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    paymentTermDays: { type: Number, default: 0, min: 0 },
    source: { type: String, trim: true },
    tags: { type: [String], default: [] },
    note: { type: String, trim: true },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    active: { type: Boolean, default: true },
    // Statistici denormalizate (recalculate la fiecare comanda / plata)
    stats: {
      ordersCount: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      balance: { type: Number, default: 0 }, // datorie curenta (de incasat)
      lastOrderAt: { type: Date },
    },
    externalId: { type: String, trim: true },
    wooCustomerId: { type: Number },
  },
  { timestamps: true }
);

CustomerSchema.pre("save", function () {
  this.phoneNorm = this.phone ? String(this.phone).replace(/\D/g, "").slice(-8) : undefined;
});

CustomerSchema.index({ name: 1 });
CustomerSchema.index({ phoneNorm: 1 });
CustomerSchema.index({ email: 1 }, { sparse: true });
CustomerSchema.index({ idno: 1 }, { sparse: true });
CustomerSchema.index({ externalId: 1 }, { sparse: true });
CustomerSchema.index({ "stats.totalSpent": -1 });
CustomerSchema.index({ updatedAt: 1 });

export default mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);
