// Logica de business pentru comenzi — folosita de interfata, API v1 (1C) si site.
// Fiecare operatiune ruleaza intr-o tranzactie Postgres: comanda se blocheaza (FOR UPDATE),
// stocul se modifica atomic, iar efectele (notificari, webhook-uri, site) ruleaza dupa commit.
import { db, idOf, isUuid } from "./db";
import { can } from "./permissions";
import { badRequest, forbidden, notFound, round2 } from "./api";
import { applyMovements, afterStock, orderStockLines } from "./stock";
import { buildOrderLines, computeTotals } from "./pricing";
import { getSettings } from "./settings";
import { nextNumber } from "./counters";
import { getCustomer, refreshCustomerStats, upsertCustomer } from "./customers";
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
import { STAGE_KEYS, ORDER_STAGES, stageConsumesStock, stageInfo, isClosed, normalizeStage } from "./orderStages";
import { CHANNEL_KEYS, PAYMENT_METHOD_KEYS, channelLabel } from "./constants";

/* ---------------- Citire ---------------- */

// Comanda completa, in forma asteptata de interfata (responsabil, client, linii cu depozit, plati)
export function orderSelect(q) {
  return q`
    select o.*,
      (select json_build_object('_id', u.id, 'name', u.name, 'email', u.email) from users u where u.id = o.responsible_id) as responsible,
      (select json_build_object('_id', u.id, 'name', u.name, 'email', u.email) from users u where u.id = o.created_by_id) as created_by,
      (select json_build_object('_id', u.id, 'name', u.name, 'email', u.email) from users u where u.id = o.approved_by_id) as approved_by,
      (select json_build_object('_id', c.id, 'number', c.number, 'name', c.name, 'type', c.type, 'phone', c.phone, 'email', c.email,
              'idno', c.idno, 'vatCode', c.vat_code, 'iban', c.iban, 'bank', c.bank, 'legalAddress', c.legal_address,
              'city', c.city, 'address', c.address, 'segment', c.segment, 'priceType', c.price_type, 'discount', c.discount,
              'paymentTermDays', c.payment_term_days, 'externalId', c.external_id)
         from customers c where c.id = o.customer_id) as customer,
      coalesce((select json_agg(json_build_object(
              'product', i.product_id, 'productName', i.product_name, 'sku', i.sku,
              'warehouse', case when w.id is null then null else json_build_object('_id', w.id, 'name', w.name, 'code', w.code, 'externalId', w.external_id) end,
              'quantity', i.quantity, 'unit', i.unit, 'unitPrice', i.unit_price, 'discount', i.discount,
              'lineTotal', i.line_total, 'vatRate', i.vat_rate, 'costPrice', i.cost_price) order by i.position)
         from order_items i left join warehouses w on w.id = i.warehouse_id where i.order_id = o.id), '[]'::json) as items,
      coalesce((select json_agg(json_build_object('_id', pm.id, 'amount', pm.amount, 'method', pm.method, 'date', pm.date,
              'note', pm.note, 'reference', pm.reference, 'createdBy', pm.created_by_id, 'createdByName', pm.created_by_name)
              order by pm.date, pm.created_at)
         from payments pm where pm.order_id = o.id), '[]'::json) as payments
    from orders o`;
}

export async function loadOrder(id, q = db()) {
  if (!isUuid(String(idOf(id)))) return null;
  const [o] = await q`${orderSelect(q)} where o.id = ${idOf(id)}`;
  if (!o) return null;
  if (o.pendingEdit?.items?.length) {
    const wids = [...new Set(o.pendingEdit.items.map((i) => idOf(i.warehouse)).filter((x) => isUuid(String(x))))];
    const ws = wids.length ? await q`select id, name from warehouses where id in ${q(wids)}` : [];
    const byId = new Map(ws.map((w) => [String(w._id), w]));
    o.pendingEdit.items = o.pendingEdit.items.map((i) => ({ ...i, warehouse: byId.get(String(idOf(i.warehouse))) || i.warehouse }));
  }
  return o;
}

