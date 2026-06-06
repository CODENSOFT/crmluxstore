import Notification from "@/models/Notification";
import User from "@/models/User";

function buildMeta(order) {
  return {
    number: order.number,
    total: order.total,
    responsibleName: order.responsible?.name || "",
    createdByName: order.createdBy?.name || "",
    itemsCount: order.items?.length || 0,
    items: (order.items || []).map((it) => ({
      name: it.productName,
      quantity: it.quantity,
      unit: it.unit,
      warehouse: it.warehouse?.name || "",
      lineTotal: it.lineTotal,
    })),
  };
}

// Notifica toti adminii ca exista o comanda care necesita aprobare
export async function notifyAdminsForApproval(order, type = "order_approval") {
  const admins = await User.find({ role: "admin", active: true }).select("_id");
  const meta = buildMeta(order);
  const title =
    type === "order_new"
      ? `Comanda noua ${order.number}`
      : `Comanda ${order.number} asteapta aprobare`;
  const message =
    `Creata de ${meta.createdByName || "—"} · Responsabil: ${meta.responsibleName || "—"} · ` +
    `${meta.itemsCount} produse · ${Number(order.total).toFixed(2)}`;

  await Notification.insertMany(
    admins.map((a) => ({
      recipient: a._id,
      type,
      title,
      message,
      order: order._id,
      meta,
    }))
  );
}

// Notifica responsabilul ca i s-a atribuit o comanda noua (creata de admin)
export async function notifyAssigned(order) {
  if (!order.responsible) return;
  const recipientId = order.responsible._id || order.responsible;
  const creatorId = order.createdBy?._id || order.createdBy;
  // Nu ne notificam pe noi insine
  if (creatorId && String(recipientId) === String(creatorId)) return;

  const meta = buildMeta(order);
  await Notification.create({
    recipient: recipientId,
    type: "order_assigned",
    title: `Comanda noua atribuita: ${order.number}`,
    message: `Esti responsabil de aceasta comanda · ${meta.itemsCount} produse · ${Number(order.total).toFixed(2)}`,
    order: order._id,
    meta,
  });
}

// Notifica responsabilul ca decizia a fost luata (aprobat / respins)
export async function notifyDecision(order, decision) {
  if (!order.responsible) return;
  const recipientId = order.responsible._id || order.responsible;
  await Notification.create({
    recipient: recipientId,
    type: "order_decision",
    title:
      decision === "approve"
        ? `Comanda ${order.number} a fost aprobata`
        : `Comanda ${order.number} a fost respinsa`,
    message:
      decision === "approve"
        ? "Comanda a intrat in procesare."
        : "Comanda a fost respinsa de administrator.",
    order: order._id,
    meta: buildMeta(order),
  });
}

// Notifica adminii ca un manager a cerut modificarea unei comenzi
export async function notifyAdminsForEdit(order, requestedByName) {
  const admins = await User.find({ role: "admin", active: true }).select("_id");
  const meta = buildMeta(order);
  await Notification.insertMany(
    admins.map((a) => ({
      recipient: a._id,
      type: "order_edit",
      title: `Cerere de modificare: ${order.number}`,
      message: `${requestedByName || "Un manager"} vrea sa modifice comanda. Deschide pentru a vedea modificarile.`,
      order: order._id,
      meta,
    }))
  );
}

// Notifica responsabilul/creatorul ca modificarea a fost aprobata/respinsa
export async function notifyEditDecision(order, decision, recipientId) {
  if (!recipientId) return;
  await Notification.create({
    recipient: recipientId,
    type: "order_decision",
    title:
      decision === "approve"
        ? `Modificarea comenzii ${order.number} a fost aprobata`
        : `Modificarea comenzii ${order.number} a fost respinsa`,
    message:
      decision === "approve"
        ? "Modificarile au fost aplicate comenzii."
        : "Comanda ramane neschimbata.",
    order: order._id,
    meta: buildMeta(order),
  });
}

// Marcheaza ca citite notificarile de aprobare legate de o comanda
export async function clearApprovalNotifications(orderId) {
  await Notification.updateMany(
    { order: orderId, type: { $in: ["order_approval", "order_new"] } },
    { $set: { read: true } }
  );
}
