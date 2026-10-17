import { db, idOf, isUuid } from "./db";
import { badRequest, round2 } from "./api";

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

/**
 * Construieste liniile comenzii cu preturi din baza de date (sursa de adevar).
 * Pretul depinde de tipul de pret al clientului (amanunt / angro); reducerea
 * implicita pe linie este reducerea clientului.
 */
export async function buildOrderLines(rawItems, opts = {}, q = db()) {
  const {
    priceType = "retail",
    customerDiscount = 0,
    allowPriceEdit = false,
    settings = {},
    defaultWarehouse,
  } = opts;

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw badRequest("Adăugați cel puțin un produs în comandă");
  }

  const ids = rawItems.map((i) => idOf(i?.product)).filter((x) => isUuid(String(x)));
  const products = ids.length
    ? await q`select id, name, sku, unit, price, wholesale_price, cost_price, vat_rate, active from products where id in ${q(ids)}`
    : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const warehouses = await q`select id from warehouses`;
  const validWh = new Set(warehouses.map((w) => String(w._id)));

  return rawItems.map((it, idx) => {
    const n = idx + 1;
    const p = byId.get(String(idOf(it?.product)));
    if (!p) throw badRequest(`Linia ${n}: produsul nu există`);
    const warehouse = idOf(it.warehouse) || idOf(defaultWarehouse);
    if (warehouse && !validWh.has(String(warehouse))) throw badRequest(`Linia ${n}: depozitul ales nu există`);
    if (!warehouse) throw badRequest(`Linia ${n}: alegeți depozitul pentru „${p.name}”`);
    const quantity = Number(it.quantity);
    if (!(quantity > 0)) throw badRequest(`Linia ${n}: cantitatea trebuie să fie mai mare ca 0`);

    let unitPrice =
      priceType === "wholesale" && p.wholesalePrice > 0 ? p.wholesalePrice : p.price || 0;
    if (allowPriceEdit && it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== "") {
      const custom = Number(it.unitPrice);
      if (!(custom >= 0)) throw badRequest(`Linia ${n}: preț invalid`);
      unitPrice = custom;
    }
    const discount =
      it.discount !== undefined && it.discount !== null && it.discount !== ""
        ? clamp(Number(it.discount) || 0, 0, 100)
        : clamp(Number(customerDiscount) || 0, 0, 100);

    const vatRate = settings.vatPayer === false ? 0 : p.vatRate ?? settings.vatRate ?? 20;
    return {
      product: p._id,
      productName: p.name,
      sku: p.sku,
      warehouse,
      quantity,
      unit: p.unit,
      unitPrice: round2(unitPrice),
      discount,
      lineTotal: round2(quantity * unitPrice * (1 - discount / 100)),
      vatRate,
      costPrice: p.costPrice,
    };
  });
}

// Totaluri: subtotal (linii), TVA (inclus sau adaugat), total de plata (cu livrare)
export function computeTotals(lines, deliveryCost = 0, settings = {}) {
  const subtotal = round2(lines.reduce((s, l) => s + (l.lineTotal || 0), 0));
  const delivery = round2(Number(deliveryCost) || 0);
  const std = settings.vatPayer === false ? 0 : settings.vatRate ?? 20;
  let vat = 0;
  let total = subtotal + delivery;
  if (settings.vatPayer !== false) {
    if (settings.pricesIncludeVat !== false) {
      vat =
        lines.reduce((s, l) => s + (l.lineTotal * (l.vatRate || 0)) / (100 + (l.vatRate || 0)), 0) +
        (delivery * std) / (100 + std);
    } else {
      vat =
        lines.reduce((s, l) => s + (l.lineTotal * (l.vatRate || 0)) / 100, 0) + (delivery * std) / 100;
      total = subtotal + delivery + vat;
    }
  }
  return { subtotal, vatTotal: round2(vat), total: round2(total) };
}

// Recalculeaza suma achitata si statusul platii
export function recalcPayments(order) {
  const paid = round2((order.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0));
  order.paidAmount = paid;
  if ((order.total || 0) <= 0) order.paymentStatus = "paid";
  else if (paid <= 0) order.paymentStatus = "unpaid";
  else if (paid + 0.009 >= order.total) order.paymentStatus = "paid";
  else order.paymentStatus = "partial";
}