// Randul brut (fara populare) — pentru verificari de acces rapide
export async function loadOrderRow(id, q = db()) {
  if (!isUuid(String(idOf(id)))) return null;
  const [o] = await q`select * from orders where id = ${idOf(id)}`;
  return o || null;
}

/* ---------------- Drepturi ---------------- */

// Comenzile noi venite din site / API / 1C sunt o "casuta comuna": le vede si le poate confirma orice manager
export const INCOMING_CHANNELS = ["site", "telegram", "api", "1c"];
const isIncomingNew = (o) => o.status === "new" && INCOMING_CHANNELS.includes(o.channel);

// Pentru comenzi, "isAdmin" = administrator sau angajat cu dreptul "Aprobă și gestionează comenzi"
export function orderPerms(order, user) {
  const isAdmin = can(user, "orders.approve");
  const seesAll = isAdmin || can(user, "orders.all");
  const resp = String(order.responsibleId ?? idOf(order.responsible) ?? "");
  const creator = String(order.createdById ?? idOf(order.createdBy) ?? "");
  const isResponsible = resp === String(user?.id);
  const isCreator = creator === String(user?.id);
  const shared = isIncomingNew(order);
  return { isAdmin, isResponsible, isCreator, shared, canView: seesAll || isResponsible || isCreator || shared };
}

export function assertCanView(order, user) {
  if (!order) throw notFound("Comanda nu există");
  if (!orderPerms(order, user).canView) throw forbidden("Nu aveți acces la această comandă");
}

/** Fragment SQL: angajatul vede doar comenzile lui (+ casuta comuna); adminul / dreptul "Vede toate comenzile" vede tot */
export function visibilityFilter(user, alias = "o") {
  const sql = db();
  if (can(user, "orders.all") || can(user, "orders.approve")) return sql`true`;
  const a = sql(alias);
  return sql`(${a}.created_by_id = ${user.id} or ${a}.responsible_id = ${user.id}
              or (${a}.status = 'new' and ${a}.channel in ${sql(INCOMING_CHANNELS)}))`;
}

// Utilizator "de sistem" pentru comenzile venite din site / API / 1C
export async function systemActor(name) {
  const [admin] = await db()`select id from users where role in ('owner', 'admin') and active order by role = 'owner' desc, created_at limit 1`;
  if (!admin) throw badRequest("Nu există niciun administrator activ în CRM");
  return { id: admin._id, name, role: "admin", system: true };
}

/* ---------------- Ajutatoare ---------------- */

async function resolveCustomer(input, t) {
  let customer = null;
  const cid = idOf(input.customer);
  if (cid) {
    customer = await getCustomer(cid, t);
    if (!customer) throw badRequest("Clientul ales nu există");
  } else if (input.newCustomer?.name) {
    ({ customer } = await upsertCustomer(input.newCustomer, t));
  }
  const clean = (v) => (v == null ? "" : String(v)).trim() || null;
  return {
    customer,
    snapshot: {
      customerName: clean(input.customerName) || customer?.name || null,
      customerPhone: clean(input.customerPhone) || customer?.phone || null,
      customerEmail: clean(input.customerEmail) || customer?.email || null,
    },
  };
}

function resolveDelivery(d = {}, settings, customer) {
  const methods = settings.deliveryMethods || [];
  const key = d.method || "pickup";
  const m = methods.find((x) => x.key === key);
  const cost = d.cost !== undefined && d.cost !== null && d.cost !== "" ? Number(d.cost) : m?.cost || 0;
  if (!(cost >= 0)) throw badRequest("Cost de livrare invalid");
  const clean = (v) => (v == null || v === "" ? undefined : v);
  return JSON.parse(
    JSON.stringify({
      method: key,
      label: d.label || m?.label || key,
      cost: round2(cost),
      city: clean(d.city) ?? clean(customer?.city),
      address: clean(d.address) ?? (key === "pickup" ? undefined : clean(customer?.address)),
      recipient: clean(d.recipient),
      phone: clean(d.phone),
      date: d.date ? new Date(d.date) : undefined,
      trackingNumber: clean(d.trackingNumber),
    })
  );
}

