import Task from "@/models/Task";
import User from "@/models/User";
import { route, readJson, forbidden, notFound, badRequest } from "@/lib/api";
import { populateTask } from "@/lib/tasks";
import { notifyTaskAssigned } from "@/lib/notify";

async function load(id, user) {
  const task = await Task.findById(id);
  if (!task) throw notFound("Sarcina nu există");
  const own = String(task.assignedTo) === String(user.id) || String(task.createdBy) === String(user.id);
  if (user.role !== "admin" && !own) throw forbidden();
  return task;
}

export const PATCH = route(async ({ req, params, user }) => {
  const b = await readJson(req);
  const task = await load(params.id, user);
  const canEdit = user.role === "admin" || String(task.createdBy) === String(user.id);
  if (b.status) {
    if (!["todo", "in_progress", "done"].includes(b.status)) throw badRequest("Status invalid");
    task.status = b.status;
    task.completedAt = b.status === "done" ? new Date() : undefined;
  }
  let reassigned = false;
  if (canEdit) {
    if (b.title != null) task.title = b.title;
    if (b.description != null) task.description = b.description;
    if (b.priority != null) task.priority = b.priority;
    if (b.dueDate !== undefined) task.dueDate = b.dueDate ? new Date(b.dueDate) : undefined;
    if (b.customer !== undefined) task.customer = b.customer || undefined;
    if (b.order !== undefined) task.order = b.order || undefined;
    if (b.assignedTo && String(b.assignedTo) !== String(task.assignedTo)) {
      if (user.role !== "admin") throw forbidden("Doar administratorul poate reatribui sarcini");
      if (!(await User.exists({ _id: b.assignedTo, active: true }))) throw badRequest("Utilizator inexistent");
      task.assignedTo = b.assignedTo;
      reassigned = true;
    }
  }
  await task.save();
  const populated = await populateTask(Task.findById(task._id)).lean();
  if (reassigned) await notifyTaskAssigned(populated, user.id).catch(() => {});
  return populated;
});

export const DELETE = route(async ({ params, user }) => {
  const task = await load(params.id, user);
  if (user.role !== "admin" && String(task.createdBy) !== String(user.id)) throw forbidden();
  await task.deleteOne();
  return { deleted: true };
});
