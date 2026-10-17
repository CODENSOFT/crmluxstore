// Registrul de stoc: orice modificare de cantitate trece pe aici, in tranzactie,
// cu verificare atomica (stocul nu poate deveni negativ) si inregistrare in stock_movements.
import { db, idOf } from "./db";
import { badRequest, round4 } from "./api";
import { UNIT_LABELS } from "./constants";
import { getSettings, lowStockLimit } from "./settings";
import { emit, runAfter } from "./events";

const fmt = (n) => Number(round4(n)).toLocaleString("ro-RO", { maximumFractionDigits: 3 });

export function stockInWarehouse(product, warehouseId) {
  const wid = String(idOf(warehouseId));
  const entry = (product?.stock || []).find((s) => String(idOf(s.warehouse)) === wid);
  return entry ? Number(entry.quantity) || 0 : 0;
}

export function totalStock(product) {
  return (product?.stock || []).reduce((s, x) => s + (Number(x.quantity) || 0), 0);
}

// Verificare prealabila: mesaj cu toate liniile fara stoc suficient
async function precheck(q, lines) {
  // necesarul NET pe (produs, depozit): retururile din acelasi lot (ex: editare comanda) se scad din necesar
  const net = new Map();
  for (const l of lines) {
    if (l.set != null) continue;
    const key = `${l.product}|${l.warehouse}`;
    net.set(key, (net.get(key) || 0) - Number(l.qty));
  }
  const need = new Map([...net].filter(([, v]) => v > 1e-9));
  if (!need.size) return;
  const pids = [...new Set([...need.keys()].map((k) => k.split("|")[0]))];
  const rows = await q`
    select p.id, p.name, p.unit, s.warehouse_id, s.quantity
    from products p left join stock s on s.product_id = p.id
    where p.id in ${q(pids)}`;
  const problems = [];
  for (const [key, qty] of need) {
    const [pid, wid] = key.split("|");
    const prod = rows.find((r) => String(r._id) === pid);
    if (!prod) {
      problems.push("un produs nu mai există");
      continue;
    }
    const avail = rows.find((r) => String(r._id) === pid && String(r.warehouseId) === wid)?.quantity || 0;
    if (avail + 1e-9 < qty) problems.push(`„${prod.name}” — disponibil ${fmt(avail)}, necesar ${fmt(qty)} ${UNIT_LABELS[prod.unit] || ""}`);
  }
  if (problems.length) throw badRequest(`Stoc insuficient: ${problems.join("; ")}`);
}

async function inc(q, product, warehouse, delta) {
  if (delta < 0) {
    const [r] = await q`
      update stock set quantity = quantity + ${delta}
      where product_id = ${product} and warehouse_id = ${warehouse} and quantity + ${delta} >= 0
      returning quantity`;
    if (!r) {
      const [p] = await q`
        select p.name, p.unit, coalesce(s.quantity, 0) as quantity from products p
        left join stock s on s.product_id = p.id and s.warehouse_id = ${warehouse} where p.id = ${product}`;
      if (!p) throw badRequest("Produsul nu a fost găsit");
      throw badRequest(`Stoc insuficient pentru „${p.name}”: disponibil ${fmt(p.quantity)} ${UNIT_LABELS[p.unit] || ""}, necesar ${fmt(-delta)}`);
    }
    return r.quantity;
  }
  const [r] = await q`
    insert into stock (product_id, warehouse_id, quantity) values (${product}, ${warehouse}, ${delta})
    on conflict (product_id, warehouse_id) do update set quantity = stock.quantity + excluded.quantity
    returning quantity`;
  return r.quantity;
}

async function setAbsolute(q, product, warehouse, target) {
  target = round4(Math.max(0, Number(target) || 0));
  const [cur] = await q`select quantity from stock where product_id = ${product} and warehouse_id = ${warehouse} for update`;
  const before = cur?.quantity || 0;
  await q`
    insert into stock (product_id, warehouse_id, quantity) values (${product}, ${warehouse}, ${target})
    on conflict (product_id, warehouse_id) do update set quantity = excluded.quantity`;
  return { balance: target, delta: round4(target - before) };
}

/**
 * Aplica mai multe miscari de stoc — totul sau nimic — si le scrie in registru.
 *   lines: [{ product, warehouse, qty (+/-) | set (absolut), type, unitCost?, note? }]
 *   ctx:   { refType, refId, refNumber, user, note, silent }
 *   q:     tranzactia apelantului (optional). Cu `q`, apelantul cheama afterStock() dupa commit.
 */
