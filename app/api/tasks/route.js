import connectDB from "@/lib/mongodb";
import Task from "@/models/Task";
import User from "@/models/User";
import { ok, fail, requireUser } from "@/lib/api";
import { dispatchToMake } from "@/lib/make";

export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const filter = {};
  // Managerul vede sarcinile primite sau create de el
  if (user.role !== "admin") {
    filter.$or = [{ assignedTo: user.id }, { createdBy: user.id }];
  }
  if (status) filter.status = status;

  const tasks = await Task.find(filter)
    .populate("assignedTo", "name email")
    .populate("createdBy", "name email")
    .sort({ dueDate: 1, createdAt: -1 });
  return ok(tasks);
}

export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const body = await req.json();
  const { title, description, assignedTo, dueDate, priority } = body;

  if (!title) return fail("Titlul sarcinii este obligatoriu");

  // Adminul atribuie oricui; managerul isi poate face sarcini doar siesi
  let assignee = user.id;
  if (assignedTo) {
    if (user.role === "admin") {
      const u = await User.findById(assignedTo);
      if (!u) return fail("Utilizator inexistent");
      assignee = u._id;
    }
  }

  const task = await Task.create({
    title,
    description,
    assignedTo: assignee,
    createdBy: user.id,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    priority: priority || "normal",
  });

  const populated = await Task.findById(task._id)
    .populate("assignedTo", "name email")
    .populate("createdBy", "name email");

  await dispatchToMake("task.created", populated.toJSON());
  return ok(populated, { status: 201 });
}
