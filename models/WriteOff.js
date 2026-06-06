import mongoose from "mongoose";

// Anulare / spisanie produs (scoatere din stoc pentru produse defecte/expirate)
const WriteOffSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: { type: String },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    quantity: { type: Number, required: true, min: 0.0001 },
    reason: { type: String, trim: true }, // motiv: defect, expirat, deteriorat...
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.models.WriteOff ||
  mongoose.model("WriteOff", WriteOffSchema);
