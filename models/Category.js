import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    sort: { type: Number, default: 0 },
    color: { type: String },
    active: { type: Boolean, default: true },
    // Identificatori externi (1C / site)
    externalId: { type: String, trim: true },
    wooId: { type: Number },
  },
  { timestamps: true }
);

CategorySchema.index({ externalId: 1 }, { sparse: true });

export default mongoose.models.Category || mongoose.model("Category", CategorySchema);
