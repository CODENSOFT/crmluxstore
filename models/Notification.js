import mongoose from "mongoose";

// Notificare in sistem pentru un utilizator
const NotificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: [
        "order_approval",
        "order_decision",
        "order_new",
        "order_assigned",
        "order_edit",
        "site_order",
        "task_assigned",
        "low_stock",
        "payment",
        "integration",
        "system",
      ],
      default: "system",
    },
    title: { type: String, required: true },
    message: { type: String },
    link: { type: String }, // ruta interna (ex: /comenzi/ID)
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
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

NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
// Notificarile se sterg automat dupa 90 de zile
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);