export async function applyMovements(lines, ctx = {}, q) {
  lines = (lines || [])
    .filter((l) => l && l.product && l.warehouse && (l.set != null || Number(l.qty)))
    .map((l) => ({ ...l, product: String(idOf(l.product)), warehouse: String(idOf(l.warehouse)) }));
  if (!lines.length) return [];

  const run = async (t) => {
    await precheck(t, lines);
    const ids = [...new Set(lines.map((l) => l.product))];
    const products = await t`select id, name, sku, unit, cost_price from products where id in ${t(ids)}`;
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const applied = [];
    // intai intrarile (retururi), apoi iesirile — schimburile de linii nu esueaza fals
    const ordered = [...lines.filter((l) => l.set != null || Number(l.qty) > 0), ...lines.filter((l) => l.set == null && Number(l.qty) < 0)];
    for (const l of ordered) {
      const p = byId.get(l.product);
      if (!p) throw badRequest("Produsul nu a fost găsit");
      if (l.set != null) {
        const r = await setAbsolute(t, l.product, l.warehouse, l.set);
        applied.push({ ...l, delta: r.delta, balance: r.balance, doc: p });
      } else {
        const delta = round4(Number(l.qty));
        const balance = await inc(t, l.product, l.warehouse, delta);
        applied.push({ ...l, delta, balance, doc: p });
      }
    }
    const moved = applied.filter((a) => a.delta);
    if (moved.length) {
      const userId = ctx.user?.system ? null : ctx.user?.id || null;
      const rows = moved.map((a) => ({
        productId: a.product,
        productName: a.doc.name,
        sku: a.doc.sku,
        warehouseId: a.warehouse,
        quantity: a.delta,
        balanceAfter: a.balance,
        type: a.type || "adjustment",
        unitCost: a.unitCost ?? a.doc.costPrice ?? null,
        refType: ctx.refType || null,
        refId: idOf(ctx.refId),
        refNumber: ctx.refNumber || null,
        userId,
        userName: ctx.user?.name || null,
        note: a.note || ctx.note || null,
      }));
      await t`insert into stock_movements ${t(rows)}`;
    }
    return moved;
  };

  if (q) return run(q);
  const moved = await db().begin(run);
  if (!ctx.silent) afterStock(moved, ctx);
  return moved;
}

/** Efecte dupa commit: stoc critic, eveniment webhook, stoc pe site */
export function afterStock(moved, ctx = {}) {
  if (!moved?.length || ctx.silent) return;
  runAfter(async () => {
    const settings = await getSettings();
    const delta = new Map();
    for (const m of moved) delta.set(m.product, (delta.get(m.product) || 0) + m.delta);
    const ids = [...delta.keys()];
    const products = await db()`
      select p.id, p.name, p.unit, p.min_stock, p.woo_id, coalesce(sum(s.quantity), 0) as total
      from products p left join stock s on s.product_id = p.id
      where p.id in ${db()(ids)} group by p.id`;

    const { notifyLowStock } = await import("./notify");
    for (const p of products) {
      const d = delta.get(String(p._id)) || 0;
      const limit = lowStockLimit(p, settings);
      if (d < 0 && p.total <= limit && p.total - d > limit) await notifyLowStock(p, p.total, limit).catch(() => {});
    }

    emit("stock.changed", {
      ref: ctx.refType ? { type: ctx.refType, id: idOf(ctx.refId), number: ctx.refNumber || null } : null,
      items: moved.map((m) => ({
        productId: m.product,
        sku: m.doc?.sku || null,
        warehouseId: m.warehouse,
        change: m.delta,
        balance: m.balance,
        type: m.type,
      })),
    });

    if (settings.woo?.enabled && settings.woo?.pushStock) {
      const wooIds = products.filter((p) => p.wooId).map((p) => p._id);
      if (wooIds.length) {
        const { pushStockToWoo } = await import("./woo");
        await pushStockToWoo(wooIds).catch(() => {});
      }
    }
  });
}

// Linii de stoc pentru o comanda: sign -1 = vanzare (scade), +1 = retur (creste)
export function orderStockLines(items, sign) {
  return (items || []).map((it) => ({
    product: it.productId ?? idOf(it.product),
    warehouse: it.warehouseId ?? idOf(it.warehouse),
    qty: sign * Number(it.quantity),
    type: sign < 0 ? "sale" : "sale_return",
    unitCost: it.costPrice,
  }));
}
