import mongoose from "mongoose";

// Notificare in sistem pentru un utilizator (ex: comanda noua spre aprobare)
const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "order_approval",
        "order_decision",
        "order_new",
        "order_assigned",
        "order_edit",
      ],
      default: "order_approval",
    },
    title: { type: String, required: true },
    message: { type: String },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    // Snapshot cu detaliile comenzii, pentru afisare rapida in notificare
    meta: {
      number: String,
      total: Number,
      responsibleName: String,
      createdByName: String,
      itemsCount: Number,
      items: [
        {
          name: String,
          quantity: Number,
          unit: String,
          warehouse: String,
          lineTotal: Number,
        },
      ],
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);
