// Logica de business pentru comenzi — folosita de interfata, API v1 (1C) si site.
import mongoose from "mongoose";
import Order from "@/models/Order";
import User from "@/models/User";
import Customer from "@/models/Customer";
import { badRequest, forbidden, notFound, round2 } from "./api";
import { applyMovements, orderStockLines } from "./stock";
import { buildOrderLines, computeTotals, recalcPayments } from "./pricing";
import { getSettings } from "./settings";
import { nextNumber } from "./counters";
import { refreshCustomerStats, upsertCustomer } from "./customers";
import { logAudit } from "./audit";
import { emit, runAfter } from "./events";
import { ordersDTO } from "./dto";
import {
  notifyAdminsForApproval,
  notifyIncomingOrder,
  notifyAssigned,
  notifyDecision,
  notifyAdminsForEdit,
  notifyEditDecision,
  clearApprovalNotifications,
} from "./notify";
import {
  STAGE_KEYS,
  ORDER_STAGES,
  stageConsumesStock,
  stageInfo,
  isClosed,
  normalizeStage,
} from "./orderStages";
import { CHANNEL_KEYS, PAYMENT_METHOD_KEYS, channelLabel } from "./constants";

export const ORDER_POPULATE = [
  ["responsible", "name email"],
  ["createdBy", "name email"],
  ["approvedBy", "name email"],
  ["customer", "number name type phone email idno vatCode iban bank legalAddress city address segment priceType discount externalId"],
  ["items.warehouse", "name code"],
  ["pendingEdit.items.warehouse", "name"],
  ["pendingEdit.responsible", "name"],
  ["pendingEdit.customer", "name"],
];

export function populateOrder(q) {
  for (const [path, select] of ORDER_POPULATE) q = q.populate(path, select);
  return q;
}

export function loadOrder(id) {
  return populateOrder(Order.findById(id));
}

const idOf = (x) => (x ? String(x._id || x) : null);

// Comenzile noi venite din site / API / 1C sunt o "casuta comuna": le vede si le poate confirma orice manager
export const INCOMING_CHANNELS = ["site", "api", "1c"];
const isIncomingNew = (order) => order.status === "new" && INCOMING_CHANNELS.includes(order.channel);

export function orderPerms(order, user) {
  const isAdmin = user?.role === "admin";
  const isResponsible = idOf(order.responsible) === String(user?.id);
  const isCreator = idOf(order.createdBy) === String(user?.id);
  const shared = isIncomingNew(order);
  return { isAdmin, isResponsible, isCreator, shared, canView: isAdmin || isResponsible || isCreator || shared };
}

export function assertCanView(order, user) {
  if (!order) throw notFound("Comanda nu există");
  if (!orderPerms(order, user).canView) throw forbidden("Nu aveți acces la această comandă");
}

// Filtru de vizibilitate: managerul vede doar comenzile lui
export function visibilityFilter(user) {
  if (user.role === "admin") return {};
  const id = new mongoose.Types.ObjectId(String(user.id));
  return { $or: [{ createdBy: id }, { responsible: id }, { status: "new", channel: { $in: INCOMING_CHANNELS } }] };
}

// Utilizator "de sistem" pentru comenzile venite din site / API / 1C
export async function systemActor(name) {
  const admin = await User.findOne({ role: "admin", active: true }).sort({ createdAt: 1 }).lean();
  if (!admin) throw badRequest("Nu există niciun administrator activ în CRM");
  return { id: String(admin._id), name, role: "admin", system: true };
}

async function resolveCustomer(input) {
  let customer = null;
  if (input.customer) {
    customer = await Customer.findById(idOf(input.customer));
    if (!customer) throw badRequest("Clientul ales nu există");
  } else if (input.newCustomer?.name) {
    ({ customer } = await upsertCustomer(input.newCustomer));
  }
  return {
    customer,
    snapshot: {
      customerName: (input.customerName || customer?.name || "").trim() || undefined,
      customerPhone: (input.customerPhone || customer?.phone || "").trim() || undefined,
      customerEmail: (input.customerEmail || customer?.email || "").trim() || undefined,
    },
  };
}

