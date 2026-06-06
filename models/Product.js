import mongoose from "mongoose";

export const UNITS = ["bucata", "kg", "litri", "metru"];

// Stoc pe depozit (embedded)
const StockSchema = new mongoose.Schema(
  {
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    quantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    photo: { type: String }, // data URL (base64) sau link
    sku: { type: String, trim: true }, // cod produs optional
    unit: { type: String, enum: UNITS, default: "bucata", required: true },
    price: { type: Number, default: 0, min: 0 }, // pret pe unitate
    stock: { type: [StockSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Stoc total pe toate depozitele
ProductSchema.virtual("totalStock").get(function () {
  return (this.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
});

ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

export default mongoose.models.Product ||
  mongoose.model("Product", ProductSchema);
