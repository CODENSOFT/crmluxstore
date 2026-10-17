import { db, idOf, isUuid } from "./db";
import { nextNumber } from "./counters";
import { normPhone, round2, badRequest } from "./api";
import { SALE_STAGE_KEYS } from "./orderStages";

// Coloanele clientului expuse in API (statisticile sunt grupate in `stats`, ca inainte)
export const CUSTOMER_COLS = `c.id, c.number, c.type, c.name, c.contact_person, c.phone, c.phone2, c.email, c.idno, c.vat_code,
  c.iban, c.bank, c.legal_address, c.city, c.address, c.segment, c.price_type, c.discount, c.payment_term_days, c.source,
  c.tags, c.note, c.manager_id as manager, c.active, c.external_id, c.woo_customer_id, c.created_at, c.updated_at,
  json_build_object('ordersCount', c.orders_count, 'totalSpent', c.total_spent, 'balance', c.balance, 'lastOrderAt', c.last_order_at) as stats`;

export async function getCustomer(id, q = db()) {
  if (!isUuid(String(idOf(id)))) return null;
  const [c] = await q`select ${q.unsafe(CUSTOMER_COLS)} from customers c where c.id = ${idOf(id)}`;
  return c || null;
}

// Recalculeaza statisticile clientului (nr. comenzi, total, datorie, ultima comanda)
export async function refreshCustomerStats(customerId) {
  const id = idOf(customerId);
  if (!isUuid(String(id))) return;
  const sale = db()(SALE_STAGE_KEYS);
  await db()`
    update customers c set
      orders_count = coalesce(a.cnt, 0),
      total_spent = coalesce(a.total, 0),
      balance = greatest(0, coalesce(a.total, 0) - coalesce(a.paid, 0)),
      last_order_at = a.last
    from (
      select count(*) filter (where status in ${sale})::int as cnt,
             sum(total) filter (where status in ${sale}) as total,
             sum(paid_amount) filter (where status in ${sale}) as paid,
             max(created_at) as last
      from orders where customer_id = ${id} and status not in ('rejected', 'cancelled')
    ) a
    where c.id = ${id}`;
}

const FIELDS = [
  "type", "name", "contactPerson", "phone", "phone2", "email", "idno", "vatCode", "iban",
  "bank", "legalAddress", "city", "address", "segment", "priceType", "discount",
  "paymentTermDays", "source", "tags", "note", "manager", "active", "externalId", "wooCustomerId",
];

/** Normalizeaza campurile primite (formular / API / site) -> coloane DB (camelCase) */
export function pickCustomerFields(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  for (const f of ["name", "contactPerson", "phone", "phone2", "email", "idno", "vatCode", "iban", "bank", "legalAddress", "city", "address", "source", "note", "externalId"]) {
    if (out[f] !== undefined) out[f] = out[f] === null || out[f] === "" ? null : String(out[f]).trim();
  }
  if (out.email) out.email = out.email.toLowerCase();
  if (out.type !== undefined && !["individual", "company"].includes(out.type)) out.type = "individual";
  if (out.priceType !== undefined && !["retail", "wholesale"].includes(out.priceType)) out.priceType = "retail";
  if (out.discount !== undefined) out.discount = Math.min(100, Math.max(0, Number(out.discount) || 0));
  if (out.paymentTermDays !== undefined) out.paymentTermDays = Math.max(0, parseInt(out.paymentTermDays, 10) || 0);
  if (typeof out.tags === "string") out.tags = out.tags.split(",").map((t) => t.trim()).filter(Boolean);
  if (out.tags !== undefined && !Array.isArray(out.tags)) out.tags = [];
  if (out.manager !== undefined) {
    const m = idOf(out.manager);
    out.managerId = isUuid(String(m)) ? m : null;
    delete out.manager;
  }
  if (out.wooCustomerId !== undefined) out.wooCustomerId = Number(out.wooCustomerId) || null;
  if (out.active !== undefined) out.active = !!out.active;
  if (out.phone !== undefined) out.phoneNorm = normPhone(out.phone) || null;
  return out;
}

export async function createCustomer(data, q = db()) {
  const fields = pickCustomerFields(data);
  if (!fields.name) throw badRequest("Numele clientului este obligatoriu");
  const number = await nextNumber("customer", q);
  const [row] = await q`insert into customers ${q({ ...fields, number })} returning id`;
  return getCustomer(row._id, q);
}

export async function updateCustomer(id, data, q = db()) {
  const fields = pickCustomerFields(data);
  if (fields.name !== undefined && !fields.name) throw badRequest("Numele nu poate fi gol");
  const keys = Object.keys(fields);
  if (keys.length) await q`update customers set ${q(fields, ...keys)} where id = ${idOf(id)}`;
  return getCustomer(id, q);
}

// Gaseste un client existent dupa externalId / IDNO / telefon / email
export async function findCustomerMatch({ externalId, idno, phone, email } = {}, q = db()) {
  const by = async (frag) => {
    const [r] = await q`select id from customers c where ${frag} order by created_at limit 1`;
    return r ? getCustomer(r._id, q) : null;
  };
  if (externalId) {
    const c = await by(q`external_id = ${String(externalId)}`);
    if (c) return c;
  }
  if (idno) {
    const c = await by(q`idno = ${String(idno).trim()}`);
    if (c) return c;
  }
  const pn = normPhone(phone);
  if (pn && pn.length >= 6) {
    const c = await by(q`phone_norm = ${pn}`);
    if (c) return c;
  }
  if (email) {
    const c = await by(q`lower(email) = ${String(email).trim().toLowerCase()}`);
    if (c) return c;
  }
  return null;
}

// Gaseste sau creeaza clientul (import comenzi din site / API). Completeaza doar campurile goale.
export async function upsertCustomer(data, q = db()) {
  const found = await findCustomerMatch(data, q);
  if (found) {
    const patch = {};
    for (const f of ["email", "phone", "city", "address", "idno", "externalId", "wooCustomerId"]) {
      if (data[f] && !found[f]) patch[f] = data[f];
    }
    if (Object.keys(patch).length) return { customer: await updateCustomer(found._id, patch, q), created: false };
    return { customer: found, created: false };
  }
  return { customer: await createCustomer(data, q), created: true };
}

export { round2 };