async function resolveResponsible(input, actor, t) {
  const rid = idOf(input.responsible);
  if (can(actor, "orders.approve") && rid) {
    if (!isUuid(String(rid))) throw badRequest("Responsabil invalid");
    const [r] = await t`select id from users where id = ${rid} and active`;
    if (!r) throw badRequest("Responsabilul ales nu există sau este inactiv");
    return r._id;
  }
  if (input.responsibleEmail) {
    const [r] = await t`select id from users where lower(email) = ${String(input.responsibleEmail).toLowerCase().trim()} and active`;
    if (r) return r._id;
  }
  return actor.id;
}

async function writeItems(t, orderId, items) {
  await t`delete from order_items where order_id = ${orderId}`;
  if (!items.length) return;
  const rows = items.map((it, i) => ({
    orderId,
    position: i,
    productId: idOf(it.product),
    productName: it.productName,
    sku: it.sku || null,
    warehouseId: idOf(it.warehouse),
    quantity: it.quantity,
    unit: it.unit || null,
    unitPrice: it.unitPrice,
    discount: it.discount || 0,
    lineTotal: it.lineTotal,
    vatRate: it.vatRate || 0,
    costPrice: it.costPrice ?? null,
  }));
  await t`insert into order_items ${t(rows)}`;
}

// Linii serializabile (pentru pendingEdit)
const plainItems = (items) =>
  items.map((it) => ({
    product: idOf(it.product),
    productName: it.productName,
    sku: it.sku || null,
    warehouse: idOf(it.warehouse),
    quantity: it.quantity,
    unit: it.unit,
    unitPrice: it.unitPrice,
    discount: it.discount || 0,
    lineTotal: it.lineTotal,
    vatRate: it.vatRate || 0,
    costPrice: it.costPrice ?? null,
  }));

// Recalculeaza suma achitata si statusul platii din tabelul de plati
async function recalcPayments(t, orderId) {
  await t`
    update orders o set
      paid_amount = p.paid,
      payment_status = case when o.total <= 0 then 'paid'
                            when p.paid <= 0 then 'unpaid'
                            when p.paid + 0.009 >= o.total then 'paid'
                            else 'partial' end
    from (select coalesce(sum(amount), 0) as paid from payments where order_id = ${orderId}) p
    where o.id = ${orderId}`;
}

async function lockOrder(t, id) {
  if (!isUuid(String(idOf(id)))) throw notFound("Comanda nu există");
  const [o] = await t`select * from orders where id = ${idOf(id)} for update`;
  if (!o) throw notFound("Comanda nu există");
  o.items = await t`select * from order_items where order_id = ${o._id} order by position`;
  return o;
}

const stockCtx = (o, actor, note) => ({ refType: "Order", refId: o._id, refNumber: o.number, user: actor, note });

// Efecte dupa commit: notificari, istoric, statistici client, webhook-uri, site
function afterCommit(populated, { action, actor, details, event, notify, customers = [] }) {
  runAfter(async () => {
    if (notify) await notify(populated);
    await logAudit({ action, order: populated, user: actor, details });
    const ids = new Set([idOf(populated.customer) || populated.customerId, ...customers.map(idOf)].filter((x) => isUuid(String(x))));
    for (const id of ids) await refreshCustomerStats(id);
    if (event) {
      const settings = await getSettings();
      emit(event, async () => (await ordersDTO([populated], settings.currency))[0]);
      if (populated.externalSource === "woo" && ["order.status_changed", "order.payment_added"].includes(event)) {
        const { queueWooOrderStatus } = await import("./woo");
        queueWooOrderStatus(populated);
      }
      // Clientul din Telegram afla singur cand comanda lui avanseaza
      if (populated.telegramChatId && event === "order.status_changed") {
        const { notifyTelegramOrderStatus } = await import("./telegram/bot");
        await notifyTelegramOrderStatus(populated).catch(() => {});
      }
    }
  });
}

