import { db, isUuid } from "@/lib/db";
import { route, readJson, forbidden, notFound, badRequest } from "@/lib/api";
import { getTask } from "@/lib/tasks";
import { notifyTaskAssigned } from "@/lib/notify";

async function load(id, user) {
  const [task] = isUuid(id) ? await db()`select * from tasks where id = ${id}` : [];
  if (!task) throw notFound("Sarcina nu există");
  const own = String(task.assignedToId) === String(user.id) || String(task.createdById) === String(user.id);
  if (user.role !== "admin" && !own) throw forbidden();
  return task;
}

export const PATCH = route(async ({ req, params, user }) => {
  const b = await readJson(req);
  const task = await load(params.id, user);
  const sql = db();
  const canEdit = user.role === "admin" || String(task.createdById) === String(user.id);
  const patch = {};
  if (b.status) {
    if (!["todo", "in_progress", "done"].includes(b.status)) throw badRequest("Status invalid");
    patch.status = b.status;
    patch.completedAt = b.status === "done" ? (task.completedAt || new Date()) : null;
  }
  let reassigned = false;
  if (canEdit) {
    if (b.title != null) {
      if (!String(b.title).trim()) throw badRequest("Titlul sarcinii este obligatoriu");
      patch.title = String(b.title).trim();
    }
    if (b.description != null) patch.description = b.description;
    if (b.priority != null) patch.priority = ["low", "normal", "high"].includes(b.priority) ? b.priority : "normal";
    if (b.dueDate !== undefined) patch.dueDate = b.dueDate ? new Date(b.dueDate) : null;
    if (b.customer !== undefined) patch.customerId = isUuid(String(b.customer || "")) ? b.customer : null;
    if (b.order !== undefined) patch.orderId = isUuid(String(b.order || "")) ? b.order : null;
    if (b.assignedTo && String(b.assignedTo) !== String(task.assignedToId)) {
      if (user.role !== "admin") throw forbidden("Doar administratorul poate reatribui sarcini");
      const [u] = isUuid(b.assignedTo) ? await sql`select id from users where id = ${b.assignedTo} and active` : [];
      if (!u) throw badRequest("Utilizator inexistent");
      patch.assignedToId = u._id;
      reassigned = true;
    }
  }
  if (Object.keys(patch).length) await sql`update tasks set ${sql(patch, ...Object.keys(patch))} where id = ${task._id}`;
  const fresh = await getTask(task._id);
  if (reassigned) await notifyTaskAssigned(fresh, user.id).catch(() => {});
  return fresh;
});

export const DELETE = route(async ({ params, user }) => {
  const task = await load(params.id, user);
  if (user.role !== "admin" && String(task.createdById) !== String(user.id)) throw forbidden();
  await db()`delete from tasks where id = ${task._id}`;
  return { deleted: true };
});
