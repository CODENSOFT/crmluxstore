import mongoose from "mongoose";
import { UNITS } from "@/lib/constants";

export { UNITS };

// Stoc pe depozit (embedded)
const StockSchema = new mongoose.Schema(
  {
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    quantity: { type: Number, default: 0 },
  },
  { _id: false }
);

// Componenta unui produs compus (set / kit)
const ComponentSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String },
    quantity: { type: Number, default: 1, min: 0.0001 },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    photo: { type: String }, // data URL (base64) sau link extern
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    brand: { type: String, trim: true },
    packaging: { type: String, trim: true }, // ex: "Canistră 20 L", "Flacon 1 L"
    unit: { type: String, enum: UNITS, default: "bucata", required: true },
    price: { type: Number, default: 0, min: 0 }, // pret cu amanuntul
    wholesalePrice: { type: Number, min: 0 }, // pret angro (B2B)
    costPrice: { type: Number, min: 0 }, // pret de achizitie (ultimul)
    vatRate: { type: Number, min: 0, max: 100 }, // gol = cota din setari
    minStock: { type: Number, min: 0 }, // prag minim (gol = pragul global)
    stock: { type: [StockSchema], default: [] },
    isComposite: { type: Boolean, default: false },
    components: { type: [ComponentSchema], default: [] },
    tags: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    // Identificatori externi
    externalId: { type: String, trim: true }, // 1C (GUID / cod)
    wooId: { type: Number }, // id produs / variatie WooCommerce
    wooParentId: { type: Number }, // pentru variatii
    source: { type: String, default: "crm" }, // crm | woo | api | 1c
  },
  { timestamps: true }
);

ProductSchema.virtual("totalStock").get(function () {
  return (this.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
});

ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

ProductSchema.index({ name: 1 });
ProductSchema.index({ sku: 1 });
ProductSchema.index({ barcode: 1 }, { sparse: true });
ProductSchema.index({ category: 1 });
ProductSchema.index({ externalId: 1 }, { sparse: true });
ProductSchema.index({ wooId: 1 }, { sparse: true });
ProductSchema.index({ updatedAt: 1 });

export default mongoose.models.Product || mongoose.model("Product", ProductSchema);
