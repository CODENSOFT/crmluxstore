// Documente de stoc: receptie, transfer, casare, inventariere (interfata + API v1)
import mongoose from "mongoose";
import Product from "@/models/Product";
import Warehouse from "@/models/Warehouse";
import Supplier from "@/models/Supplier";
import StockArrival from "@/models/StockArrival";
import Transfer from "@/models/Transfer";
import WriteOff from "@/models/WriteOff";
import InventoryCount from "@/models/InventoryCount";
import { badRequest, notFound, round2, round4 } from "./api";
import { applyMovements, stockInWarehouse } from "./stock";
import { nextNumber } from "./counters";
import { logAudit } from "./audit";
import { emit, runAfter } from "./events";
import { UNIT_LABELS, writeoffReasonLabel, WRITEOFF_REASONS } from "./constants";

const idOf = (x) => (x ? String(x._id || x) : null);

async function requireWarehouse(id, label = "Depozitul") {
  if (!id) throw badRequest(`${label} este obligatoriu`);
  const w = await Warehouse.findById(idOf(id)).lean();
  if (!w) throw badRequest(`${label} nu există`);
  return w;
}

// Valideaza liniile si incarca produsele intr-o singura interogare
async function loadLines(rawItems, { withCost = false } = {}) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw badRequest("Adăugați cel puțin un produs");
  const ids = rawItems.map((l) => idOf(l.product)).filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } }).select("name sku unit costPrice stock").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return rawItems.map((l, i) => {
    const p = byId.get(idOf(l.product));
    if (!p) throw badRequest(`Linia ${i + 1}: produsul nu există`);
    const quantity = round4(Number(l.quantity));
    if (!(quantity > 0)) throw badRequest(`Linia ${i + 1}: cantitatea pentru „${p.name}” trebuie să fie mai mare ca 0`);
    const line = { product: p._id, productName: p.name, sku: p.sku, unit: p.unit, quantity, _doc: p };
    if (withCost) {
      const c = l.unitCost === "" || l.unitCost == null ? undefined : Number(l.unitCost);
      if (c !== undefined && !(c >= 0)) throw badRequest(`Linia ${i + 1}: preț de achiziție invalid`);
      line.unitCost = c;
      line.lineTotal = c ? round2(c * quantity) : 0;
    }
    return line;
  });
}

const strip = (lines) => lines.map(({ _doc, ...l }) => l);

/* ---------- Receptie ---------- */
export async function createArrival(input, actor) {
  if (input.externalId) {
    const dup = await StockArrival.findOne({ externalId: String(input.externalId) });
    if (dup) return { doc: dup, duplicate: true };
  }
  const w = await requireWarehouse(input.warehouse);
  let supplierName = input.supplier?.trim?.() || undefined;
  let supplierId;
  if (input.supplierId) {
    const s = await Supplier.findById(idOf(input.supplierId)).lean();
    if (!s) throw badRequest("Furnizorul ales nu există");
    supplierName = s.name;
    supplierId = s._id;
  }
  const lines = await loadLines(input.items, { withCost: true });
  const _id = new mongoose.Types.ObjectId();
  const number = await nextNumber("arrival");
  await applyMovements(
    lines.map((l) => ({ product: l.product, warehouse: w._id, qty: l.quantity, type: "arrival", unitCost: l.unitCost })),
    { refType: "StockArrival", refId: _id, refNumber: number, user: actor }
  );
  if (input.updateCostPrice !== false) {
    await Promise.all(
      lines.filter((l) => l.unitCost > 0).map((l) => Product.updateOne({ _id: l.product }, { $set: { costPrice: l.unitCost } }))
    );
  }
  const doc = await StockArrival.create({
    _id,
    number,
    warehouse: w._id,
    supplierId,
    supplier: supplierName,
    supplierInvoice: input.supplierInvoice,
    supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : undefined,
    items: strip(lines),
    total: round2(lines.reduce((s, l) => s + (l.lineTotal || 0), 0)),
    note: input.note,
    createdBy: actor.system ? undefined : actor.id,
    externalId: input.externalId ? String(input.externalId) : undefined,
    source: input.source || "crm",
  });
  runAfter(async () => {
    await logAudit({
      action: "arrival",
      category: "stock",
      entity: doc,
      entityName: number,
      user: actor,
      details: `${number}: ${lines.length} produse în ${w.name}${supplierName ? ` · furnizor ${supplierName}` : ""} · ${doc.total}`,
    });
    emit("arrival.created", {
      id: String(doc._id),
      number,
      externalId: doc.externalId || null,
      warehouseId: String(w._id),
      supplier: supplierName || null,
      total: doc.total,
      items: lines.map((l) => ({ productId: String(l.product), sku: l.sku || null, quantity: l.quantity, unitCost: l.unitCost ?? null })),
    });
  });
  return { doc, duplicate: false };
}

