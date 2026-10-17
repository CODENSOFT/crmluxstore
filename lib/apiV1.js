// API public v1 — pentru 1C, site si alte sisteme externe. Autentificare prin cheie API.
// Contract stabil: vezi docs/INTEGRARE-1C.md si /api/v1/openapi.json
import mongoose from "mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Warehouse from "@/models/Warehouse";
import Customer from "@/models/Customer";
import Supplier from "@/models/Supplier";
import Order from "@/models/Order";
import StockArrival from "@/models/StockArrival";
import StockMovement from "@/models/StockMovement";
import { HttpError, badRequest, notFound, escapeRegex, round2 } from "./api";
import { getSettings } from "./settings";
import {
  productDTO,
  customerDTO,
  warehouseDTO,
  categoryDTO,
  supplierDTO,
  ordersDTO,
  movementDTO,
  docLines,
} from "./dto";
import { pickProductFields, resolveCategory, resolveWarehouse, resolveProduct } from "./products";
import { pickCustomerFields, findCustomerMatch, upsertCustomer } from "./customers";
import { pickSupplier } from "./suppliers";
import { applyMovements } from "./stock";
import { createOrder, systemActor, setOrderStage, cancelOrder, approveOrder, addPayment, markExported1c, setInvoice, loadOrder } from "./orderService";
import { createArrival } from "./stockDocs";
import { emit } from "./events";
import { logIntegration } from "./integrationLog";
import { STAGE_KEYS, normalizeStage } from "./orderStages";
import { openApiSpec } from "./openapi";

const MAX_BATCH = 1000;

function pageParams(query, def = 100) {
  const page = Math.max(1, parseInt(query.get("page") || "1", 10) || 1);
  const limit = Math.min(1000, Math.max(1, parseInt(query.get("limit") || String(def), 10) || def));
  return { page, limit, skip: (page - 1) * limit };
}

function since(query, field = "updatedAt") {
  const v = query.get("updatedSince") || query.get("since");
  if (!v) return {};
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest("Parametrul updatedSince trebuie să fie o dată ISO 8601");
  return { [field]: { $gt: d } };
}

function batchItems(body) {
  const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : body ? [body] : [];
  if (!items.length) throw badRequest("Trimiteți un obiect sau o listă în câmpul „items”");
  if (items.length > MAX_BATCH) throw badRequest(`Maximum ${MAX_BATCH} elemente per cerere`);
  return items;
}

function listMeta(page, limit, total) {
  return { page, limit, total, hasMore: page * limit < total };
}

async function warehousesMap() {
  const ws = await Warehouse.find().select("name code externalId").lean();
  return new Map(ws.map((w) => [String(w._id), w]));
}

function actorName(key) {
  return key.kind === "1c" ? "1C" : `API: ${key.name}`;
}

function sourceOf(key) {
  return key.kind === "1c" ? "1c" : "api";
}

async function findOrder(ref) {
  let o = null;
  if (mongoose.isValidObjectId(ref)) o = await Order.findById(ref);
  if (!o) o = await Order.findOne({ number: ref });
  if (!o) o = await Order.findOne({ externalId: ref });
  if (!o) throw notFound(`Comanda „${ref}” nu există`);
  return o;
}

async function respondOrder(o) {
  const s = await getSettings();
  const full = await loadOrder(o._id).lean();
  return (await ordersDTO([full], s.currency))[0];
}

/* ===================== Handlere ===================== */

const H = {};

H.info = async () => ({
  data: {
    name: "Lux Store CRM API",
    version: "1.0",
    docs: "/api/v1/openapi.json",
    time: new Date().toISOString(),
  },
});

H.ping = async ({ key }) => ({ data: { ok: true, key: key.name, kind: key.kind, time: new Date().toISOString() } });

H.openapi = async ({ req }) => ({ raw: Response.json(openApiSpec(new URL(req.url).origin)) });

