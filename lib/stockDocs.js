// Documente de stoc: receptie, transfer, casare, inventariere (interfata + API v1).
// Fiecare document + miscarile lui de stoc se salveaza in aceeasi tranzactie.
import { db, idOf, isUuid } from "./db";
import { badRequest, notFound, round2, round4 } from "./api";
import { applyMovements, afterStock, stockInWarehouse } from "./stock";
import { nextNumber } from "./counters";
import { logAudit } from "./audit";
import { emit, runAfter } from "./events";
import { UNIT_LABELS, writeoffReasonLabel, WRITEOFF_REASONS } from "./constants";

async function requireWarehouse(t, id, label = "Depozitul") {
  const wid = idOf(id);
  if (!wid) throw badRequest(`${label} este obligatoriu`);
  if (!isUuid(String(wid))) throw badRequest(`${label} nu există`);
  const [w] = await t`select id, name from warehouses where id = ${wid}`;
  if (!w) throw badRequest(`${label} nu există`);
  return w;
}

// Valideaza liniile si incarca produsele intr-o singura interogare
async function loadLines(t, rawItems, { withCost = false } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw badRequest("Adăugați cel puțin un produs");
  const ids = rawItems.map((l) => idOf(l.product)).filter((x) => isUuid(String(x)));
  const products = ids.length ? await t`select id, name, sku, unit, cost_price from products where id in ${t(ids)}` : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return rawItems.map((l, i) => {
    const p = byId.get(String(idOf(l.product)));
    if (!p) throw badRequest(`Linia ${i + 1}: produsul nu există`);
    const quantity = round4(Number(l.quantity));
    if (!(quantity > 0)) throw badRequest(`Linia ${i + 1}: cantitatea pentru „${p.name}” trebuie să fie mai mare ca 0`);
    const line = { product: p._id, productName: p.name, sku: p.sku || null, unit: p.unit, quantity, _cost: p.costPrice };
    if (withCost) {
      const c = l.unitCost === "" || l.unitCost == null ? undefined : Number(l.unitCost);
      if (c !== undefined && !(c >= 0)) throw badRequest(`Linia ${i + 1}: preț de achiziție invalid`);
      line.unitCost = c ?? null;
      line.lineTotal = c ? round2(c * quantity) : 0;
    }
    return line;
  });
}

const strip = (lines) => lines.map(({ _cost, ...l }) => l);

/* ---------- Receptie ---------- */
export async function createArrival(input, actor) {
  if (input.externalId) {
    const [dup] = await db()`select * from arrivals where external_id = ${String(input.externalId)}`;
    if (dup) return { doc: dup, duplicate: true };
  }
  let doc;
  let moved;
  let w;
  await db().begin(async (t) => {
    w = await requireWarehouse(t, input.warehouse);
    let supplierName = (typeof input.supplier === "string" ? input.supplier.trim() : "") || null;
    let supplierId = null;
    if (input.supplierId) {
      const sid = idOf(input.supplierId);
      const [s] = isUuid(String(sid)) ? await t`select id, name from suppliers where id = ${sid}` : [];
      if (!s) throw badRequest("Furnizorul ales nu există");
      supplierName = s.name;
      supplierId = s._id;
    }
    const lines = await loadLines(t, input.items, { withCost: true });
    const number = await nextNumber("arrival", t);
    [doc] = await t`insert into arrivals ${t({
      number,
      warehouseId: w._id,
      supplierId,
      supplier: supplierName,
      supplierInvoice: input.supplierInvoice || null,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null,
      items: t.json(strip(lines)),
      total: round2(lines.reduce((s, l) => s + (l.lineTotal || 0), 0)),
      note: input.note || null,
      createdById: actor.system ? null : actor.id,
      externalId: input.externalId ? String(input.externalId) : null,
      source: input.source || "crm",
    })} returning *`;
    moved = await applyMovements(
      lines.map((l) => ({ product: l.product, warehouse: w._id, qty: l.quantity, type: "arrival", unitCost: l.unitCost })),
      { refType: "StockArrival", refId: doc._id, refNumber: number, user: actor },
      t
    );
    if (input.updateCostPrice !== false) {
      for (const l of lines.filter((x) => x.unitCost > 0)) await t`update products set cost_price = ${l.unitCost} where id = ${l.product}`;
    }
  });
  afterStock(moved, { refType: "StockArrival", refId: doc._id, refNumber: doc.number });
  runAfter(async () => {
    await logAudit({
      action: "arrival",
      category: "stock",
      entity: doc,
      entityName: doc.number,
      user: actor,
      details: `${doc.number}: ${doc.items.length} produse în ${w.name}${doc.supplier ? ` · furnizor ${doc.supplier}` : ""} · ${doc.total}`,
    });
    emit("arrival.created", {
      id: doc._id,
      number: doc.number,
      externalId: doc.externalId || null,
      warehouseId: w._id,
      supplier: doc.supplier || null,
      total: doc.total,
      items: doc.items.map((l) => ({ productId: l.product, sku: l.sku || null, quantity: l.quantity, unitCost: l.unitCost ?? null })),
    });
  });
  return { doc, duplicate: false };
}