/* ---------- Transfer ---------- */
export async function createTransfer(input, actor) {
  const from = await requireWarehouse(input.fromWarehouse, "Depozitul sursă");
  const to = await requireWarehouse(input.toWarehouse, "Depozitul destinație");
  if (String(from._id) === String(to._id)) throw badRequest("Depozitul sursă și destinație trebuie să fie diferite");
  const lines = await loadLines(input.items);
  const _id = new mongoose.Types.ObjectId();
  const number = await nextNumber("transfer");
  await applyMovements(
    [
      ...lines.map((l) => ({ product: l.product, warehouse: from._id, qty: -l.quantity, type: "transfer_out" })),
      ...lines.map((l) => ({ product: l.product, warehouse: to._id, qty: l.quantity, type: "transfer_in" })),
    ],
    { refType: "Transfer", refId: _id, refNumber: number, user: actor, note: `${from.name} → ${to.name}` }
  );
  const doc = await Transfer.create({
    _id,
    number,
    fromWarehouse: from._id,
    toWarehouse: to._id,
    items: strip(lines),
    note: input.note,
    createdBy: actor.system ? undefined : actor.id,
  });
  runAfter(async () => {
    await logAudit({
      action: "transfer",
      category: "stock",
      entity: doc,
      entityName: number,
      user: actor,
      details: `${number}: ${lines.length} produse ${from.name} → ${to.name}`,
    });
    emit("transfer.created", {
      id: String(doc._id),
      number,
      fromWarehouseId: String(from._id),
      toWarehouseId: String(to._id),
      items: lines.map((l) => ({ productId: String(l.product), sku: l.sku || null, quantity: l.quantity })),
    });
  });
  return doc;
}

/* ---------- Casare ---------- */
export async function createWriteoff(input, actor) {
  const w = await requireWarehouse(input.warehouse);
  const reasonCode = WRITEOFF_REASONS.some((r) => r.key === input.reasonCode) ? input.reasonCode : "other";
  const lines = await loadLines(input.items);
  for (const l of lines) l.unitCost = l._doc.costPrice;
  const _id = new mongoose.Types.ObjectId();
  const number = await nextNumber("writeoff");
  await applyMovements(
    lines.map((l) => ({ product: l.product, warehouse: w._id, qty: -l.quantity, type: "writeoff", unitCost: l.unitCost })),
    { refType: "WriteOff", refId: _id, refNumber: number, user: actor, note: writeoffReasonLabel(reasonCode) }
  );
  const doc = await WriteOff.create({
    _id,
    number,
    warehouse: w._id,
    reasonCode,
    reason: input.reason,
    items: strip(lines),
    totalCost: round2(lines.reduce((s, l) => s + (l.unitCost || 0) * l.quantity, 0)),
    createdBy: actor.system ? undefined : actor.id,
  });
  runAfter(async () => {
    await logAudit({
      action: "writeoff",
      category: "stock",
      entity: doc,
      entityName: number,
      user: actor,
      details: `${number}: ${lines.map((l) => `${l.quantity} ${UNIT_LABELS[l.unit] || ""} ${l.productName}`).join(", ")} din ${w.name} · ${writeoffReasonLabel(reasonCode)}${input.reason ? ` (${input.reason})` : ""}`,
    });
    emit("writeoff.created", {
      id: String(doc._id),
      number,
      warehouseId: String(w._id),
      reason: reasonCode,
      items: lines.map((l) => ({ productId: String(l.product), sku: l.sku || null, quantity: l.quantity })),
    });
  });
  return doc;
}