/* ---------- Produse ---------- */
H.listProducts = async ({ query }) => {
  const f = { ...since(query) };
  if (query.get("active") === "1") f.active = { $ne: false };
  if (query.get("sku")) f.sku = { $regex: `^${escapeRegex(query.get("sku"))}$`, $options: "i" };
  if (query.get("externalId")) f.externalId = query.get("externalId");
  if (query.get("q")) f.name = { $regex: escapeRegex(query.get("q")), $options: "i" };
  const { page, limit, skip } = pageParams(query);
  const [items, total, wmap] = await Promise.all([
    Product.find(f).select("-photo").populate("category", "name").sort({ updatedAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(f),
    warehousesMap(),
  ]);
  return { data: items.map((p) => productDTO(p, { warehouses: wmap })), meta: listMeta(page, limit, total) };
};

H.getProduct = async ({ params }) => {
  const p = await resolveProduct({ productId: params.id, externalId: params.id, sku: params.id, barcode: params.id });
  if (!p) throw notFound("Produsul nu există");
  const full = await Product.findById(p._id).select("-photo").populate("category", "name").lean();
  return { data: productDTO(full, { warehouses: await warehousesMap() }) };
};

H.upsertProducts = async ({ body, key }) => {
  const items = batchItems(body);
  const results = [];
  const actor = { name: actorName(key), system: true };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const fields = pickProductFields({
        name: it.name,
        description: it.description,
        sku: it.sku,
        barcode: it.barcode,
        brand: it.brand,
        packaging: it.packaging,
        unit: it.unit,
        price: it.price,
        wholesalePrice: it.wholesalePrice,
        costPrice: it.costPrice,
        vatRate: it.vatRate,
        minStock: it.minStock,
        active: it.active,
        externalId: it.externalId,
      });
      for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
      const category = await resolveCategory(it);
      if (category) fields.category = category;

      let p = await resolveProduct({ productId: it.id, externalId: it.externalId, sku: it.sku, barcode: it.barcode });
      let status = "updated";
      if (p) {
        Object.assign(p, fields);
        await p.save();
      } else {
        if (!fields.name) throw badRequest("Câmpul „name” este obligatoriu pentru produse noi");
        p = await Product.create({ unit: "bucata", source: sourceOf(key), ...fields });
        status = "created";
      }
      if (Array.isArray(it.stock) && it.stock.length) {
        const lines = [];
        for (const s of it.stock) {
          const w = await resolveWarehouse(s.warehouse || s.warehouseId || s.warehouseCode || s.warehouseExternalId);
          if (!w) throw badRequest(`Depozit necunoscut: ${s.warehouse || s.warehouseId || s.warehouseCode || s.warehouseExternalId}`);
          lines.push({ product: p._id, warehouse: w._id, set: Number(s.quantity) || 0, type: "sync" });
        }
        await applyMovements(lines, { refType: "api", refId: p._id, user: actor, note: `Sincronizare ${actorName(key)}` });
      }
      emit(status === "created" ? "product.created" : "product.updated", async () =>
        productDTO(await Product.findById(p._id).select("-photo").lean())
      );
      results.push({ index: i, status, id: String(p._id), externalId: p.externalId || null, sku: p.sku || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null, sku: it.sku || null });
    }
  }
  return { data: summarize(results) };
};

H.deleteProduct = async ({ params }) => {
  const p = await resolveProduct({ productId: params.id, externalId: params.id, sku: params.id });
  if (!p) throw notFound("Produsul nu există");
  p.active = false;
  await p.save();
  return { data: { id: String(p._id), active: false } };
};

/* ---------- Categorii ---------- */
H.listCategories = async ({ query }) => {
  const items = await Category.find(since(query)).sort({ sort: 1, name: 1 }).lean();
  return { data: items.map(categoryDTO) };
};