/** Ruleaza o modificare pe comanda (blocata) in tranzactie, apoi efectele. */
async function mutate(orderId, actor, fn) {
  let effects;
  let moved = [];
  await db().begin(async (t) => {
    const o = await lockOrder(t, orderId);
    effects = (await fn(t, o)) || {};
    moved = effects.moved || [];
  });
  afterStock(moved, { refType: "Order", refId: orderId });
  const populated = await loadOrder(orderId);
  if (effects.action) afterCommit(populated, { actor, ...effects });
  return populated;
}

/* ---------------- Creare ---------------- */
/**
 * input: { items, customer | newCustomer, customerName, customerPhone, channel, delivery,
 *          paymentMethod, payments, note, internalNote, responsible, status, dueDate,
 *          externalSource, externalId, externalNumber }
 * opts:  { initialStatus, incoming: "site"|"API"|"1C", allowPriceEdit }
 */
export async function createOrder(input, actor, opts = {}) {
  const settings = await getSettings();
  const isAdmin = can(actor, "orders.approve");
  let created;
  await db().begin(async (t) => {
    const { customer, snapshot } = await resolveCustomer(input, t);
    const priceType = input.priceType || customer?.priceType || "retail";
    const items = await buildOrderLines(
      input.items,
      {
        priceType,
        customerDiscount: customer?.discount || 0,
        allowPriceEdit: opts.allowPriceEdit ?? (isAdmin || settings.requireApproval),
        customerId: customer?._id,
        settings,
        defaultWarehouse: input.warehouse || settings.defaultWarehouse,
      },
      t
    );
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
    const responsibleId = await resolveResponsible(input, actor, t);
    const consumes = stageConsumesStock(status);
    const number = await nextNumber("order", t);
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : customer?.paymentTermDays
        ? new Date(Date.now() + customer.paymentTermDays * 86400000)
        : null;

    const [row] = await t`insert into orders ${t({
      number,
      status,
      channel,
      customerId: customer?._id || null,
      ...snapshot,
      priceType,
      subtotal: totals.subtotal,
      vatTotal: totals.vatTotal,
      total: totals.total,
      delivery: t.json(delivery),
      paymentMethod,
      dueDate,
      responsibleId,
      createdById: actor.id,
      approvedById: consumes && isAdmin ? actor.id : null,
      note: input.note || null,
      internalNote: input.internalNote || null,
      stockApplied: consumes,
      completedAt: status === "completed" ? new Date() : null,
      externalSource: input.externalSource || null,
      externalId: input.externalId ? String(input.externalId) : null,
      externalNumber: input.externalNumber || null,
      telegramChatId: input.telegramChatId || null,
    })} returning id`;
    const orderId = row._id;
    await writeItems(t, orderId, items);

    let moved = [];
    if (consumes) moved = await applyMovements(orderStockLines(items, -1), { refType: "Order", refId: orderId, refNumber: number, user: actor }, t);

    const payRows = (input.payments || [])
      .map((p) => ({ amount: round2(p.amount), p }))
      .filter((x) => x.amount > 0)
      .map(({ amount, p }) => ({
        orderId,
        amount: Math.min(amount, totals.total),
        method: PAYMENT_METHOD_KEYS.includes(p.method) ? p.method : paymentMethod,
        date: p.date ? new Date(p.date) : new Date(),
        reference: p.reference || null,
        note: p.note || null,
        createdById: actor.system ? null : actor.id,
        createdByName: actor.name,
      }));
    if (payRows.length) await t`insert into payments ${t(payRows)}`;
    await recalcPayments(t, orderId);
    created = { orderId, number, status, channel, items, totals, moved };
  });

  afterStock(created.moved, { refType: "Order", refId: created.orderId, refNumber: created.number });
  const populated = await loadOrder(created.orderId);
  afterCommit(populated, {
    action: opts.incoming ? "imported" : "created",
    actor,
    details: `${channelLabel(created.channel)} · ${created.items.length} produse · total ${created.totals.total} · ${stageInfo(created.status).label}`,
    event: "order.created",
    notify: async (o) => {
      if (created.status === "pending_approval") await notifyAdminsForApproval(o);
      if (opts.incoming) await notifyIncomingOrder(o, opts.incoming);
      else if (isAdmin) await notifyAssigned(o, actor.id);
    },
  });
  return populated;
}

