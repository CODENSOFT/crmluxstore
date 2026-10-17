import mongoose from "mongoose";

// Contoare atomice pentru numerotarea documentelor (CMD-000001, REC-000001 ...)
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export default mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
