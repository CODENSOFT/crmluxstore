import Product from "@/models/Product";
import StockMovement from "@/models/StockMovement";
import { badRequest, round4 } from "./api";
import { UNIT_LABELS } from "./constants";
import { getSettings, lowStockLimit } from "./settings";
import { emit } from "./events";

const EPS = 1e-9;
const PROJ = { name: 1, sku: 1, unit: 1, stock: 1, costPrice: 1, minStock: 1, wooId: 1 };

const fmt = (n) => Number(round4(n)).toLocaleString("ro-RO", { maximumFractionDigits: 3 });

export function stockInWarehouse(product, warehouseId) {
  const entry = (product?.stock || []).find((s) => String(s.warehouse?._id || s.warehouse) === String(warehouseId));
  return entry ? entry.quantity || 0 : 0;
}

export function totalStock(product) {
  return (product?.stock || []).reduce((s, x) => s + (x.quantity || 0), 0);
}

// Rotunjeste soldul (evita erori de virgula mobila: 0.30000000000000004)
async function finalize(p, warehouseId) {
  const q = stockInWarehouse(p, warehouseId);
  let fixed = round4(q);
  if (Math.abs(fixed) < 1e-6) fixed = 0;
  if (fixed !== q) {
    await Product.updateOne(
      { _id: p._id, "stock.warehouse": warehouseId },
      { $set: { "stock.$.quantity": fixed } }
    );
    const e = p.stock.find((s) => String(s.warehouse) === String(warehouseId));
    if (e) e.quantity = fixed;
  }
  return { product: p, balance: fixed };
}

// Modificare atomica a cantitatii. La scadere verifica stocul in aceeasi operatie.
async function incStock(productId, warehouseId, delta, { force = false } = {}) {
  const opts = { returnDocument: "after", projection: PROJ };
  if (delta < 0 && !force) {
    const need = -delta;
    const p = await Product.findOneAndUpdate(
      {
        _id: productId,
        stock: { $elemMatch: { warehouse: warehouseId, quantity: { $gte: need - EPS } } },
      },
      { $inc: { "stock.$.quantity": delta } },
      opts
    );
    if (!p) {
      const cur = await Product.findById(productId).select("name unit stock").lean();
      if (!cur) throw badRequest("Produsul nu a fost găsit");
      throw badRequest(
        `Stoc insuficient pentru „${cur.name}”: disponibil ${fmt(stockInWarehouse(cur, warehouseId))} ${UNIT_LABELS[cur.unit] || ""}, necesar ${fmt(need)}`
      );
    }
    return finalize(p, warehouseId);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    let p = await Product.findOneAndUpdate(
      { _id: productId, "stock.warehouse": warehouseId },
      { $inc: { "stock.$.quantity": delta } },
      opts
    );
    if (!p) {
      p = await Product.findOneAndUpdate(
        { _id: productId, "stock.warehouse": { $ne: warehouseId } },
        { $push: { stock: { warehouse: warehouseId, quantity: delta } } },
        opts
      );
    }
    if (p) return finalize(p, warehouseId);
    if (!(await Product.exists({ _id: productId }))) throw badRequest("Produsul nu a fost găsit");
  }
  throw badRequest("Nu s-a putut actualiza stocul. Reîncercați.");
}

// Seteaza o cantitate absoluta (inventariere / sincronizare 1C), cu concurenta optimista
async function setStock(productId, warehouseId, target) {
  target = round4(Math.max(0, Number(target) || 0));
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await Product.findById(productId).select(PROJ).lean();
    if (!cur) throw badRequest("Produsul nu a fost găsit");
    const before = stockInWarehouse(cur, warehouseId);
    const exists = (cur.stock || []).some((s) => String(s.warehouse) === String(warehouseId));
    const res = exists
      ? await Product.updateOne(
          { _id: productId, stock: { $elemMatch: { warehouse: warehouseId, quantity: before } } },
          { $set: { "stock.$.quantity": target } }
        )
      : await Product.updateOne(
          { _id: productId, "stock.warehouse": { $ne: warehouseId } },
          { $push: { stock: { warehouse: warehouseId, quantity: target } } }
        );
    if (res.matchedCount) {
      return { product: cur, balance: target, delta: round4(target - before) };
    }
  }
  throw badRequest("Stocul a fost modificat simultan. Reîncercați.");
}

