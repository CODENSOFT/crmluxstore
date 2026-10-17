import mongoose from "mongoose";
import Customer from "@/models/Customer";
import Order from "@/models/Order";
import { nextNumber } from "./counters";
import { normPhone, round2, escapeRegex, badRequest } from "./api";
import { SALE_STAGE_KEYS } from "./orderStages";

// Recalculeaza statisticile clientului (nr. comenzi, total, datorie, ultima comanda)
export async function refreshCustomerStats(customerId) {
  if (!customerId) return;
  const id = new mongoose.Types.ObjectId(String(customerId._id || customerId));
  const [agg] = await Order.aggregate([
    { $match: { customer: id, status: { $nin: ["rejected", "cancelled"] } } },
    {
      $group: {
        _id: null,
        count: { $sum: { $cond: [{ $in: ["$status", SALE_STAGE_KEYS] }, 1, 0] } },
        total: { $sum: { $cond: [{ $in: ["$status", SALE_STAGE_KEYS] }, "$total", 0] } },
        paid: { $sum: { $cond: [{ $in: ["$status", SALE_STAGE_KEYS] }, "$paidAmount", 0] } },
        last: { $max: "$createdAt" },
      },
    },
  ]);
  await Customer.updateOne(
    { _id: id },
    {
      $set: {
        "stats.ordersCount": agg?.count || 0,
        "stats.totalSpent": round2(agg?.total || 0),
        "stats.balance": round2(Math.max(0, (agg?.total || 0) - (agg?.paid || 0))),
        "stats.lastOrderAt": agg?.last || null,
      },
    }
  );
}

const FIELDS = [
  "type", "name", "contactPerson", "phone", "phone2", "email", "idno", "vatCode", "iban",
  "bank", "legalAddress", "city", "address", "segment", "priceType", "discount",
  "paymentTermDays", "source", "tags", "note", "manager", "active", "externalId", "wooCustomerId",
];

export function pickCustomerFields(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (out.email === "") out.email = undefined;
  if (out.discount !== undefined) out.discount = Math.min(100, Math.max(0, Number(out.discount) || 0));
  if (out.paymentTermDays !== undefined) out.paymentTermDays = Math.max(0, Number(out.paymentTermDays) || 0);
  if (typeof out.tags === "string") out.tags = out.tags.split(",").map((t) => t.trim()).filter(Boolean);
  if (out.manager === "") out.manager = undefined;
  if (out.phone !== undefined) out.phoneNorm = normPhone(out.phone);
  return out;
}

export async function createCustomer(data) {
  const fields = pickCustomerFields(data);
  if (!fields.name) throw badRequest("Numele clientului este obligatoriu");
  return Customer.create({ ...fields, number: await nextNumber("customer") });
}

// Gaseste un client existent dupa externalId / IDNO / telefon / email
export async function findCustomerMatch({ externalId, idno, phone, email }) {
  if (externalId) {
    const c = await Customer.findOne({ externalId });
    if (c) return c;
  }
  if (idno) {
    const c = await Customer.findOne({ idno: String(idno).trim() });
    if (c) return c;
  }
  const pn = normPhone(phone);
  if (pn && pn.length >= 6) {
    const c = await Customer.findOne({ phoneNorm: pn });
    if (c) return c;
  }
  if (email) {
    const c = await Customer.findOne({ email: { $regex: `^${escapeRegex(String(email).trim())}$`, $options: "i" } });
    if (c) return c;
  }
  return null;
}

// Gaseste sau creeaza clientul (folosit la import comenzi din site / API)
export async function upsertCustomer(data) {
  const found = await findCustomerMatch(data);
  if (found) {
    // completam doar campurile goale, nu suprascriem ce a lucrat echipa
    let dirty = false;
    for (const f of ["email", "phone", "city", "address", "idno", "externalId", "wooCustomerId"]) {
      if (data[f] && !found[f]) {
        found[f] = data[f];
        dirty = true;
      }
    }
    if (dirty) {
      found.phoneNorm = normPhone(found.phone);
      await found.save();
    }
    return { customer: found, created: false };
  }
  return { customer: await createCustomer(data), created: true };
}
