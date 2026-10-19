import { db, idOf, isUuid } from "./db";
import { UNIT_LABELS } from "./constants";

function buildMeta(order) {
  return {
    number: order.number,
    total: order.total,
    responsibleName: order.responsible?.name || "",
    createdByName: order.createdBy?.name || "",
    itemsCount: order.items?.length || 0,
    items: (order.items || []).slice(0, 12).map((it) => ({
      name: it.productName,
      quantity: it.quantity,
      unit: it.unit,
      warehouse: it.warehouse?.name || "",
      lineTotal: it.lineTotal,
    })),
  };
}

async function send(recipients, n) {
  const ids = [...new Set(recipients.map(idOf).filter(isUuid))];
  if (!ids.length) return;
  const sql = db();
  const rows = ids.map((recipientId) => ({
    recipientId,
    type: n.type || "system",
    title: n.title,
    message: n.message || null,
    link: n.link || null,
    orderId: isUuid(idOf(n.order)) ? idOf(n.order) : null,
    meta: n.meta ? sql.json(n.meta) : null,
  }));
  await sql`insert into notifications ${sql(rows, "recipientId", "type", "title", "message", "link", "orderId", "meta")}`;
}

async function adminIds() {
  const rows = await db()`select id from users where role = 'admin' and active`;
  return rows.map((r) => r._id);
}

// Cine poate aproba comenzi: administratorii + angajatii cu dreptul "orders.approve"
async function approverIds() {
  const rows = await db()`select id from users where active and (role = 'admin' or 'orders.approve' = any(permissions))`;
  return rows.map((r) => r._id);
}

async function activeUserIds() {
  const rows = await db()`select id from users where active`;
  return rows.map((r) => r._id);
}

const money = (n) => `${Number(n || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
const orderLink = (order) => `/comenzi/${order._id}`;

// Comanda creata de manager, asteapta aprobarea adminului
export async function notifyAdminsForApproval(order) {
  const meta = buildMeta(order);
  await send(await approverIds(), {
    type: "order_approval",
    title: `Comanda ${order.number} așteaptă aprobare`,
    message: `${meta.createdByName || "—"} · ${order.customerName || "client nespecificat"} · ${meta.itemsCount} produse · ${money(order.total)}`,
    link: orderLink(order),
    order: order._id,
    meta,
  });
}

// Comanda noua sosita de pe site / API — o vad toti utilizatorii activi
export async function notifyIncomingOrder(order, sourceLabel = "site") {
  const meta = buildMeta(order);
  await send(await activeUserIds(), {
    type: "site_order",
    title: `Comandă nouă de pe ${sourceLabel}: ${order.number}`,
    message: `${order.customerName || "Client"}${order.customerPhone ? ` · ${order.customerPhone}` : ""} · ${meta.itemsCount} produse · ${money(order.total)}`,
    link: orderLink(order),
    order: order._id,
    meta,
  });
}

// Responsabilul primeste o comanda atribuita de altcineva
export async function notifyAssigned(order, actorId) {
  const rid = idOf(order.responsible);
  if (!rid || rid === String(actorId)) return;
  const meta = buildMeta(order);
  await send([rid], {
    type: "order_assigned",
    title: `Ți s-a atribuit comanda ${order.number}`,
    message: `${order.customerName || "Client"} · ${meta.itemsCount} produse · ${money(order.total)}`,
    link: orderLink(order),
    order: order._id,
    meta,
  });
}

export async function notifyDecision(order, decision, actorId) {
  const targets = [idOf(order.responsible), idOf(order.createdBy)].filter((x) => x && x !== String(actorId));
  const approved = decision === "approve";
  await send(targets, {
    type: "order_decision",
    title: approved ? `Comanda ${order.number} a fost aprobată` : `Comanda ${order.number} a fost respinsă`,
    message: approved ? "Comanda a intrat în pregătire, stocul a fost rezervat." : order.cancelReason || "Comanda a fost respinsă de administrator.",
    link: orderLink(order),
    order: order._id,
    meta: buildMeta(order),
  });
}

export async function notifyAdminsForEdit(order, requestedByName) {
  await send(await approverIds(), {
    type: "order_edit",
    title: `Cerere de modificare: ${order.number}`,
    message: `${requestedByName || "Un angajat"} propune modificarea comenzii. Deschide pentru a compara.`,
    link: orderLink(order),
    order: order._id,
    meta: buildMeta(order),
  });
}

export async function notifyEditDecision(order, decision, recipientId) {
  const approved = decision === "approve";
  await send([recipientId], {
    type: "order_decision",
    title: approved ? `Modificarea comenzii ${order.number} a fost aprobată` : `Modificarea comenzii ${order.number} a fost respinsă`,
    message: approved ? "Modificările au fost aplicate." : "Comanda rămâne neschimbată.",
    link: orderLink(order),
    order: order._id,
    meta: buildMeta(order),
  });
}

export async function clearApprovalNotifications(orderId) {
  await db()`update notifications set read = true
             where order_id = ${idOf(orderId)} and type in ('order_approval', 'order_edit') and not read`;
}

export async function notifyTaskAssigned(task, actorId) {
  const rid = idOf(task.assignedTo);
  if (!rid || rid === String(actorId)) return;
  await send([rid], {
    type: "task_assigned",
    title: `Sarcină nouă: ${task.title}`,
    message: task.dueDate
      ? `Termen: ${new Date(task.dueDate).toLocaleDateString("ro-RO")}`
      : "Fără termen limită",
    link: "/sarcini",
  });
}

export async function notifyLowStock(product, total, limit) {
  await send(await adminIds(), {
    type: "low_stock",
    title: `Stoc critic: ${product.name}`,
    message: `Au rămas ${Number(total).toLocaleString("ro-RO")} ${UNIT_LABELS[product.unit] || ""} (prag minim ${limit}). Planificați o recepție.`,
    link: `/produse/${product._id}`,
  });
}

export async function notifyIntegrationError(title, message) {
  await send(await adminIds(), { type: "integration", title, message, link: "/integrari" });
}