/* ---------------- Aprobare / respingere / anulare ---------------- */
export function approveOrder(orderId, actor) {
  return mutate(orderId, actor, async (t, o) => {
    const p = orderPerms(o, actor);
    // Managerul poate confirma comenzile noi venite din site (si le preia ca responsabil)
    const managerConfirm = !p.isAdmin && p.shared;
    if (!p.isAdmin && !managerConfirm) throw forbidden("Nu aveți dreptul să aprobați comenzi");
    if (!["new", "pending_approval"].includes(normalizeStage(o.status))) throw badRequest("Comanda nu mai așteaptă aprobare");
    let moved = [];
    if (!o.stockApplied) moved = await applyMovements(orderStockLines(o.items, -1), stockCtx(o, actor), t);
    await t`update orders set status = 'processing', stock_applied = true, approved_by_id = ${actor.id},
              responsible_id = ${managerConfirm ? actor.id : o.responsibleId} where id = ${o._id}`;
    return {
      moved,
      action: "approved",
      event: "order.status_changed",
      notify: async (po) => {
        await clearApprovalNotifications(po._id);
        await notifyDecision(po, "approve", actor.id);
      },
    };
  });
}

export function rejectOrder(orderId, actor, reason) {
  return mutate(orderId, actor, async (t, o) => {
    if (!can(actor, "orders.approve")) throw forbidden("Nu aveți dreptul să respingeți comenzi");
    if (isClosed(o.status)) throw badRequest("Comanda este deja închisă");
    let moved = [];
    if (o.stockApplied) moved = await applyMovements(orderStockLines(o.items, +1), stockCtx(o, actor, "Comandă respinsă"), t);
    await t`update orders set status = 'rejected', stock_applied = false, approved_by_id = ${actor.id},
              cancel_reason = ${reason || null} where id = ${o._id}`;
    return {
      moved,
      action: "rejected",
      details: reason,
      event: "order.status_changed",
      notify: async (po) => {
        await clearApprovalNotifications(po._id);
        await notifyDecision(po, "reject", actor.id);
      },
    };
  });
}

export function cancelOrder(orderId, actor, reason) {
  return mutate(orderId, actor, async (t, o) => {
    const p = orderPerms(o, actor);
    const st = normalizeStage(o.status);
    if (["cancelled", "rejected"].includes(st)) throw badRequest("Comanda este deja anulată");
    if (!p.isAdmin) {
      if (!(p.isCreator || p.isResponsible)) throw forbidden();
      if (!["new", "pending_approval"].includes(st)) throw forbidden("Doar administratorul poate anula o comandă aflată în lucru");
    }
    let moved = [];
    if (o.stockApplied) moved = await applyMovements(orderStockLines(o.items, +1), stockCtx(o, actor, "Comandă anulată"), t);
    await t`update orders set status = 'cancelled', stock_applied = false, cancel_reason = ${reason || null} where id = ${o._id}`;
    return { moved, action: "cancelled", details: reason, event: "order.status_changed", notify: (po) => clearApprovalNotifications(po._id) };
  });
}

/* ---------------- Schimbare stadiu ---------------- */
export function setOrderStage(orderId, stage, actor) {
  stage = normalizeStage(stage);
  return mutate(orderId, actor, async (t, o) => {
    if (!ORDER_STAGES.some((s) => s.key === stage)) throw badRequest("Stadiu invalid");
    const p = orderPerms(o, actor);
    const cur = normalizeStage(o.status);
    if (isClosed(cur) && cur !== "completed") throw badRequest("Comanda este închisă");
    if (!p.isAdmin) {
      if (!(p.isResponsible || p.isCreator)) throw forbidden();
      if (["new", "pending_approval"].includes(cur)) throw forbidden("Comanda trebuie aprobată de administrator întâi");
      if (["new", "pending_approval"].includes(stage) || cur === "completed") throw forbidden("Această acțiune este permisă doar administratorului");
    }
    if (stage === cur) return {};
    let moved = [];
    let stockApplied = o.stockApplied;
    let approvedBy = o.approvedById;
    if (stageConsumesStock(stage) && !o.stockApplied) {
      moved = await applyMovements(orderStockLines(o.items, -1), stockCtx(o, actor), t);
      stockApplied = true;
      approvedBy = approvedBy || actor.id;
    } else if (!stageConsumesStock(stage) && o.stockApplied) {
      moved = await applyMovements(orderStockLines(o.items, +1), stockCtx(o, actor, "Comandă readusă la stadiul inițial"), t);
      stockApplied = false;
    }
    await t`update orders set status = ${stage}, stock_applied = ${stockApplied}, approved_by_id = ${approvedBy},
              completed_at = ${stage === "completed" ? new Date() : null} where id = ${o._id}`;
    return { moved, action: "stage_changed", details: `${stageInfo(cur).label} → ${stageInfo(stage).label}`, event: "order.status_changed" };
  });
}