/* ---------- Transfer ---------- */
export async function createTransfer(input, actor) {
  let doc;
  let moved;
  let from;
  let to;
  await db().begin(async (t) => {
    from = await requireWarehouse(t, input.fromWarehouse, "Depozitul sursă");
    to = await requireWarehouse(t, input.toWarehouse, "Depozitul destinație");
    if (String(from._id) === String(to._id)) throw badRequest("Depozitul sursă și destinație trebuie să fie diferite");
    const lines = await loadLines(t, input.items);
    const number = await nextNumber("transfer", t);
    [doc] = await t`insert into transfers ${t({
      number,
      fromWarehouseId: from._id,
      toWarehouseId: to._id,
      items: t.json(strip(lines)),
      note: input.note || null,
      createdById: actor.system ? null : actor.id,
    })} returning *`;
    moved = await applyMovements(
      [
        ...lines.map((l) => ({ product: l.product, warehouse: from._id, qty: -l.quantity, type: "transfer_out" })),
        ...lines.map((l) => ({ product: l.product, warehouse: to._id, qty: l.quantity, type: "transfer_in" })),
      ],
      { refType: "Transfer", refId: doc._id, refNumber: number, user: actor, note: `${from.name} → ${to.name}` },
      t
    );
  });
  afterStock(moved, { refType: "Transfer", refId: doc._id, refNumber: doc.number });
  runAfter(async () => {
    await logAudit({ action: "transfer", category: "stock", entity: doc, entityName: doc.number, user: actor, details: `${doc.number}: ${doc.items.length} produse ${from.name} → ${to.name}` });
    emit("transfer.created", {
      id: doc._id,
      number: doc.number,
      fromWarehouseId: from._id,
      toWarehouseId: to._id,
      items: doc.items.map((l) => ({ productId: l.product, sku: l.sku || null, quantity: l.quantity })),
    });
  });
  return doc;
}

/* ---------- Casare ---------- */
export async function createWriteoff(input, actor) {
  let doc;
  let moved;
  let w;
  const reasonCode = WRITEOFF_REASONS.some((r) => r.key === input.reasonCode) ? input.reasonCode : "other";
  await db().begin(async (t) => {
    w = await requireWarehouse(t, input.warehouse);
    const lines = await loadLines(t, input.items);
    for (const l of lines) l.unitCost = l._cost ?? null;
    const number = await nextNumber("writeoff", t);
    [doc] = await t`insert into writeoffs ${t({
      number,
      warehouseId: w._id,
      reasonCode,
      reason: input.reason || null,
      items: t.json(strip(lines)),
      totalCost: round2(lines.reduce((s, l) => s + (l.unitCost || 0) * l.quantity, 0)),
      createdById: actor.system ? null : actor.id,
    })} returning *`;
    moved = await applyMovements(
      lines.map((l) => ({ product: l.product, warehouse: w._id, qty: -l.quantity, type: "writeoff", unitCost: l.unitCost })),
      { refType: "WriteOff", refId: doc._id, refNumber: number, user: actor, note: writeoffReasonLabel(reasonCode) },
      t
    );
  });
  afterStock(moved, { refType: "WriteOff", refId: doc._id, refNumber: doc.number });
  runAfter(async () => {
    await logAudit({
      action: "writeoff",
      category: "stock",
      entity: doc,
      entityName: doc.number,
      user: actor,
      details: `${doc.number}: ${doc.items.map((l) => `${l.quantity} ${UNIT_LABELS[l.unit] || ""} ${l.productName}`).join(", ")} din ${w.name} · ${writeoffReasonLabel(reasonCode)}${input.reason ? ` (${input.reason})` : ""}`,
    });
    emit("writeoff.created", {
      id: doc._id,
      number: doc.number,
      warehouseId: w._id,
      reason: reasonCode,
      items: doc.items.map((l) => ({ productId: l.product, sku: l.sku || null, quantity: l.quantity })),
    });
  });
  return doc;
}

/* ---------- Inventariere ---------- */
export async function createInventory(input, actor) {
  const sql = db();
  const w = await requireWarehouse(sql, input.warehouse);
  const conds = [sql`p.active`];
  if (isUuid(String(input.category || ""))) conds.push(sql`p.category_id = ${input.category}`);
  if (input.onlyInStock) conds.push(sql`exists (select 1 from stock s where s.product_id = p.id and s.warehouse_id = ${w._id} and s.quantity > 0)`);
  const products = await sql`
    select p.id, p.name, p.sku, p.unit, p.cost_price,
           coalesce((select quantity from stock s where s.product_id = p.id and s.warehouse_id = ${w._id}), 0) as current
    from products p where ${conds.slice(1).reduce((a, c) => sql`${a} and ${c}`, conds[0])}
    order by lower(p.name)`;
  if (!products.length) throw badRequest("Nu există produse pentru inventariere");
  const items = products.map((p) => ({
    product: p._id,
    productName: p.name,
    sku: p.sku || null,
    unit: p.unit,
    expected: p.current,
    counted: null,
    unitCost: p.costPrice ?? null,
  }));
  return sql.begin(async (t) => {
    const number = await nextNumber("inventory", t);
    const [doc] = await t`insert into inventory_counts ${t({
      number,
      warehouseId: w._id,
      items: t.json(items),
      note: input.note || null,
      createdById: actor.id,
    })} returning *`;
    return doc;
  });
}

