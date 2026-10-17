import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dueDate: { type: Date },
    priority: { type: String, enum: ["low", "normal", "high"], default: "normal" },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo" },
    // Legaturi optionale
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ dueDate: 1 });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