/* ---------------- Editare ---------------- */
async function buildEdit(o, edit, actor, settings, t) {
  const keepCustomer = edit.customer === undefined;
  const { customer, snapshot } = await resolveCustomer(
    {
      customer: keepCustomer ? o.customerId : edit.customer,
      newCustomer: edit.newCustomer,
      customerName: edit.customerName ?? (keepCustomer ? o.customerName : undefined),
      customerPhone: edit.customerPhone ?? (keepCustomer ? o.customerPhone : undefined),
      customerEmail: keepCustomer ? o.customerEmail : undefined,
    },
    t
  );
  const priceType = customer?.priceType || o.priceType || "retail";
  const items = await buildOrderLines(
    edit.items,
    {
      priceType,
      customerDiscount: customer?.discount || 0,
      allowPriceEdit: can(actor, "orders.approve") || settings.requireApproval,
      customerId: customer?._id,
      settings,
      defaultWarehouse: settings.defaultWarehouse,
    },
    t
  );
  const delivery = resolveDelivery(edit.delivery || o.delivery || {}, settings, customer);
  const totals = computeTotals(items, delivery.cost, settings);
  return { customer, snapshot, priceType, items, delivery, totals };
}

export function editOrder(orderId, edit, actor) {
  return mutate(orderId, actor, async (t, o) => {
    const p = orderPerms(o, actor);
    if (!p.canView) throw forbidden();
    const st = normalizeStage(o.status);
    if (isClosed(st)) throw badRequest("Comanda finalizată / anulată nu mai poate fi editată");
    const settings = await getSettings();
    const b = await buildEdit(o, edit, actor, settings, t);
    const previousCustomer = o.customerId;

    const direct = p.isAdmin || ["new", "pending_approval"].includes(st);
    if (direct) {
      let moved = [];
      if (o.stockApplied) {
        moved = await applyMovements([...orderStockLines(o.items, +1), ...orderStockLines(b.items, -1)], stockCtx(o, actor, "Editare comandă"), t);
      }
      await writeItems(t, o._id, b.items);
      const patch = {
        subtotal: b.totals.subtotal,
        vatTotal: b.totals.vatTotal,
        total: b.totals.total,
        customerId: b.customer?._id || null,
        ...b.snapshot,
        priceType: b.priceType,
        delivery: t.json(b.delivery),
        pendingEdit: null,
      };
      if (edit.paymentMethod && PAYMENT_METHOD_KEYS.includes(edit.paymentMethod)) patch.paymentMethod = edit.paymentMethod;
      if (edit.channel && CHANNEL_KEYS.includes(edit.channel)) patch.channel = edit.channel;
      if (edit.note !== undefined) patch.note = edit.note || null;
      if (edit.internalNote !== undefined) patch.internalNote = edit.internalNote || null;
      if (edit.dueDate !== undefined) patch.dueDate = edit.dueDate ? new Date(edit.dueDate) : null;
      if (p.isAdmin && edit.responsible) patch.responsibleId = await resolveResponsible(edit, actor, t);
      await t`update orders set ${t(patch, ...Object.keys(patch))} where id = ${o._id}`;
      await recalcPayments(t, o._id);
      return {
        moved,
        action: "edited",
        details: `${b.items.length} produse · total ${b.totals.total}`,
        event: "order.updated",
        customers: [previousCustomer],
        notify: (po) => clearApprovalNotifications(po._id),
      };
    }

    // Comanda in lucru: managerul propune modificarea, adminul aproba
    const pendingEdit = {
      items: plainItems(b.items),
      ...b.totals,
      customer: b.customer?._id || null,
      ...b.snapshot,
      note: edit.note ?? o.note ?? null,
      delivery: b.delivery,
      requestedBy: actor.id,
      requestedByName: actor.name,
      requestedAt: new Date().toISOString(),
    };
    await t`update orders set pending_edit = ${t.json(pendingEdit)} where id = ${o._id}`;
    return { action: "edit_requested", details: `total propus ${b.totals.total}`, notify: (po) => notifyAdminsForEdit(po, actor.name) };
  });
}

