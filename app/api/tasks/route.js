import { db, isUuid, where } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { emit } from "@/lib/events";
import { notifyTaskAssigned } from "@/lib/notify";
import { taskSelect, getTask } from "@/lib/tasks";

const PRIORITIES = ["low", "normal", "high"];

export const GET = route(async ({ user, query }) => {
  const sql = db();
  const conds = [];
  if (user.role !== "admin" || query.get("mine") === "1") {
    conds.push(sql`(t.assigned_to_id = ${user.id} or t.created_by_id = ${user.id})`);
  }
  for (const [param, col] of [["assignedTo", "assigned_to_id"], ["customer", "customer_id"], ["order", "order_id"]]) {
    const v = query.get(param);
    if (v) conds.push(isUuid(v) ? sql`${sql("t." + col)} = ${v}` : sql`false`);
  }
  if (query.get("status")) conds.push(sql`t.status = ${query.get("status")}`);
  if (query.get("hideDone") === "1") conds.push(sql`(t.status <> 'done' or t.completed_at >= now() - interval '7 days')`);
  return sql`
    select ${taskSelect(sql)} from tasks t where ${where(conds)}
    order by t.status, t.due_date nulls last, t.created_at desc limit 500`;
});

export const POST = route(async ({ req, user }) => {
  const b = await readJson(req);
  if (!b.title?.trim()) throw badRequest("Titlul sarcinii este obligatoriu");
  const sql = db();
  let assignee = user.id;
  if (b.assignedTo && b.assignedTo !== user.id) {
    if (user.role !== "admin") throw badRequest("Doar administratorul poate atribui sarcini altor persoane");
    const [u] = isUuid(b.assignedTo) ? await sql`select id from users where id = ${b.assignedTo} and active` : [];
    if (!u) throw badRequest("Utilizatorul ales nu există");
    assignee = u._id;
  }
  const [row] = await sql`insert into tasks ${sql({
    title: b.title.trim(),
    description: b.description || null,
    assignedToId: assignee,
    createdById: user.id,
    dueDate: b.dueDate ? new Date(b.dueDate) : null,
    priority: PRIORITIES.includes(b.priority) ? b.priority : "normal",
    customerId: isUuid(String(b.customer || "")) ? b.customer : null,
    orderId: isUuid(String(b.order || "")) ? b.order : null,
  })} returning id`;
  const task = await getTask(row._id);
  await notifyTaskAssigned(task, user.id).catch(() => {});
  emit("task.created", {
    id: String(task._id),
    title: task.title,
    assignedTo: task.assignedTo?.name || null,
    dueDate: task.dueDate || null,
    priority: task.priority,
  });
  return task;
});