/* ---------- Inventariere ---------- */
export async function createInventory(input, actor) {
  const w = await requireWarehouse(input.warehouse);
  const filter = { active: { $ne: false } };
  if (input.category) filter.category = input.category;
  if (input.onlyInStock) filter.stock = { $elemMatch: { warehouse: w._id, quantity: { $gt: 0 } } };
  const products = await Product.find(filter).select("name sku unit costPrice stock").sort({ name: 1 }).lean();
  if (!products.length) throw badRequest("Nu există produse pentru inventariere");
  return InventoryCount.create({
    number: await nextNumber("inventory"),
    warehouse: w._id,
    items: products.map((p) => ({
      product: p._id,
      productName: p.name,
      sku: p.sku,
      unit: p.unit,
      expected: stockInWarehouse(p, w._id),
      counted: null,
      unitCost: p.costPrice,
    })),
    note: input.note,
    createdBy: actor.id,
  });
}

export async function updateInventory(inv, input) {
  if (inv.status !== "draft") throw badRequest("Inventarierea este închisă");
  const counts = new Map((input.items || []).map((l) => [idOf(l.product), l.counted]));
  for (const line of inv.items) {
    const k = String(line.product);
    if (!counts.has(k)) continue;
    const v = counts.get(k);
    line.counted = v === "" || v === null || v === undefined ? null : Math.max(0, round4(Number(v)));
  }
  if (input.note !== undefined) inv.note = input.note;
  await inv.save();
  return inv;
}

export async function completeInventory(inv, actor) {
  if (inv.status !== "draft") throw badRequest("Inventarierea este deja închisă");
  const counted = inv.items.filter((l) => l.counted !== null && l.counted !== undefined);
  if (!counted.length) throw badRequest("Introduceți cel puțin o cantitate numărată");
  const whId = inv.warehouse?._id || inv.warehouse;
  const products = await Product.find({ _id: { $in: counted.map((l) => l.product) } }).select("stock costPrice").lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  let surplus = 0;
  let shortage = 0;
  let valueDiff = 0;
  const moves = [];
  for (const l of counted) {
    const p = byId.get(String(l.product));
    if (!p) continue;
    const current = stockInWarehouse(p, whId);
    l.expected = current;
    const diff = round4(l.counted - current);
    if (diff > 0) surplus += diff;
    if (diff < 0) shortage += -diff;
    valueDiff += diff * (l.unitCost ?? p.costPrice ?? 0);
    if (diff !== 0) moves.push({ product: l.product, warehouse: whId, set: l.counted, type: "inventory", unitCost: l.unitCost });
  }
  await applyMovements(moves, { refType: "InventoryCount", refId: inv._id, refNumber: inv.number, user: actor });
  inv.status = "completed";
  inv.completedBy = actor.id;
  inv.completedAt = new Date();
  inv.summary = { lines: counted.length, surplus: round4(surplus), shortage: round4(shortage), valueDiff: round2(valueDiff) };
  await inv.save();
  runAfter(async () => {
    await logAudit({
      action: "inventory_completed",
      category: "stock",
      entity: inv,
      entityName: inv.number,
      user: actor,
      details: `${inv.number}: ${counted.length} poziții · ${moves.length} corecții · diferență ${round2(valueDiff)}`,
    });
    emit("inventory.completed", { id: String(inv._id), number: inv.number, warehouseId: String(whId), summary: inv.summary });
  });
  return inv;
}

export async function getInventory(id) {
  const inv = await InventoryCount.findById(id).populate("warehouse", "name").populate("createdBy completedBy", "name");
  if (!inv) throw notFound("Inventarierea nu există");
  return inv;
}