export function decideEdit(orderId, decision, actor) {
  return mutate(orderId, actor, async (t, o) => {
    if (!can(actor, "orders.approve")) throw forbidden("Nu aveți dreptul să decideți asupra modificărilor");
    const pe = o.pendingEdit;
    if (!pe) throw badRequest("Nu există modificări în așteptare");
    const requestedBy = pe.requestedBy;
    const previousCustomer = o.customerId;
    const approved = decision === "approve";
    let moved = [];
    if (approved) {
      if (o.stockApplied) {
        moved = await applyMovements([...orderStockLines(o.items, +1), ...orderStockLines(pe.items, -1)], stockCtx(o, actor, "Modificare aprobată"), t);
      }
      await writeItems(t, o._id, pe.items);
      await t`update orders set ${t(
        {
          total: pe.total,
          subtotal: pe.subtotal,
          vatTotal: pe.vatTotal,
          customerId: isUuid(String(pe.customer)) ? pe.customer : null,
          customerName: pe.customerName || null,
          customerPhone: pe.customerPhone || null,
          note: pe.note || null,
          delivery: t.json(pe.delivery || o.delivery || {}),
          pendingEdit: null,
        },
        "total", "subtotal", "vatTotal", "customerId", "customerName", "customerPhone", "note", "delivery", "pendingEdit"
      )} where id = ${o._id}`;
      await recalcPayments(t, o._id);
    } else {
      await t`update orders set pending_edit = null where id = ${o._id}`;
    }
    return {
      moved,
      action: approved ? "edit_approved" : "edit_rejected",
      details: approved ? `total ${pe.total}` : undefined,
      event: approved ? "order.updated" : undefined,
      customers: [previousCustomer],
      notify: async (po) => {
        await clearApprovalNotifications(po._id);
        await notifyEditDecision(po, decision, requestedBy);
      },
    };
  });
}

/* ---------------- Plati ---------------- */
export function addPayment(orderId, data, actor) {
  return mutate(orderId, actor, async (t, o) => {
    const p = orderPerms(o, actor);
    if (!p.canView) throw forbidden();
    if (["cancelled", "rejected"].includes(normalizeStage(o.status))) throw badRequest("Nu se pot înregistra plăți pe o comandă anulată");
    const amount = round2(data.amount);
    if (!(amount > 0)) throw badRequest("Suma trebuie să fie mai mare ca 0");
    const remaining = round2((o.total || 0) - (o.paidAmount || 0));
    if (amount > remaining + 0.01) throw badRequest(`Suma depășește restul de plată (${remaining.toFixed(2)})`);
    const method = PAYMENT_METHOD_KEYS.includes(data.method) ? data.method : o.paymentMethod || "cash";
    await t`insert into payments ${t({
      orderId: o._id,
      amount,
      method,
      date: data.date ? new Date(data.date) : new Date(),
      reference: data.reference || null,
      note: data.note || null,
      createdById: actor.system ? null : actor.id,
      createdByName: actor.name,
    })}`;
    await recalcPayments(t, o._id);
    return { action: "payment_added", details: `${amount.toFixed(2)} · ${method}`, event: "order.payment_added" };
  });
}

