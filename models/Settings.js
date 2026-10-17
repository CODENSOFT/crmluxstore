import mongoose from "mongoose";
import { DEFAULT_DELIVERY_METHODS } from "@/lib/constants";

const DeliveryMethodSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    cost: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

// Document unic de configurare globala a CRM-ului
const SettingsSchema = new mongoose.Schema(
  {
    // Companie
    companyName: { type: String, default: "Lux Store" },
    legalName: { type: String, default: "" },
    idno: { type: String, default: "" },
    vatCode: { type: String, default: "" },
    iban: { type: String, default: "" },
    bank: { type: String, default: "" },
    bankCode: { type: String, default: "" },
    address: { type: String, default: "mun. Chișinău, str. Lunca Bîcului 23" },
    phone: { type: String, default: "+373 678 19 777" },
    email: { type: String, default: "" },
    website: { type: String, default: "https://luxstore.md" },
    // Fiscal & vanzari
    currency: { type: String, default: "MDL" },
    vatPayer: { type: Boolean, default: true },
    vatRate: { type: Number, default: 20 },
    pricesIncludeVat: { type: Boolean, default: true },
    requireApproval: { type: Boolean, default: true }, // comenzile managerilor cer aprobare
    lowStockThreshold: { type: Number, default: 5 },
    defaultWarehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
    deliveryMethods: { type: [DeliveryMethodSchema], default: () => DEFAULT_DELIVERY_METHODS },
    invoiceTerms: {
      type: String,
      default: "Marfa a fost recepționată fără obiecții privind cantitatea și calitatea.",
    },
    publicUrl: { type: String, default: "" },
    // Integrare site (WooCommerce) — fara servicii intermediare
    woo: {
      enabled: { type: Boolean, default: false },
      url: { type: String, default: "" },
      consumerKey: { type: String, default: "" },
      consumerSecret: { type: String, default: "" },
      webhookSecret: { type: String, default: "" },
      importOrders: { type: Boolean, default: true },
      pushStock: { type: Boolean, default: false },
      pushOrderStatus: { type: Boolean, default: false },
      warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse" },
      lastOrderSyncAt: { type: Date },
      lastProductImportAt: { type: Date },
      lastStockPushAt: { type: Date },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model("Settings", SettingsSchema);