function resolveDelivery(d = {}, settings, customer) {
  const methods = settings.deliveryMethods || [];
  const key = d.method || "pickup";
  const m = methods.find((x) => x.key === key);
  const cost = d.cost !== undefined && d.cost !== null && d.cost !== "" ? Number(d.cost) : m?.cost || 0;
  if (!(cost >= 0)) throw badRequest("Cost de livrare invalid");
  return {
    method: key,
    label: d.label || m?.label || key,
    cost: round2(cost),
    city: d.city ?? customer?.city,
    address: d.address ?? (key === "pickup" ? undefined : customer?.address),
    recipient: d.recipient,
    phone: d.phone,
    date: d.date ? new Date(d.date) : undefined,
    trackingNumber: d.trackingNumber,
  };
}

async function resolveResponsible(input, actor) {
  if (actor.role === "admin" && input.responsible) {
    const r = await User.findOne({ _id: idOf(input.responsible), active: true }).select("_id").lean();
    if (!r) throw badRequest("Responsabilul ales nu există sau este inactiv");
    return r._id;
  }
  if (input.responsibleEmail) {
    const r = await User.findOne({ email: String(input.responsibleEmail).toLowerCase().trim(), active: true })
      .select("_id")
      .lean();
    if (r) return r._id;
  }
  return actor.id;
}

// Dupa orice modificare: salvare, reincarcare populata, efecte secundare
async function finish(order, { action, actor, details, event, notify, customers = [] }) {
  await order.save();
  const populated = await loadOrder(order._id);
  runAfter(async () => {
    if (notify) await notify(populated);
    await logAudit({ action, order: populated, user: actor, details });
    const ids = new Set([idOf(populated.customer), ...customers.map(idOf)].filter(Boolean));
    for (const id of ids) await refreshCustomerStats(id);
    if (event) {
      const settings = await getSettings();
      emit(event, async () => (await ordersDTO([populated], settings.currency))[0]);
      if (populated.externalSource === "woo" && ["order.status_changed", "order.payment_added"].includes(event)) {
        const { queueWooOrderStatus } = await import("./woo");
        queueWooOrderStatus(populated);
      }
    }
  });
  return populated;
}

/**
 * Creeaza o comanda.
 * input: { items, customer | newCustomer, customerName, customerPhone, channel, delivery,
 *          paymentMethod, payments, note, internalNote, responsible, status, dueDate,
 *          externalSource, externalId, externalNumber }
 * opts:  { initialStatus, incoming: "site"|"API"|"1C", allowPriceEdit }
 */
