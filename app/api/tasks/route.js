import mongoose from "mongoose";
import Task from "@/models/Task";
import User from "@/models/User";
import { route, readJson, badRequest } from "@/lib/api";
import { emit } from "@/lib/events";
import { notifyTaskAssigned } from "@/lib/notify";
import { populateTask } from "@/lib/tasks";


export const GET = route(async ({ user, query }) => {
  const f = {};
  if (user.role !== "admin" || query.get("mine") === "1") {
    const id = new mongoose.Types.ObjectId(String(user.id));
    f.$or = [{ assignedTo: id }, { createdBy: id }];
  }
  if (query.get("assignedTo")) f.assignedTo = query.get("assignedTo");
  if (query.get("customer")) f.customer = query.get("customer");
  if (query.get("order")) f.order = query.get("order");
  if (query.get("status")) f.status = query.get("status");
  if (query.get("hideDone") === "1") {
    f.$and = [{ $or: [{ status: { $ne: "done" } }, { completedAt: { $gte: new Date(Date.now() - 7 * 86400000) } }] }];
  }
  return populateTask(Task.find(f)).sort({ status: 1, dueDate: 1, createdAt: -1 }).limit(500).lean();
});

export const POST = route(async ({ req, user }) => {
  const b = await readJson(req);
  if (!b.title?.trim()) throw badRequest("Titlul sarcinii este obligatoriu");
  let assignee = user.id;
  if (b.assignedTo && b.assignedTo !== user.id) {
    if (user.role !== "admin") throw badRequest("Doar administratorul poate atribui sarcini altor persoane");
    const u = await User.findOne({ _id: b.assignedTo, active: true }).select("_id").lean();
    if (!u) throw badRequest("Utilizatorul ales nu există");
    assignee = u._id;
  }
  const task = await Task.create({
    title: b.title.trim(),
    description: b.description,
    assignedTo: assignee,
    createdBy: user.id,
    dueDate: b.dueDate ? new Date(b.dueDate) : undefined,
    priority: ["low", "normal", "high"].includes(b.priority) ? b.priority : "normal",
    customer: b.customer || undefined,
    order: b.order || undefined,
  });
  const populated = await populateTask(Task.findById(task._id)).lean();
  await notifyTaskAssigned(populated, user.id).catch(() => {});
  emit("task.created", {
    id: String(task._id),
    title: task.title,
    assignedTo: populated.assignedTo?.name || null,
    dueDate: task.dueDate || null,
    priority: task.priority,
  });
  return populated;
});