H.upsertCategories = async ({ body }) => {
  const items = batchItems(body);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (!it.name) throw badRequest("„name” este obligatoriu");
      let c = it.externalId ? await Category.findOne({ externalId: String(it.externalId) }) : null;
      if (!c) c = await Category.findOne({ name: { $regex: `^${escapeRegex(it.name.trim())}$`, $options: "i" } });
      let status = "updated";
      const parent = it.parentExternalId ? await Category.findOne({ externalId: String(it.parentExternalId) }).select("_id").lean() : null;
      if (c) {
        c.name = it.name.trim();
        if (it.externalId) c.externalId = String(it.externalId);
        if (parent) c.parent = parent._id;
        if (it.active !== undefined) c.active = !!it.active;
        await c.save();
      } else {
        c = await Category.create({ name: it.name.trim(), externalId: it.externalId ? String(it.externalId) : undefined, parent: parent?._id });
        status = "created";
      }
      results.push({ index: i, status, id: String(c._id), externalId: c.externalId || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Depozite ---------- */
H.listWarehouses = async () => {
  const items = await Warehouse.find().sort({ isDefault: -1, name: 1 }).lean();
  return { data: items.map(warehouseDTO) };
};

H.upsertWarehouses = async ({ body }) => {
  const items = batchItems(body);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (!it.name) throw badRequest("„name” este obligatoriu");
      let w = it.externalId ? await Warehouse.findOne({ externalId: String(it.externalId) }) : null;
      if (!w && it.code) w = await Warehouse.findOne({ code: it.code });
      if (!w) w = await Warehouse.findOne({ name: { $regex: `^${escapeRegex(it.name.trim())}$`, $options: "i" } });
      let status = "updated";
      const fields = { name: it.name.trim() };
      for (const f of ["code", "address", "type", "active", "syncToSite"]) if (it[f] !== undefined) fields[f] = it[f];
      if (it.externalId) fields.externalId = String(it.externalId);
      if (w) {
        Object.assign(w, fields);
        await w.save();
      } else {
        w = await Warehouse.create(fields);
        status = "created";
      }
      results.push({ index: i, status, id: String(w._id), externalId: w.externalId || null, code: w.code || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Clienti ---------- */
H.listCustomers = async ({ query }) => {
  const f = { ...since(query) };
  if (query.get("externalId")) f.externalId = query.get("externalId");
  if (query.get("idno")) f.idno = query.get("idno");
  if (query.get("q")) f.name = { $regex: escapeRegex(query.get("q")), $options: "i" };
  const { page, limit, skip } = pageParams(query);
  const [items, total] = await Promise.all([
    Customer.find(f).sort({ updatedAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(f),
  ]);
  return { data: items.map(customerDTO), meta: listMeta(page, limit, total) };
};

H.getCustomer = async ({ params }) => {
  let c = mongoose.isValidObjectId(params.id) ? await Customer.findById(params.id).lean() : null;
  if (!c) c = await Customer.findOne({ $or: [{ externalId: params.id }, { idno: params.id }, { number: params.id }] }).lean();
  if (!c) throw notFound("Clientul nu există");
  return { data: customerDTO(c) };
};

H.upsertCustomers = async ({ body }) => {
  const items = batchItems(body);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let c = (it.id && mongoose.isValidObjectId(it.id) ? await Customer.findById(it.id) : null) || (await findCustomerMatch(it));
      let status = "updated";
      const fields = pickCustomerFields(it);
      if (c) {
        Object.assign(c, fields);
        await c.save();
      } else {
        if (!fields.name) throw badRequest("„name” este obligatoriu pentru clienți noi");
        ({ customer: c } = await upsertCustomer(it));
        status = "created";
      }
      emit(status === "created" ? "customer.created" : "customer.updated", () => customerDTO(c.toObject()));
      results.push({ index: i, status, id: String(c._id), externalId: c.externalId || null, number: c.number || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Furnizori ---------- */
H.listSuppliers = async ({ query }) => {
  const items = await Supplier.find(since(query)).sort({ name: 1 }).lean();
  return { data: items.map(supplierDTO) };
};

H.upsertSuppliers = async ({ body }) => {
  const items = batchItems(body);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let s = it.externalId ? await Supplier.findOne({ externalId: String(it.externalId) }) : null;
      if (!s && it.idno) s = await Supplier.findOne({ idno: it.idno });
      if (!s && it.name) s = await Supplier.findOne({ name: { $regex: `^${escapeRegex(it.name.trim())}$`, $options: "i" } });
      const fields = pickSupplier(it);
      let status = "updated";
      if (s) {
        Object.assign(s, fields);
        await s.save();
      } else {
        if (!fields.name) throw badRequest("„name” este obligatoriu");
        s = await Supplier.create(fields);
        status = "created";
      }
      results.push({ index: i, status, id: String(s._id), externalId: s.externalId || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Stoc ---------- */
H.getStock = async ({ query }) => {
  const f = { active: { $ne: false }, ...since(query) };
  let wh = null;
  if (query.get("warehouse")) {
    wh = await resolveWarehouse(query.get("warehouse"));
    if (!wh) throw notFound("Depozitul nu există");
  }
  if (query.get("sku")) f.sku = query.get("sku");
  const [products, wmap] = await Promise.all([Product.find(f).select("sku externalId barcode name unit stock updatedAt").lean(), warehousesMap()]);
  const rows = [];
  for (const p of products) {
    for (const s of p.stock || []) {
      if (wh && String(s.warehouse) !== String(wh._id)) continue;
      const w = wmap.get(String(s.warehouse));
      rows.push({
        productId: String(p._id),
        productExternalId: p.externalId || null,
        sku: p.sku || null,
        barcode: p.barcode || null,
        name: p.name,
        unit: p.unit,
        warehouseId: String(s.warehouse),
        warehouseCode: w?.code || null,
        warehouseExternalId: w?.externalId || null,
        quantity: s.quantity || 0,
      });
    }
  }
  return { data: rows, meta: { total: rows.length } };
};

// mode: "set" (cantitate absoluta — 1C este sursa de adevar) | "add" (adauga/scade diferenta)
H.setStock = async ({ body, key }) => {
  const mode = body?.mode === "add" ? "add" : "set";
  const items = batchItems(body?.items ? body.items : body);
  const actor = { name: actorName(key), system: true };
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId || it.externalId, sku: it.sku, barcode: it.barcode });
      if (!p) throw badRequest("Produs negăsit (productId / productExternalId / sku / barcode)");
      const w = await resolveWarehouse(it.warehouse || it.warehouseId || it.warehouseCode || it.warehouseExternalId);
      if (!w) throw badRequest("Depozit negăsit (warehouse / warehouseId / warehouseCode / warehouseExternalId)");
      const q = Number(it.quantity);
      if (!Number.isFinite(q)) throw badRequest("„quantity” invalid");
      const line = mode === "set" ? { set: Math.max(0, q) } : { qty: q };
      const [r] = await applyMovements([{ product: p._id, warehouse: w._id, type: "sync", ...line }], {
        refType: "api",
        refId: p._id,
        user: actor,
        note: body?.note || `Sincronizare stoc ${actorName(key)}`,
      });
      results.push({ index: i, status: "ok", productId: String(p._id), sku: p.sku || null, warehouseId: String(w._id), change: r?.delta ?? 0, quantity: r?.balance ?? (mode === "set" ? q : null) });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, sku: it.sku || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Comenzi ---------- */
H.listOrders = async ({ query }) => {
  const f = { ...since(query) };
  if (query.get("createdSince")) f.createdAt = { $gt: new Date(query.get("createdSince")) };
  if (query.get("status")) f.status = { $in: query.get("status").split(",").map((s) => s.trim()) };
  if (query.get("channel")) f.channel = query.get("channel");
  if (query.get("exported") === "0") {
    f["export1c.exportedAt"] = null;
    if (!query.get("status")) f.status = { $in: ["processing", "ready", "invoicing", "completed"] };
  }
  if (query.get("exported") === "1") f["export1c.exportedAt"] = { $ne: null };
  const { page, limit, skip } = pageParams(query, 50);
  const s = await getSettings();
  let q = Order.find(f).sort({ updatedAt: 1, _id: 1 }).skip(skip).limit(limit);
  q = q.populate("customer", "name phone email idno type externalId").populate("responsible", "name email");
  const [items, total] = await Promise.all([q.lean(), Order.countDocuments(f)]);
  return { data: await ordersDTO(items, s.currency), meta: listMeta(page, limit, total) };
};

H.getOrder = async ({ params }) => ({ data: await respondOrder(await findOrder(params.id)) });

H.createOrder = async ({ body, key }) => {
  if (!body || typeof body !== "object") throw badRequest("Corp JSON invalid");
  const source = sourceOf(key);
  if (body.externalId) {
    const dup = await Order.findOne({ externalSource: source, externalId: String(body.externalId) });
    if (dup) return { data: await respondOrder(dup), meta: { duplicate: true } };
  }
  if (!Array.isArray(body.items) || !body.items.length) throw badRequest("„items” este obligatoriu");
  const items = [];
  for (const [i, it] of body.items.entries()) {
    const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId, sku: it.sku, barcode: it.barcode });
    if (!p) throw badRequest(`Linia ${i + 1}: produs negăsit (${it.sku || it.productExternalId || it.productId || "?"})`);
    let warehouse;
    if (it.warehouse || it.warehouseId || it.warehouseCode || it.warehouseExternalId) {
      const w = await resolveWarehouse(it.warehouse || it.warehouseId || it.warehouseCode || it.warehouseExternalId);
      if (!w) throw badRequest(`Linia ${i + 1}: depozit negăsit`);
      warehouse = w._id;
    }
    items.push({ product: p._id, warehouse, quantity: it.quantity, unitPrice: it.price ?? it.unitPrice, discount: it.discount });
  }
  let customer;
  if (body.customerId) customer = body.customerId;
  else if (body.customer && (body.customer.name || body.customer.externalId || body.customer.idno || body.customer.phone)) {
    const found = await findCustomerMatch(body.customer);
    customer = found?._id || (body.customer.name ? (await upsertCustomer({ source: source, ...body.customer })).customer._id : undefined);
  }
  const status = normalizeStage(body.status || "new");
  if (!STAGE_KEYS.includes(status)) throw badRequest("Status invalid");
  const actor = await systemActor(actorName(key));
  const order = await createOrder(
    {
      items,
      customer,
      customerName: body.customer?.name,
      customerPhone: body.customer?.phone,
      customerEmail: body.customer?.email,
      channel: body.channel || source,
      delivery: body.delivery,
      paymentMethod: body.paymentMethod,
      payments: body.payments,
      note: body.note,
      responsibleEmail: body.responsibleEmail,
      externalSource: source,
      externalId: body.externalId,
      externalNumber: body.externalNumber,
      dueDate: body.dueDate,
    },
    actor,
    { initialStatus: status, incoming: key.kind === "1c" ? "1C" : "API", allowPriceEdit: true }
  );
  return { data: await respondOrder(order), status: 201 };
};

H.updateOrder = async ({ params, body, key }) => {
  let order = await findOrder(params.id);
  const actor = await systemActor(actorName(key));
  if (body.status) {
    const st = normalizeStage(body.status);
    if (st === "cancelled" || st === "rejected") order = await cancelOrder(order, actor, body.reason || `Anulată din ${actorName(key)}`);
    else if (st === "processing" && ["new", "pending_approval"].includes(order.status)) order = await approveOrder(order, actor);
    else order = await setOrderStage(order, st, actor);
    order = await Order.findById(order._id);
  }
  if (body.export1c) {
    order = await markExported1c(order, body.export1c, actor);
    order = await Order.findById(order._id);
  }
  if (body.invoice) {
    order = await setInvoice(order, body.invoice, actor);
    order = await Order.findById(order._id);
  }
  if (body.delivery?.trackingNumber !== undefined) {
    order.delivery = { ...(order.delivery?.toObject?.() || order.delivery || {}), trackingNumber: body.delivery.trackingNumber };
    await order.save();
  }
  if (body.externalId && !order.externalId) {
    order.externalSource = order.externalSource || sourceOf(key);
    order.externalId = String(body.externalId);
    await order.save();
  }
  return { data: await respondOrder(order) };
};

H.exportOrder = async ({ params, body, key }) => {
  const order = await findOrder(params.id);
  const actor = await systemActor(actorName(key));
  await markExported1c(order, { docNumber: body?.docNumber, docId: body?.docId }, actor);
  return { data: await respondOrder(order) };
};

H.addOrderPayment = async ({ params, body, key }) => {
  const order = await findOrder(params.id);
  const actor = await systemActor(actorName(key));
  await addPayment(order, { amount: body?.amount, method: body?.method, date: body?.date, reference: body?.reference, note: body?.note || `Plată din ${actorName(key)}` }, actor);
  return { data: await respondOrder(order) };
};

/* ---------- Receptii ---------- */
H.listArrivals = async ({ query }) => {
  const f = { ...since(query, "createdAt") };
  const { page, limit, skip } = pageParams(query, 50);
  const [items, total] = await Promise.all([
    StockArrival.find(f).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    StockArrival.countDocuments(f),
  ]);
  return {
    data: items.map((d) => ({
      id: String(d._id),
      number: d.number || null,
      externalId: d.externalId || null,
      warehouseId: String(d.warehouse),
      supplierId: d.supplierId ? String(d.supplierId) : null,
      supplier: d.supplier || null,
      supplierInvoice: d.supplierInvoice || null,
      total: d.total || 0,
      items: docLines(d).map((l) => ({ productId: String(l.product?._id || l.product), sku: l.sku || null, name: l.productName, quantity: l.quantity, unitCost: l.unitCost ?? null })),
      createdAt: d.createdAt,
    })),
    meta: listMeta(page, limit, total),
  };
};

H.createArrival = async ({ body, key }) => {
  const w = await resolveWarehouse(body?.warehouse || body?.warehouseId || body?.warehouseCode || body?.warehouseExternalId);
  if (!w) throw badRequest("Depozit negăsit");
  let supplierId = body.supplierId;
  if (!supplierId && (body.supplierExternalId || body.supplierIdno)) {
    const s = await Supplier.findOne(body.supplierExternalId ? { externalId: body.supplierExternalId } : { idno: body.supplierIdno }).select("_id").lean();
    supplierId = s?._id;
  }
  const items = [];
  for (const [i, it] of (body.items || []).entries()) {
    const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId, sku: it.sku, barcode: it.barcode });
    if (!p) throw badRequest(`Linia ${i + 1}: produs negăsit (${it.sku || it.productExternalId || it.productId || "?"})`);
    items.push({ product: p._id, quantity: it.quantity, unitCost: it.unitCost });
  }
  const actor = { id: null, name: actorName(key), role: "admin", system: true };
  const { doc, duplicate } = await createArrival(
    {
      warehouse: w._id,
      supplierId,
      supplier: typeof body.supplier === "string" ? body.supplier : body.supplier?.name,
      supplierInvoice: body.supplierInvoice,
      supplierInvoiceDate: body.supplierInvoiceDate,
      items,
      note: body.note || `Recepție din ${actorName(key)}`,
      externalId: body.externalId,
      updateCostPrice: body.updateCostPrice !== false,
      source: sourceOf(key),
    },
    actor
  );
  return { data: { id: String(doc._id), number: doc.number, externalId: doc.externalId || null, total: doc.total }, meta: { duplicate }, status: duplicate ? 200 : 201 };
};

/* ---------- Registrul de stoc ---------- */
H.listMovements = async ({ query }) => {
  const f = { ...since(query, "createdAt") };
  if (query.get("type")) f.type = { $in: query.get("type").split(",") };
  if (query.get("warehouse")) {
    const w = await resolveWarehouse(query.get("warehouse"));
    if (w) f.warehouse = w._id;
  }
  if (query.get("product")) {
    const p = await resolveProduct(query.get("product"));
    if (p) f.product = p._id;
  }
  const limit = Math.min(1000, Number(query.get("limit")) || 200);
  const items = await StockMovement.find(f).sort({ createdAt: 1, _id: 1 }).limit(limit + 1).lean();
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return {
    data: page.map(movementDTO),
    meta: { limit, hasMore, nextSince: page.length ? page[page.length - 1].createdAt.toISOString() : null },
  };
};

function summarize(results) {
  return {
    total: results.length,
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated" || r.status === "ok").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };
}

/* ===================== Rutare ===================== */
// [metoda, cale, handler, drept, scriere-in-jurnal]
export const ROUTES = [
  ["GET", "/", H.info, null],
  ["GET", "/openapi.json", H.openapi, null],
  ["GET", "/ping", H.ping, "read"],
  ["GET", "/products", H.listProducts, "read"],
  ["POST", "/products", H.upsertProducts, "write", true],
  ["GET", "/products/:id", H.getProduct, "read"],
  ["DELETE", "/products/:id", H.deleteProduct, "write", true],
  ["GET", "/categories", H.listCategories, "read"],
  ["POST", "/categories", H.upsertCategories, "write", true],
  ["GET", "/warehouses", H.listWarehouses, "read"],
  ["POST", "/warehouses", H.upsertWarehouses, "write", true],
  ["GET", "/customers", H.listCustomers, "read"],
  ["POST", "/customers", H.upsertCustomers, "write", true],
  ["GET", "/customers/:id", H.getCustomer, "read"],
  ["GET", "/suppliers", H.listSuppliers, "read"],
  ["POST", "/suppliers", H.upsertSuppliers, "write", true],
  ["GET", "/stock", H.getStock, "read"],
  ["POST", "/stock", H.setStock, "write", true],
  ["GET", "/orders", H.listOrders, "read"],
  ["POST", "/orders", H.createOrder, "write", true],
  ["GET", "/orders/:id", H.getOrder, "read"],
  ["PATCH", "/orders/:id", H.updateOrder, "write", true],
  ["POST", "/orders/:id/export", H.exportOrder, "write", true],
  ["POST", "/orders/:id/payments", H.addOrderPayment, "write", true],
  ["GET", "/arrivals", H.listArrivals, "read"],
  ["POST", "/arrivals", H.createArrival, "write", true],
  ["GET", "/movements", H.listMovements, "read"],
];

export function matchRoute(method, path) {
  const segs = path.split("/").filter(Boolean);
  for (const [m, pattern, handler, scope, log] of ROUTES) {
    if (m !== method) continue;
    const ps = pattern.split("/").filter(Boolean);
    if (ps.length !== segs.length) continue;
    const params = {};
    let okMatch = true;
    for (let i = 0; i < ps.length; i++) {
      if (ps[i].startsWith(":")) params[ps[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (ps[i] !== segs[i]) {
        okMatch = false;
        break;
      }
    }
    if (okMatch) return { handler, scope, params, log, pattern };
  }
  const exists = ROUTES.some(([, pattern]) => {
    const ps = pattern.split("/").filter(Boolean);
    return ps.length === segs.length && ps.every((p, i) => p.startsWith(":") || p === segs[i]);
  });
  return exists ? { methodNotAllowed: true } : null;
}

export async function logApiCall(key, method, pattern, status, message, durationMs, count) {
  await logIntegration({
    source: key?.kind === "1c" ? "1c" : "api",
    direction: "in",
    action: `${method} ${pattern}`,
    status,
    message: `${key?.name || "?"}: ${message}`,
    count,
    durationMs,
  });
}

export { HttpError, round2 };