export async function createOrder(input, actor, opts = {}) {
  const settings = await getSettings();
  const { customer, snapshot } = await resolveCustomer(input);

  const priceType = input.priceType || customer?.priceType || "retail";
  const isAdmin = actor.role === "admin";
  const items = await buildOrderLines(input.items, {
    priceType,
    customerDiscount: customer?.discount || 0,
    allowPriceEdit: opts.allowPriceEdit ?? (isAdmin || settings.requireApproval),
    settings,
    defaultWarehouse: input.warehouse || settings.defaultWarehouse,
  });
  const delivery = resolveDelivery(input.delivery, settings, customer);
  const totals = computeTotals(items, delivery.cost, settings);

  let status = opts.initialStatus;
  if (!status) {
    if (isAdmin) status = input.status === "new" ? "new" : "processing";
    else status = settings.requireApproval ? "pending_approval" : "processing";
  }
  if (!STAGE_KEYS.includes(status)) throw badRequest("Status inițial invalid");

  const channel = CHANNEL_KEYS.includes(input.channel) ? input.channel : "store";
  const paymentMethod = PAYMENT_METHOD_KEYS.includes(input.paymentMethod) ? input.paymentMethod : "cash";
  const responsible = await resolveResponsible(input, actor);

  const _id = new mongoose.Types.ObjectId();
  const number = await nextNumber("order");
  const consumes = stageConsumesStock(status);
  if (consumes) {
    await applyMovements(orderStockLines(items, -1), {
      refType: "Order",
      refId: _id,
      refNumber: number,
      user: actor,
    });
  }

  const order = new Order({
    _id,
    number,
    items,
    ...totals,
    status,
    channel,
    customer: customer?._id,
    ...snapshot,
    priceType,
    delivery,
    paymentMethod,
    payments: [],
    responsible,
    createdBy: actor.id,
    approvedBy: consumes && isAdmin ? actor.id : undefined,
    note: input.note,
    internalNote: input.internalNote,
    stockApplied: consumes,
    completedAt: status === "completed" ? new Date() : undefined,
    externalSource: input.externalSource,
    externalId: input.externalId ? String(input.externalId) : undefined,
    externalNumber: input.externalNumber,
    dueDate: input.dueDate
      ? new Date(input.dueDate)
      : customer?.paymentTermDays
        ? new Date(Date.now() + customer.paymentTermDays * 86400000)
        : undefined,
  });

  for (const p of input.payments || []) {
    const amount = round2(p.amount);
    if (amount > 0) {
      order.payments.push({
        amount,
        method: PAYMENT_METHOD_KEYS.includes(p.method) ? p.method : paymentMethod,
        date: p.date ? new Date(p.date) : new Date(),
        reference: p.reference,
        note: p.note,
        createdBy: actor.system ? undefined : actor.id,
        createdByName: actor.name,
      });
    }
  }
  recalcPayments(order);

  try {
    return await finish(order, {
      action: opts.incoming ? "imported" : "created",
      actor,
      details: `${channelLabel(channel)} · ${items.length} produse · total ${totals.total} · ${stageInfo(status).label}`,
      event: "order.created",
      notify: async (o) => {
        if (status === "pending_approval") await notifyAdminsForApproval(o);
        if (opts.incoming) await notifyIncomingOrder(o, opts.incoming);
        else if (isAdmin) await notifyAssigned(o, actor.id);
      },
    });
  } catch (e) {
    if (consumes) {
      await applyMovements(orderStockLines(items, +1), {
        refType: "Order",
        refId: _id,
        refNumber: number,
        user: actor,
        note: "Anulare automată (eroare la salvare)",
        silent: true,
      }).catch(() => {});
    }
    throw e;
  }
}

/* ---------- Aprobare / respingere ---------- */
export async function approveOrder(order, actor) {
  const p = orderPerms(order, actor);
  // Managerul poate confirma comenzile noi venite din site (si le preia ca responsabil)
  const managerConfirm = !p.isAdmin && p.shared;
  if (actor.role !== "admin" && !managerConfirm) throw forbidden("Doar administratorul poate aproba comenzi");
  if (!["new", "pending_approval"].includes(normalizeStage(order.status)))
    throw badRequest("Comanda nu mai așteaptă aprobare");
  if (managerConfirm) order.responsible = actor.id;
  if (!order.stockApplied) {
    await applyMovements(orderStockLines(order.items, -1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor,
    });
    order.stockApplied = true;
  }
  order.status = "processing";
  order.approvedBy = actor.id;
  return finish(order, {
    action: "approved",
    actor,
    event: "order.status_changed",
    notify: async (o) => {
      await clearApprovalNotifications(o._id);
      await notifyDecision(o, "approve", actor.id);
    },
  });
}

export async function rejectOrder(order, actor, reason) {
  if (actor.role !== "admin") throw forbidden("Doar administratorul poate respinge comenzi");
  if (isClosed(order.status)) throw badRequest("Comanda este deja închisă");
  if (order.stockApplied) {
    await applyMovements(orderStockLines(order.items, +1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Comandă respinsă",
    });
    order.stockApplied = false;
  }
  order.status = "rejected";
  order.approvedBy = actor.id;
  order.cancelReason = reason || undefined;
  return finish(order, {
    action: "rejected",
    actor,
    details: reason,
    event: "order.status_changed",
    notify: async (o) => {
      await clearApprovalNotifications(o._id);
      await notifyDecision(o, "reject", actor.id);
    },
  });
}