export async function getInventory(id, q = db()) {
  if (!isUuid(String(id))) throw notFound("Inventarierea nu există");
  const [inv] = await q`
    select i.*,
      (select json_build_object('_id', w.id, 'name', w.name) from warehouses w where w.id = i.warehouse_id) as warehouse,
      (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = i.created_by_id) as created_by,
      (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = i.completed_by_id) as completed_by
    from inventory_counts i where i.id = ${id}`;
  if (!inv) throw notFound("Inventarierea nu există");
  return inv;
}

function applyCounts(items, input) {
  const counts = new Map((input.items || []).map((l) => [String(idOf(l.product)), l.counted]));
  return items.map((line) => {
    const k = String(line.product);
    if (!counts.has(k)) return line;
    const v = counts.get(k);
    return { ...line, counted: v === "" || v === null || v === undefined ? null : Math.max(0, round4(Number(v))) };
  });
}

export async function updateInventory(id, input) {
  return db().begin(async (t) => {
    const [inv] = await t`select * from inventory_counts where id = ${id} for update`;
    if (!inv) throw notFound("Inventarierea nu există");
    if (inv.status !== "draft") throw badRequest("Inventarierea este închisă");
    const items = applyCounts(inv.items, input);
    const note = input.note !== undefined ? input.note || null : inv.note;
    const [doc] = await t`update inventory_counts set items = ${t.json(items)}, note = ${note} where id = ${id} returning *`;
    return doc;
  });
}

export async function completeInventory(id, actor, input) {
  let doc;
  let moved;
  await db().begin(async (t) => {
    const [inv] = await t`select * from inventory_counts where id = ${id} for update`;
    if (!inv) throw notFound("Inventarierea nu există");
    if (inv.status !== "draft") throw badRequest("Inventarierea este deja închisă");
    const items = input?.items ? applyCounts(inv.items, input) : inv.items;
    const counted = items.filter((l) => l.counted !== null && l.counted !== undefined);
    if (!counted.length) throw badRequest("Introduceți cel puțin o cantitate numărată");
    const pids = counted.map((l) => l.product);
    const rows = await t`select product_id, quantity from stock where warehouse_id = ${inv.warehouseId} and product_id in ${t(pids)} for update`;
    const current = new Map(rows.map((r) => [String(r.productId), r.quantity]));
    let surplus = 0;
    let shortage = 0;
    let valueDiff = 0;
    const moves = [];
    const finalItems = items.map((l) => {
      if (l.counted === null || l.counted === undefined) return l;
      const cur = current.get(String(l.product)) || 0;
      const diff = round4(l.counted - cur);
      if (diff > 0) surplus += diff;
      if (diff < 0) shortage += -diff;
      valueDiff += diff * (l.unitCost || 0);
      if (diff !== 0) moves.push({ product: l.product, warehouse: inv.warehouseId, set: l.counted, type: "inventory", unitCost: l.unitCost });
      return { ...l, expected: cur };
    });
    moved = await applyMovements(moves, { refType: "InventoryCount", refId: inv._id, refNumber: inv.number, user: actor }, t);
    const summary = { lines: counted.length, surplus: round4(surplus), shortage: round4(shortage), valueDiff: round2(valueDiff) };
    [doc] = await t`update inventory_counts set
        status = 'completed', items = ${t.json(finalItems)}, completed_by_id = ${actor.id}, completed_at = now(),
        summary = ${t.json(summary)}
      where id = ${id} returning *`;
  });
  afterStock(moved, { refType: "InventoryCount", refId: doc._id, refNumber: doc.number });
  runAfter(async () => {
    await logAudit({
      action: "inventory_completed",
      category: "stock",
      entity: doc,
      entityName: doc.number,
      user: actor,
      details: `${doc.number}: ${doc.summary.lines} poziții · ${moved.length} corecții · diferență ${doc.summary.valueDiff}`,
    });
    emit("inventory.completed", { id: doc._id, number: doc.number, warehouseId: doc.warehouseId, summary: doc.summary });
  });
  return doc;
}

export async function cancelInventory(id) {
  const [doc] = await db()`update inventory_counts set status = 'cancelled' where id = ${id} and status = 'draft' returning *`;
  if (!doc) throw badRequest("Inventarierea este deja închisă");
  return doc;
}

export { stockInWarehouse };
