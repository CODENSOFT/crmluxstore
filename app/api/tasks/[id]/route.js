import connectDB from "@/lib/mongodb";
import Task from "@/models/Task";
import { ok, fail, requireUser } from "@/lib/api";

export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const task = await Task.findById(id);
  if (!task) return fail("Sarcina inexistenta", 404);

  const isOwner =
    String(task.assignedTo) === String(user.id) ||
    String(task.createdBy) === String(user.id);
  if (user.role !== "admin" && !isOwner) return fail("Acces interzis", 403);

  // Managerul poate schimba doar statusul; adminul poate edita tot
  if (body.status) task.status = body.status;
  if (user.role === "admin") {
    if (body.title != null) task.title = body.title;
    if (body.description != null) task.description = body.description;
    if (body.priority != null) task.priority = body.priority;
    if (body.dueDate != null)
      task.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assignedTo != null) task.assignedTo = body.assignedTo;
  }
  await task.save();
  const populated = await Task.findById(task._id)
    .populate("assignedTo", "name email")
    .populate("createdBy", "name email");
  return ok(populated);
}

export async function DELETE(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const task = await Task.findById(id);
  if (!task) return fail("Sarcina inexistenta", 404);
  if (user.role !== "admin" && String(task.createdBy) !== String(user.id)) {
    return fail("Acces interzis", 403);
  }
  await task.deleteOne();
  return ok({ deleted: true });
}