export async function cancelOrder(order, actor, reason) {
  const p = orderPerms(order, actor);
  const st = normalizeStage(order.status);
  if (["cancelled", "rejected"].includes(st)) throw badRequest("Comanda este deja anulată");
  if (!p.isAdmin) {
    if (!(p.isCreator || p.isResponsible)) throw forbidden();
    if (!["new", "pending_approval"].includes(st))
      throw forbidden("Doar administratorul poate anula o comandă aflată în lucru");
  }
  if (order.stockApplied) {
    await applyMovements(orderStockLines(order.items, +1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Comandă anulată",
    });
    order.stockApplied = false;
  }
  order.status = "cancelled";
  order.cancelReason = reason || undefined;
  return finish(order, {
    action: "cancelled",
    actor,
    details: reason,
    event: "order.status_changed",
    notify: (o) => clearApprovalNotifications(o._id),
  });
}

/* ---------- Schimbare stadiu ---------- */
export async function setOrderStage(order, stage, actor) {
  stage = normalizeStage(stage);
  if (!ORDER_STAGES.some((s) => s.key === stage)) throw badRequest("Stadiu invalid");
  const p = orderPerms(order, actor);
  const cur = normalizeStage(order.status);
  if (isClosed(cur) && cur !== "completed") throw badRequest("Comanda este închisă");
  if (!p.isAdmin) {
    if (!(p.isResponsible || p.isCreator)) throw forbidden();
    if (["new", "pending_approval"].includes(cur))
      throw forbidden("Comanda trebuie aprobată de administrator întâi");
    if (["new", "pending_approval"].includes(stage) || cur === "completed")
      throw forbidden("Această acțiune este permisă doar administratorului");
  }
  if (stage === cur) return loadOrder(order._id);

  if (stageConsumesStock(stage) && !order.stockApplied) {
    await applyMovements(orderStockLines(order.items, -1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor,
    });
    order.stockApplied = true;
    if (!order.approvedBy) order.approvedBy = actor.id;
  } else if (!stageConsumesStock(stage) && order.stockApplied) {
    await applyMovements(orderStockLines(order.items, +1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Comandă readusă la stadiul inițial",
    });
    order.stockApplied = false;
  }
  order.status = stage;
  order.completedAt = stage === "completed" ? new Date() : undefined;
  return finish(order, {
    action: "stage_changed",
    actor,
    details: `${stageInfo(cur).label} → ${stageInfo(stage).label}`,
    event: "order.status_changed",
  });
}

/* ---------- Editare ---------- */
async function buildEdit(order, edit, actor, settings) {
  const { customer, snapshot } = await resolveCustomer({
    customer: edit.customer !== undefined ? edit.customer : order.customer,
    newCustomer: edit.newCustomer,
    customerName: edit.customerName ?? (edit.customer !== undefined ? undefined : order.customerName),
    customerPhone: edit.customerPhone ?? (edit.customer !== undefined ? undefined : order.customerPhone),
  });
  const priceType = customer?.priceType || order.priceType || "retail";
  const items = await buildOrderLines(edit.items, {
    priceType,
    customerDiscount: customer?.discount || 0,
    allowPriceEdit: actor.role === "admin" || settings.requireApproval,
    settings,
    defaultWarehouse: settings.defaultWarehouse,
  });
  const delivery = resolveDelivery(edit.delivery || order.delivery || {}, settings, customer);
  const totals = computeTotals(items, delivery.cost, settings);
  return { customer, snapshot, priceType, items, delivery, totals };
}