// Verificare prealabila: lista completa a liniilor fara stoc suficient
async function precheck(lines) {
  const need = new Map();
  for (const l of lines) {
    if (l.set != null || !(l.qty < 0)) continue;
    const key = `${l.product}|${l.warehouse}`;
    need.set(key, (need.get(key) || 0) - l.qty);
  }
  if (!need.size) return;
  const ids = [...new Set([...need.keys()].map((k) => k.split("|")[0]))];
  const products = await Product.find({ _id: { $in: ids } }).select("name unit stock").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const problems = [];
  for (const [key, qty] of need) {
    const [pid, wid] = key.split("|");
    const p = byId.get(pid);
    if (!p) {
      problems.push("un produs nu mai există");
      continue;
    }
    const avail = stockInWarehouse(p, wid);
    if (avail + EPS < qty) {
      problems.push(`„${p.name}” — disponibil ${fmt(avail)}, necesar ${fmt(qty)} ${UNIT_LABELS[p.unit] || ""}`);
    }
  }
  if (problems.length) throw badRequest(`Stoc insuficient: ${problems.join("; ")}`);
}

/**
 * Aplica mai multe miscari de stoc — totul sau nimic (revenire automata la eroare)
 * si le scrie in registrul de stoc.
 *   lines: [{ product, warehouse, qty (+/-) | set (absolut), type, unitCost?, note? }]
 *   ctx:   { refType, refId, refNumber, user, note, silent }
 */
export async function applyMovements(lines, ctx = {}) {
  lines = (lines || []).filter((l) => l && l.product && l.warehouse && (l.set != null || Number(l.qty)));
  if (!lines.length) return [];
  await precheck(lines);

  const applied = [];
  try {
    for (const l of lines) {
      if (l.set != null) {
        const r = await setStock(l.product, l.warehouse, l.set);
        applied.push({ ...l, delta: r.delta, balance: r.balance, doc: r.product });
      } else {
        const r = await incStock(l.product, l.warehouse, Number(l.qty));
        applied.push({ ...l, delta: Number(l.qty), balance: r.balance, doc: r.product });
      }
    }
  } catch (e) {
    for (const a of applied.reverse()) {
      if (a.delta) await incStock(a.product, a.warehouse, -a.delta, { force: true }).catch(() => {});
    }
    throw e;
  }

  const moved = applied.filter((a) => a.delta);
  if (moved.length) {
    await StockMovement.insertMany(
      moved.map((a) => ({
        product: a.product,
        productName: a.doc?.name,
        sku: a.doc?.sku,
        warehouse: a.warehouse,
        quantity: round4(a.delta),
        balanceAfter: a.balance,
        type: a.type || (a.delta > 0 ? "adjustment" : "adjustment"),
        unitCost: a.unitCost ?? a.doc?.costPrice,
        refType: ctx.refType,
        refId: ctx.refId,
        refNumber: ctx.refNumber,
        user: ctx.user?.id || ctx.user?._id,
        userName: ctx.user?.name,
        note: a.note || ctx.note,
      }))
    );
    if (!ctx.silent) await afterStockChange(moved, ctx).catch(() => {});
  }
  return applied;
}

// Efecte secundare: notificare stoc critic, evenimente webhook, stoc pe site
async function afterStockChange(moved, ctx) {
  const settings = await getSettings();
  const byProduct = new Map();
  for (const m of moved) {
    const k = String(m.product);
    const cur = byProduct.get(k) || { doc: m.doc, delta: 0 };
    cur.delta += m.delta;
    cur.doc = m.doc;
    byProduct.set(k, cur);
  }

  const { notifyLowStock } = await import("./notify");
  for (const [, { doc, delta }] of byProduct) {
    if (!doc) continue;
    const after = totalStock(doc);
    const before = after - delta;
    const limit = lowStockLimit(doc, settings);
    if (delta < 0 && after <= limit && before > limit) {
      await notifyLowStock(doc, after, limit).catch(() => {});
    }
  }

  emit("stock.changed", {
    ref: ctx.refType ? { type: ctx.refType, id: ctx.refId ? String(ctx.refId) : null, number: ctx.refNumber } : null,
    items: moved.map((m) => ({
      productId: String(m.product),
      sku: m.doc?.sku || null,
      warehouseId: String(m.warehouse),
      change: round4(m.delta),
      balance: m.balance,
      type: m.type,
    })),
  });

  if (settings.woo?.enabled && settings.woo?.pushStock) {
    const ids = [...byProduct.values()].filter((v) => v.doc?.wooId).map((v) => v.doc._id);
    if (ids.length) {
      const { queueWooStockPush } = await import("./woo");
      queueWooStockPush(ids);
    }
  }
}

// Linii de stoc pentru o comanda: sign -1 = vanzare (scade), +1 = retur (creste)
export function orderStockLines(items, sign) {
  return (items || []).map((it) => ({
    product: it.product?._id || it.product,
    warehouse: it.warehouse?._id || it.warehouse,
    qty: sign * Number(it.quantity),
    type: sign < 0 ? "sale" : "sale_return",
    unitCost: it.costPrice,
  }));
}