export function removePayment(orderId, paymentId, actor) {
  return mutate(orderId, actor, async (t, o) => {
    if (!can(actor, "delete")) throw forbidden("Nu aveți dreptul să ștergeți plăți");
    if (!orderPerms(o, actor).canView) throw forbidden();
    if (!isUuid(String(paymentId))) throw notFound("Plata nu există");
    const [pay] = await t`delete from payments where id = ${paymentId} and order_id = ${o._id} returning amount`;
    if (!pay) throw notFound("Plata nu există");
    await recalcPayments(t, o._id);
    return { action: "payment_removed", details: `${Number(pay.amount).toFixed(2)}`, event: "order.updated" };
  });
}

/* ---------------- Stergere ---------------- */
export async function deleteOrder(orderId, actor) {
  if (!can(actor, "delete")) throw forbidden("Nu aveți dreptul să ștergeți comenzi");
  let removed;
  let moved = [];
  await db().begin(async (t) => {
    const o = await lockOrder(t, orderId);
    if (!orderPerms(o, actor).canView) throw forbidden();
    if (o.stockApplied) moved = await applyMovements(orderStockLines(o.items, +1), stockCtx(o, actor, "Comandă ștearsă"), t);
    await t`delete from orders where id = ${o._id}`;
    removed = o;
  });
  afterStock(moved, { refType: "Order", refId: removed._id });
  await logAudit({ action: "deleted", order: removed, user: actor, details: `Comanda ${removed.number} ștearsă` });
  runAfter(async () => {
    if (removed.customerId) await refreshCustomerStats(removed.customerId);
    emit("order.deleted", { id: removed._id, number: removed.number });
  });
  return { deleted: true };
}

/* ---------------- Facturare / export / livrare ---------------- */
export function setInvoice(orderId, { number, date }, actor) {
  return mutate(orderId, actor, async (t, o) => {
    if (!orderPerms(o, actor).canView) throw forbidden();
    const invoice = { number: number || o.invoice?.number || null, date: date ? new Date(date) : o.invoice?.date || new Date() };
    await t`update orders set invoice = ${t.json(invoice)} where id = ${o._id}`;
    return { action: "edited", details: `Factură ${invoice.number || ""}`, event: "order.updated" };
  });
}

export function markExported1c(orderId, { docNumber, docId }, actor) {
  return mutate(orderId, actor, async (t, o) => {
    const export1c = { exportedAt: new Date().toISOString(), docNumber: docNumber || null, docId: docId || null };
    await t`update orders set export1c = ${t.json(export1c)} where id = ${o._id}`;
    return { action: "edited", details: `Export 1C ${docNumber || docId || ""}`, event: "order.updated" };
  });
}

export function updateDelivery(orderId, d, actor) {
  return mutate(orderId, actor, async (t, o) => {
    if (!orderPerms(o, actor).canView) throw forbidden();
    const delivery = { ...o.delivery };
    for (const f of ["trackingNumber", "recipient", "phone", "city", "address"]) if (d[f] !== undefined) delivery[f] = d[f] || undefined;
    if (d.date !== undefined) delivery.date = d.date ? new Date(d.date).toISOString() : undefined;
    await t`update orders set delivery = ${t.json(JSON.parse(JSON.stringify(delivery)))} where id = ${o._id}`;
    return { action: "edited", details: "Date livrare actualizate", event: "order.updated" };
  });
}

// Dispecer comun pentru actiunile PATCH (interfata interna)
export async function runOrderAction(orderId, body, actor) {
  if (body.edit) return editOrder(orderId, body.edit, actor);
  switch (body.action) {
    case "approve": return approveOrder(orderId, actor);
    case "reject": return rejectOrder(orderId, actor, body.reason);
    case "cancel": return cancelOrder(orderId, actor, body.reason);
    case "approve_edit": return decideEdit(orderId, "approve", actor);
    case "reject_edit": return decideEdit(orderId, "reject", actor);
    case "stage": return setOrderStage(orderId, body.stage, actor);
    case "invoice": return setInvoice(orderId, body.invoice || {}, actor);
    case "delivery": return updateDelivery(orderId, body.delivery || {}, actor);
    default:
      if (body.stage) return setOrderStage(orderId, body.stage, actor);
      throw badRequest("Acțiune invalidă");
  }
}