export async function editOrder(order, edit, actor) {
  const p = orderPerms(order, actor);
  if (!p.canView) throw forbidden();
  const st = normalizeStage(order.status);
  if (isClosed(st)) throw badRequest("Comanda finalizată / anulată nu mai poate fi editată");
  const settings = await getSettings();
  const b = await buildEdit(order, edit, actor, settings);
  const previousCustomer = order.customer;

  const direct = p.isAdmin || ["new", "pending_approval"].includes(st);
  if (direct) {
    if (order.stockApplied) {
      await applyMovements(
        [...orderStockLines(order.items, +1), ...orderStockLines(b.items, -1)],
        { refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Editare comandă" }
      );
    }
    order.items = b.items;
    Object.assign(order, b.totals);
    order.customer = b.customer?._id;
    Object.assign(order, b.snapshot);
    order.priceType = b.priceType;
    order.delivery = b.delivery;
    if (edit.paymentMethod && PAYMENT_METHOD_KEYS.includes(edit.paymentMethod)) order.paymentMethod = edit.paymentMethod;
    if (edit.channel && CHANNEL_KEYS.includes(edit.channel)) order.channel = edit.channel;
    if (edit.note !== undefined) order.note = edit.note;
    if (edit.internalNote !== undefined) order.internalNote = edit.internalNote;
    if (edit.dueDate !== undefined) order.dueDate = edit.dueDate ? new Date(edit.dueDate) : undefined;
    if (p.isAdmin && edit.responsible) order.responsible = await resolveResponsible(edit, actor);
    order.pendingEdit = undefined;
    recalcPayments(order);
    return finish(order, {
      action: "edited",
      actor,
      details: `${b.items.length} produse · total ${b.totals.total}`,
      event: "order.updated",
      customers: [previousCustomer],
      notify: (o) => clearApprovalNotifications(o._id),
    });
  }

  // Comanda aflata in lucru: managerul propune modificarea, adminul aproba
  order.pendingEdit = {
    items: b.items,
    ...b.totals,
    customer: b.customer?._id,
    ...b.snapshot,
    note: edit.note ?? order.note,
    delivery: b.delivery,
    requestedBy: actor.id,
    requestedByName: actor.name,
    requestedAt: new Date(),
  };
  return finish(order, {
    action: "edit_requested",
    actor,
    details: `total propus ${b.totals.total}`,
    notify: (o) => notifyAdminsForEdit(o, actor.name),
  });
}

export async function decideEdit(order, decision, actor) {
  if (actor.role !== "admin") throw forbidden("Doar administratorul poate decide asupra modificărilor");
  const pe = order.pendingEdit;
  if (!pe) throw badRequest("Nu există modificări în așteptare");
  const requestedBy = pe.requestedBy;
  const previousCustomer = order.customer;
  if (decision === "approve") {
    if (order.stockApplied) {
      await applyMovements(
        [...orderStockLines(order.items, +1), ...orderStockLines(pe.items, -1)],
        { refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Modificare aprobată" }
      );
    }
    order.items = pe.items;
    order.total = pe.total;
    order.subtotal = pe.subtotal;
    order.vatTotal = pe.vatTotal;
    order.customer = pe.customer;
    order.customerName = pe.customerName;
    order.customerPhone = pe.customerPhone;
    order.note = pe.note;
    if (pe.delivery) order.delivery = pe.delivery;
    recalcPayments(order);
  }
  order.pendingEdit = undefined;
  const approved = decision === "approve";
  return finish(order, {
    action: approved ? "edit_approved" : "edit_rejected",
    actor,
    details: approved ? `total ${order.total}` : undefined,
    event: approved ? "order.updated" : undefined,
    customers: [previousCustomer],
    notify: async (o) => {
      await clearApprovalNotifications(o._id);
      await notifyEditDecision(o, decision, requestedBy);
    },
  });
}

/* ---------- Plati ---------- */
export async function addPayment(order, data, actor) {
  const p = orderPerms(order, actor);
  if (!p.canView) throw forbidden();
  if (["cancelled", "rejected"].includes(normalizeStage(order.status)))
    throw badRequest("Nu se pot înregistra plăți pe o comandă anulată");
  const amount = round2(data.amount);
  if (!(amount > 0)) throw badRequest("Suma trebuie să fie mai mare ca 0");
  const remaining = round2((order.total || 0) - (order.paidAmount || 0));
  if (amount > remaining + 0.01)
    throw badRequest(`Suma depășește restul de plată (${remaining.toFixed(2)})`);
  order.payments.push({
    amount,
    method: PAYMENT_METHOD_KEYS.includes(data.method) ? data.method : order.paymentMethod || "cash",
    date: data.date ? new Date(data.date) : new Date(),
    reference: data.reference,
    note: data.note,
    createdBy: actor.system ? undefined : actor.id,
    createdByName: actor.name,
  });
  recalcPayments(order);
  return finish(order, {
    action: "payment_added",
    actor,
    details: `${amount.toFixed(2)} · ${data.method || order.paymentMethod}`,
    event: "order.payment_added",
  });
}

export async function removePayment(order, paymentId, actor) {
  if (actor.role !== "admin") throw forbidden("Doar administratorul poate șterge plăți");
  const pay = order.payments.id(paymentId);
  if (!pay) throw notFound("Plata nu există");
  const amount = pay.amount;
  pay.deleteOne();
  recalcPayments(order);
  return finish(order, {
    action: "payment_removed",
    actor,
    details: `${Number(amount).toFixed(2)}`,
    event: "order.updated",
  });
}

/* ---------- Stergere ---------- */
export async function deleteOrder(order, actor) {
  if (actor.role !== "admin") throw forbidden("Doar administratorul poate șterge comenzi");
  if (order.stockApplied) {
    await applyMovements(orderStockLines(order.items, +1), {
      refType: "Order", refId: order._id, refNumber: order.number, user: actor, note: "Comandă ștearsă",
    });
  }
  const customer = order.customer;
  await logAudit({ action: "deleted", order, user: actor, details: `Comanda ${order.number} ștearsă` });
  await order.deleteOne();
  runAfter(async () => {
    if (customer) await refreshCustomerStats(customer);
    emit("order.deleted", { id: String(order._id), number: order.number });
  });
  return { deleted: true };
}

/* ---------- Facturare / export ---------- */
export async function setInvoice(order, { number, date }, actor) {
  const p = orderPerms(order, actor);
  if (!p.canView) throw forbidden();
  order.invoice = { number: number || order.invoice?.number, date: date ? new Date(date) : order.invoice?.date || new Date() };
  return finish(order, { action: "edited", actor, details: `Factură ${order.invoice.number || ""}`, event: "order.updated" });
}

export async function markExported1c(order, { docNumber, docId }, actor) {
  order.export1c = { exportedAt: new Date(), docNumber, docId };
  return finish(order, { action: "edited", actor, details: `Export 1C ${docNumber || docId || ""}`, event: "order.updated" });
}

// Dispecer comun pentru actiunile PATCH (interfata interna)
export async function runOrderAction(order, body, actor) {
  const { action } = body;
  if (body.edit) return editOrder(order, body.edit, actor);
  switch (action) {
    case "approve": return approveOrder(order, actor);
    case "reject": return rejectOrder(order, actor, body.reason);
    case "cancel": return cancelOrder(order, actor, body.reason);
    case "approve_edit": return decideEdit(order, "approve", actor);
    case "reject_edit": return decideEdit(order, "reject", actor);
    case "stage": return setOrderStage(order, body.stage, actor);
    case "invoice": return setInvoice(order, body.invoice || {}, actor);
    case "delivery": {
      const p = orderPerms(order, actor);
      if (!p.canView) throw forbidden();
      const d = body.delivery || {};
      if (!order.delivery) order.delivery = {};
      for (const f of ["trackingNumber", "recipient", "phone", "city", "address"]) if (d[f] !== undefined) order.delivery[f] = d[f];
      if (d.date !== undefined) order.delivery.date = d.date ? new Date(d.date) : undefined;
      return finish(order, { action: "edited", actor, details: "Date livrare actualizate", event: "order.updated" });
    }
    default:
      if (body.stage) return setOrderStage(order, body.stage, actor);
      throw badRequest("Acțiune invalidă");
  }
}
