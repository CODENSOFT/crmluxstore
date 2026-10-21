// API public v1 — pentru 1C, site si alte sisteme externe. Autentificare prin cheie API.
// Contract stabil: vezi public/docs/INTEGRARE-1C.md si /api/v1/openapi.json
import { db, isUuid, likeOf, where } from "./db";
import { HttpError, badRequest, notFound, round2 } from "./api";
import { getSettings } from "./settings";
import { productDTO, customerDTO, warehouseDTO, categoryDTO, supplierDTO, ordersDTO, movementDTO, docLines } from "./dto";
import { pickProductFields, resolveCategory, resolveWarehouse, resolveProduct, stockJson } from "./products";
import { CUSTOMER_COLS, findCustomerMatch, upsertCustomer, updateCustomer, getCustomer } from "./customers";
import { pickSupplier } from "./suppliers";
import { applyMovements } from "./stock";
import { createOrder, systemActor, setOrderStage, cancelOrder, approveOrder, addPayment, markExported1c, setInvoice, updateDelivery, loadOrder, orderSelect } from "./orderService";
import { createArrival, createTransfer, createWriteoff } from "./stockDocs";
import { changesSince, stableCursor, entityDTOs, ENTITIES } from "./sync1c";
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

function sinceDate(query) {
  const v = query.get("updatedSince") || query.get("since");
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw badRequest("Parametrul updatedSince trebuie să fie o dată ISO 8601");
  return d;
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
  const ws = await db()`select id, name, code, external_id from warehouses`;
  return new Map(ws.map((w) => [String(w._id), w]));
}

function actorName(key) {
  return key.kind === "1c" ? "1C" : `API: ${key.name}`;
}

function sourceOf(key) {
  return key.kind === "1c" ? "1c" : "api";
}

async function findOrderId(ref) {
  const sql = db();
  const [o] = await sql`
    select id from orders
    where ${isUuid(ref) ? sql`id = ${ref}` : sql`false`} or number = ${ref} or external_id = ${ref}
    limit 1`;
  if (!o) throw notFound(`Comanda „${ref}” nu există`);
  return o._id;
}

async function respondOrder(id) {
  const s = await getSettings();
  const full = await loadOrder(id);
  return (await ordersDTO([full], s.currency))[0];
}

async function productById(id) {
  const sql = db();
  const [p] = await sql`
    select p.*, c.name as category_name, ${stockJson(sql)} as stock
    from products p left join categories c on c.id = p.category_id where p.id = ${id}`;
  if (p) delete p.photo;
  return p;
}

/* ===================== Handlere ===================== */

const H = {};

H.info = async () => ({
  data: { name: "Lux Store CRM API", version: "1.0", docs: "/api/v1/openapi.json", time: new Date().toISOString() },
});

H.ping = async ({ key }) => ({ data: { ok: true, key: key.name, kind: key.kind, time: new Date().toISOString() } });

H.openapi = async ({ req }) => ({ raw: Response.json(openApiSpec(new URL(req.url).origin)) });

/* ---------- Produse ---------- */
H.listProducts = async ({ query }) => {
  const sql = db();
  const conds = [];
  const since = sinceDate(query);
  if (since) conds.push(sql`p.updated_at > ${since}`);
  if (query.get("active") === "1") conds.push(sql`p.active`);
  if (query.get("sku")) conds.push(sql`lower(p.sku) = ${query.get("sku").toLowerCase()}`);
  if (query.get("externalId")) conds.push(sql`p.external_id = ${query.get("externalId")}`);
  if (query.get("q")) conds.push(sql`p.name ilike ${likeOf(query.get("q"))}`);
  const { page, limit, skip } = pageParams(query);
  const [rows, wmap] = await Promise.all([
    sql`select p.id, p.name, p.description, p.sku, p.barcode, p.category_id, c.name as category_name, p.brand, p.packaging, p.unit,
               p.price, p.wholesale_price, p.cost_price, p.vat_rate, p.min_stock, p.is_composite, p.components, p.active,
               p.external_id, p.woo_id, p.created_at, p.updated_at, ${stockJson(sql)} as stock, count(*) over () as full_count
        from products p left join categories c on c.id = p.category_id
        where ${where(conds)} order by p.updated_at, p.id limit ${limit} offset ${skip}`,
    warehousesMap(),
  ]);
  const total = rows[0]?.fullCount || 0;
  return { data: rows.map((p) => productDTO(p, { warehouses: wmap })), meta: listMeta(page, limit, total) };
};

H.getProduct = async ({ params }) => {
  const p = await resolveProduct({ productId: params.id, externalId: params.id, sku: params.id, barcode: params.id });
  if (!p) throw notFound("Produsul nu există");
  return { data: productDTO(await productById(p._id), { warehouses: await warehousesMap() }) };
};

H.upsertProducts = async ({ body, key }) => {
  const items = batchItems(body);
  const sql = db();
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
      if (category) fields.categoryId = category;

      let p = await resolveProduct({ productId: it.id, externalId: it.externalId, sku: it.sku, barcode: it.barcode });
      let status = "updated";
      if (p) {
        if (Object.keys(fields).length) await sql`update products set ${sql(fields, ...Object.keys(fields))} where id = ${p._id}`;
      } else {
        if (!fields.name) throw badRequest("Câmpul „name” este obligatoriu pentru produse noi");
        [p] = await sql`insert into products ${sql({ unit: "bucata", source: sourceOf(key), ...fields })} returning id`;
        status = "created";
      }
      if (Array.isArray(it.stock) && it.stock.length) {
        const lines = [];
        for (const st of it.stock) {
          const ref = st.warehouse || st.warehouseId || st.warehouseCode || st.warehouseExternalId;
          const w = await resolveWarehouse(ref);
          if (!w) throw badRequest(`Depozit necunoscut: ${ref}`);
          lines.push({ product: p._id, warehouse: w._id, set: Number(st.quantity) || 0, type: "sync" });
        }
        await applyMovements(lines, { refType: "api", refId: p._id, user: actor, note: `Sincronizare ${actorName(key)}` });
      }
      const id = p._id;
      emit(status === "created" ? "product.created" : "product.updated", async () => productDTO(await productById(id)));
      const [fresh] = await sql`select external_id, sku from products where id = ${id}`;
      results.push({ index: i, status, id, externalId: fresh.externalId || null, sku: fresh.sku || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null, sku: it.sku || null });
    }
  }
  return { data: summarize(results) };
};

H.deleteProduct = async ({ params }) => {
  const p = await resolveProduct({ productId: params.id, externalId: params.id, sku: params.id });
  if (!p) throw notFound("Produsul nu există");
  await db()`update products set active = false where id = ${p._id}`;
  return { data: { id: p._id, active: false } };
};

/* ---------- Categorii ---------- */
H.listCategories = async ({ query }) => {
  const sql = db();
  const since = sinceDate(query);
  const items = await sql`select * from categories where ${since ? sql`updated_at > ${since}` : sql`true`} order by sort, lower(name)`;
  return { data: items.map(categoryDTO) };
};

H.upsertCategories = async ({ body }) => {
  const items = batchItems(body);
  const sql = db();
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (!it.name) throw badRequest("„name” este obligatoriu");
      const name = String(it.name).trim();
      let [c] = it.externalId ? await sql`select id from categories where external_id = ${String(it.externalId)}` : [];
      if (!c) [c] = await sql`select id from categories where lower(name) = ${name.toLowerCase()} limit 1`;
      const [parent] = it.parentExternalId ? await sql`select id from categories where external_id = ${String(it.parentExternalId)}` : [];
      let status = "updated";
      const fields = { name };
      if (it.externalId) fields.externalId = String(it.externalId);
      if (parent) fields.parentId = parent._id;
      if (it.active !== undefined) fields.active = !!it.active;
      if (c) await sql`update categories set ${sql(fields, ...Object.keys(fields))} where id = ${c._id}`;
      else {
        [c] = await sql`insert into categories ${sql(fields)} returning id`;
        status = "created";
      }
      results.push({ index: i, status, id: c._id, externalId: fields.externalId || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Depozite ---------- */
H.listWarehouses = async () => {
  const items = await db()`select * from warehouses order by is_default desc, lower(name)`;
  return { data: items.map(warehouseDTO) };
};

H.upsertWarehouses = async ({ body }) => {
  const items = batchItems(body);
  const sql = db();
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (!it.name) throw badRequest("„name” este obligatoriu");
      const name = String(it.name).trim();
      let [w] = it.externalId ? await sql`select id from warehouses where external_id = ${String(it.externalId)}` : [];
      if (!w && it.code) [w] = await sql`select id from warehouses where lower(code) = ${String(it.code).toLowerCase()} limit 1`;
      if (!w) [w] = await sql`select id from warehouses where lower(name) = ${name.toLowerCase()} limit 1`;
      const fields = { name };
      for (const f of ["code", "address", "type"]) if (it[f] !== undefined) fields[f] = it[f];
      for (const f of ["active", "syncToSite"]) if (it[f] !== undefined) fields[f] = !!it[f];
      if (it.externalId) fields.externalId = String(it.externalId);
      let status = "updated";
      if (w) await sql`update warehouses set ${sql(fields, ...Object.keys(fields))} where id = ${w._id}`;
      else {
        [w] = await sql`insert into warehouses ${sql(fields)} returning id`;
        status = "created";
      }
      const [fresh] = await sql`select external_id, code from warehouses where id = ${w._id}`;
      results.push({ index: i, status, id: w._id, externalId: fresh.externalId || null, code: fresh.code || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Clienti ---------- */
H.listCustomers = async ({ query }) => {
  const sql = db();
  const conds = [];
  const since = sinceDate(query);
  if (since) conds.push(sql`c.updated_at > ${since}`);
  if (query.get("externalId")) conds.push(sql`c.external_id = ${query.get("externalId")}`);
  if (query.get("idno")) conds.push(sql`c.idno = ${query.get("idno")}`);
  if (query.get("q")) conds.push(sql`c.name ilike ${likeOf(query.get("q"))}`);
  const { page, limit, skip } = pageParams(query);
  const rows = await sql`
    select ${sql.unsafe(CUSTOMER_COLS)}, count(*) over () as full_count from customers c
    where ${where(conds)} order by c.updated_at, c.id limit ${limit} offset ${skip}`;
  return { data: rows.map(customerDTO), meta: listMeta(page, limit, rows[0]?.fullCount || 0) };
};

H.getCustomer = async ({ params }) => {
  const sql = db();
  let c = isUuid(params.id) ? await getCustomer(params.id) : null;
  if (!c) {
    const [r] = await sql`select id from customers where external_id = ${params.id} or idno = ${params.id} or number = ${params.id} limit 1`;
    if (r) c = await getCustomer(r._id);
  }
  if (!c) throw notFound("Clientul nu există");
  return { data: customerDTO(c) };
};

H.upsertCustomers = async ({ body }) => {
  const items = batchItems(body);
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let c = (isUuid(String(it.id || "")) ? await getCustomer(it.id) : null) || (await findCustomerMatch(it));
      let status = "updated";
      if (c) c = await updateCustomer(c._id, it);
      else {
        if (!it.name) throw badRequest("„name” este obligatoriu pentru clienți noi");
        ({ customer: c } = await upsertCustomer(it));
        status = "created";
      }
      const snapshot = c;
      emit(status === "created" ? "customer.created" : "customer.updated", () => customerDTO(snapshot));
      results.push({ index: i, status, id: c._id, externalId: c.externalId || null, number: c.number || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Furnizori ---------- */
H.listSuppliers = async ({ query }) => {
  const sql = db();
  const since = sinceDate(query);
  const items = await sql`select * from suppliers where ${since ? sql`updated_at > ${since}` : sql`true`} order by lower(name)`;
  return { data: items.map(supplierDTO) };
};

H.upsertSuppliers = async ({ body }) => {
  const items = batchItems(body);
  const sql = db();
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      let [s] = it.externalId ? await sql`select id from suppliers where external_id = ${String(it.externalId)}` : [];
      if (!s && it.idno) [s] = await sql`select id from suppliers where idno = ${String(it.idno)} limit 1`;
      if (!s && it.name) [s] = await sql`select id from suppliers where lower(name) = ${String(it.name).trim().toLowerCase()} limit 1`;
      const fields = pickSupplier(it);
      let status = "updated";
      if (s) {
        if (Object.keys(fields).length) await sql`update suppliers set ${sql(fields, ...Object.keys(fields))} where id = ${s._id}`;
      } else {
        if (!fields.name) throw badRequest("„name” este obligatoriu");
        [s] = await sql`insert into suppliers ${sql(fields)} returning id`;
        status = "created";
      }
      results.push({ index: i, status, id: s._id, externalId: fields.externalId || null });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, externalId: it.externalId || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Stoc ---------- */
H.getStock = async ({ query }) => {
  const sql = db();
  const conds = [sql`p.active`];
  if (query.get("warehouse")) {
    const wh = await resolveWarehouse(query.get("warehouse"));
    if (!wh) throw notFound("Depozitul nu există");
    conds.push(sql`s.warehouse_id = ${wh._id}`);
  }
  if (query.get("sku")) conds.push(sql`lower(p.sku) = ${query.get("sku").toLowerCase()}`);
  const since = sinceDate(query);
  if (since) conds.push(sql`p.updated_at > ${since}`);
  const rows = await sql`
    select p.id as product_id, p.external_id as product_external_id, p.sku, p.barcode, p.name, p.unit,
           w.id as warehouse_id, w.code as warehouse_code, w.external_id as warehouse_external_id, s.quantity
    from stock s join products p on p.id = s.product_id join warehouses w on w.id = s.warehouse_id
    where ${where(conds)} order by lower(p.name), w.name`;
  const data = rows.map((r) => ({
    productId: r.productId,
    productExternalId: r.productExternalId || null,
    sku: r.sku || null,
    barcode: r.barcode || null,
    name: r.name,
    unit: r.unit,
    warehouseId: r.warehouseId,
    warehouseCode: r.warehouseCode || null,
    warehouseExternalId: r.warehouseExternalId || null,
    quantity: r.quantity,
  }));
  return { data, meta: { total: data.length } };
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
      const [cur] = await db()`select quantity from stock where product_id = ${p._id} and warehouse_id = ${w._id}`;
      results.push({ index: i, status: "ok", productId: p._id, sku: p.sku || null, warehouseId: w._id, change: r?.delta ?? 0, quantity: cur?.quantity ?? 0 });
    } catch (e) {
      results.push({ index: i, status: "error", error: e.message, sku: it.sku || null });
    }
  }
  return { data: summarize(results) };
};

/* ---------- Comenzi ---------- */
H.listOrders = async ({ query }) => {
  const sql = db();
  const conds = [];
  const since = sinceDate(query);
  if (since) conds.push(sql`o.updated_at > ${since}`);
  if (query.get("createdSince")) conds.push(sql`o.created_at > ${new Date(query.get("createdSince"))}`);
  let statuses = query.get("status") ? query.get("status").split(",").map((s) => s.trim()) : null;
  if (query.get("exported") === "0") {
    conds.push(sql`(o.export1c->>'exportedAt') is null`);
    if (!statuses) statuses = ["processing", "ready", "invoicing", "completed"];
  }
  if (query.get("exported") === "1") conds.push(sql`(o.export1c->>'exportedAt') is not null`);
  if (statuses) conds.push(sql`o.status in ${sql(statuses)}`);
  if (query.get("channel")) conds.push(sql`o.channel = ${query.get("channel")}`);
  const { page, limit, skip } = pageParams(query, 50);
  const s = await getSettings();
  const [rows, [{ n }]] = await Promise.all([
    sql`${orderSelect(sql)} where ${where(conds)} order by o.updated_at, o.id limit ${limit} offset ${skip}`,
    sql`select count(*)::int as n from orders o where ${where(conds)}`,
  ]);
  return { data: await ordersDTO(rows, s.currency), meta: listMeta(page, limit, n) };
};

H.getOrder = async ({ params }) => ({ data: await respondOrder(await findOrderId(params.id)) });

H.createOrder = async ({ body, key }) => {
  if (!body || typeof body !== "object") throw badRequest("Corp JSON invalid");
  const source = sourceOf(key);
  if (body.externalId) {
    const [dup] = await db()`select id from orders where external_source = ${source} and external_id = ${String(body.externalId)}`;
    if (dup) return { data: await respondOrder(dup._id), meta: { duplicate: true } };
  }
  if (!Array.isArray(body.items) || !body.items.length) throw badRequest("„items” este obligatoriu");
  const items = [];
  for (const [i, it] of body.items.entries()) {
    const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId, sku: it.sku, barcode: it.barcode });
    if (!p) throw badRequest(`Linia ${i + 1}: produs negăsit (${it.sku || it.productExternalId || it.productId || "?"})`);
    let warehouse;
    const wref = it.warehouse || it.warehouseId || it.warehouseCode || it.warehouseExternalId;
    if (wref) {
      const w = await resolveWarehouse(wref);
      if (!w) throw badRequest(`Linia ${i + 1}: depozit negăsit`);
      warehouse = w._id;
    }
    items.push({ product: p._id, warehouse, quantity: it.quantity, unitPrice: it.price ?? it.unitPrice, discount: it.discount });
  }
  let customer;
  if (body.customerId) customer = body.customerId;
  else if (body.customer && (body.customer.name || body.customer.externalId || body.customer.idno || body.customer.phone)) {
    const found = await findCustomerMatch(body.customer);
    customer = found?._id || (body.customer.name ? (await upsertCustomer({ source, ...body.customer })).customer._id : undefined);
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
  return { data: await respondOrder(order._id), status: 201 };
};

H.updateOrder = async ({ params, body, key }) => {
  const id = await findOrderId(params.id);
  const actor = await systemActor(actorName(key));
  if (body.status) {
    const st = normalizeStage(body.status);
    const [cur] = await db()`select status from orders where id = ${id}`;
    if (st === "cancelled" || st === "rejected") await cancelOrder(id, actor, body.reason || `Anulată din ${actorName(key)}`);
    else if (st === "processing" && ["new", "pending_approval"].includes(cur.status)) await approveOrder(id, actor);
    else await setOrderStage(id, st, actor);
  }
  if (body.export1c) await markExported1c(id, body.export1c, actor);
  if (body.invoice) await setInvoice(id, body.invoice, actor);
  if (body.delivery?.trackingNumber !== undefined) await updateDelivery(id, { trackingNumber: body.delivery.trackingNumber }, actor);
  if (body.externalId) {
    await db()`update orders set external_source = coalesce(external_source, ${sourceOf(key)}), external_id = ${String(body.externalId)}
               where id = ${id} and external_id is null`;
  }
  return { data: await respondOrder(id) };
};

H.exportOrder = async ({ params, body, key }) => {
  const id = await findOrderId(params.id);
  const actor = await systemActor(actorName(key));
  await markExported1c(id, { docNumber: body?.docNumber, docId: body?.docId }, actor);
  return { data: await respondOrder(id) };
};

H.addOrderPayment = async ({ params, body, key }) => {
  const id = await findOrderId(params.id);
  const actor = await systemActor(actorName(key));
  await addPayment(id, { amount: body?.amount, method: body?.method, date: body?.date, reference: body?.reference, note: body?.note || `Plată din ${actorName(key)}` }, actor);
  return { data: await respondOrder(id) };
};

/* ---------- Receptii ---------- */
H.listArrivals = async ({ query }) => {
  const sql = db();
  const since = sinceDate(query);
  const { page, limit, skip } = pageParams(query, 50);
  const rows = await sql`
    select *, count(*) over () as full_count from arrivals
    where ${since ? sql`created_at > ${since}` : sql`true`} order by created_at, id limit ${limit} offset ${skip}`;
  return {
    data: rows.map((d) => ({
      id: d._id,
      number: d.number || null,
      externalId: d.externalId || null,
      warehouseId: d.warehouseId,
      supplierId: d.supplierId || null,
      supplier: d.supplier || null,
      supplierInvoice: d.supplierInvoice || null,
      total: d.total || 0,
      items: docLines(d).map((l) => ({ productId: l.product, sku: l.sku || null, name: l.productName, quantity: l.quantity, unitCost: l.unitCost ?? null })),
      createdAt: d.createdAt,
    })),
    meta: listMeta(page, limit, rows[0]?.fullCount || 0),
  };
};

H.createArrival = async ({ body, key }) => {
  const w = await resolveWarehouse(body?.warehouse || body?.warehouseId || body?.warehouseCode || body?.warehouseExternalId);
  if (!w) throw badRequest("Depozit negăsit");
  let supplierId = isUuid(String(body.supplierId || "")) ? body.supplierId : undefined;
  if (!supplierId && (body.supplierExternalId || body.supplierIdno)) {
    const [s] = body.supplierExternalId
      ? await db()`select id from suppliers where external_id = ${String(body.supplierExternalId)} limit 1`
      : await db()`select id from suppliers where idno = ${String(body.supplierIdno)} limit 1`;
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
  return { data: { id: doc._id, number: doc.number, externalId: doc.externalId || null, total: doc.total }, meta: { duplicate }, status: duplicate ? 200 : 201 };
};

/* ---------- Registrul de stoc ---------- */
H.listMovements = async ({ query }) => {
  const sql = db();
  const conds = [];
  // cursor cu precizie de microsecunde (nu se pierd / nu se dubleaza miscari la granita paginilor)
  const sinceRaw = query.get("since") || query.get("updatedSince");
  if (sinceRaw) {
    sinceDate(query);
    conds.push(sql`m.created_at > ${sinceRaw}::timestamptz`);
  }
  if (query.get("type")) conds.push(sql`m.type in ${sql(query.get("type").split(","))}`);
  if (query.get("warehouse")) {
    const w = await resolveWarehouse(query.get("warehouse"));
    if (w) conds.push(sql`m.warehouse_id = ${w._id}`);
  }
  if (query.get("product")) {
    const p = await resolveProduct(query.get("product"));
    if (p) conds.push(sql`m.product_id = ${p._id}`);
  }
  const limit = Math.min(1000, Number(query.get("limit")) || 200);
  const rows = await sql`
    select m.*, to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_iso
    from stock_movements m where ${where(conds)} order by m.created_at, m.seq limit ${limit + 1}`;
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    data: page.map((m) => ({ ...movementDTO(m), createdAt: m.createdIso })),
    meta: { limit, hasMore, nextSince: page.length ? page[page.length - 1].createdIso : null },
  };
};

/* ---------- Fluxul de modificari (schimb incremental cu 1C) ---------- */
// GET /changes?after=CURSOR&limit=200&entities=product,customer -> tot ce s-a schimbat dupa cursor
H.changes = async ({ query, key, req }) => {
  const after = Math.max(0, Number(query.get("after") ?? query.get("cursor") ?? 0) || 0);
  const limit = Math.min(500, Math.max(1, Number(query.get("limit")) || 200));
  const entities = query.get("entities") ? query.get("entities").split(",").map((x) => x.trim()) : null;
  const bad = (entities || []).filter((e) => !ENTITIES.includes(e));
  if (bad.length) throw badRequest(`Entitate necunoscută: ${bad.join(", ")}. Valori permise: ${ENTITIES.join(", ")}`);
  return changesSince({ after, limit, entities, keyId: key?._id, includeOwn: query.get("includeOwn") === "1", req });
};

// GET /changes/cursor -> cursorul curent (de aici incepe schimbul incremental dupa incarcarea completa)
H.changesCursor = async () => ({ data: { cursor: await stableCursor() } });

// POST /changes/ack { cursor } -> 1C confirma ca a procesat tot pana la cursor (se vede in CRM)
H.changesAck = async ({ body, key }) => {
  const cursor = Math.max(0, Number(body?.cursor) || 0);
  if (key?._id) await db()`update api_keys set sync_seq = greatest(sync_seq, ${cursor}), sync_at = now() where id = ${key._id}`;
  return { data: { cursor, acknowledged: true } };
};

// GET /objects/:entity/:id -> starea completa a unui obiect (acelasi format ca in fluxul de modificari)
H.getObject = async ({ params, req }) => {
  if (!ENTITIES.includes(params.entity)) throw badRequest(`Entitate necunoscută. Valori permise: ${ENTITIES.join(", ")}`);
  const s = await getSettings();
  const { publicBaseUrl } = await import("./publicUrl");
  const map = await entityDTOs(params.entity, [params.id], { baseUrl: publicBaseUrl(s, req) });
  const obj = map.get(String(params.id));
  if (!obj) throw notFound("Obiectul nu există");
  return { data: obj };
};

/* ---------- Preturi individuale pe client ---------- */
async function customerRef(ref) {
  const sql = db();
  const [c] = await sql`
    select id from customers
    where ${isUuid(ref) ? sql`id = ${ref}` : sql`false`} or external_id = ${ref} or idno = ${ref} or number = ${ref} limit 1`;
  if (!c) throw notFound("Clientul nu există");
  return c._id;
}

H.getCustomerPrices = async ({ params }) => {
  const id = await customerRef(params.id);
  const map = await entityDTOs("customer", [id]);
  return { data: map.get(String(id))?.prices || [] };
};

// POST /customers/:id/prices { items: [{ productExternalId | sku | productId, price }], mode: "replace" | "merge" }
H.setCustomerPrices = async ({ params, body }) => {
  const id = await customerRef(params.id);
  const items = batchItems(body?.items ? body.items : body);
  const mode = body?.mode === "merge" ? "merge" : "replace";
  const rows = [];
  const results = [];
  for (const [i, it] of items.entries()) {
    const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId, sku: it.sku, barcode: it.barcode });
    const price = Number(it.price);
    if (!p) results.push({ index: i, status: "error", error: "Produs negăsit", sku: it.sku || null });
    else if (!(price >= 0)) results.push({ index: i, status: "error", error: "Preț invalid", sku: it.sku || null });
    else {
      rows.push({ customerId: id, productId: p._id, price: round2(price), position: i });
      results.push({ index: i, status: "ok", productId: p._id, price: round2(price) });
    }
  }
  await db().begin(async (t) => {
    if (mode === "replace") await t`delete from customer_prices where customer_id = ${id}`;
    for (const r of rows) {
      await t`insert into customer_prices ${t(r)}
              on conflict (customer_id, product_id) do update set price = excluded.price, position = excluded.position, updated_at = now()`;
    }
  });
  return { data: { customerId: id, mode, ...summarize(results) } };
};

/* ---------- Transferuri, casari, inventarieri ---------- */
async function listDocsV1(table, entity, query, extra) {
  const sql = db();
  const since = sinceDate(query);
  const { page, limit, skip } = pageParams(query, 50);
  const rows = await sql`
    select id, count(*) over () as full_count from ${sql(table)}
    where ${since ? sql`updated_at > ${since}` : sql`true`} ${extra || sql``}
    order by created_at, id limit ${limit} offset ${skip}`;
  const map = await entityDTOs(entity, rows.map((r) => r._id));
  return { data: rows.map((r) => map.get(String(r._id))).filter(Boolean), meta: listMeta(page, limit, rows[0]?.fullCount || 0) };
}

H.listTransfers = ({ query }) => listDocsV1("transfers", "transfer", query);
H.listWriteoffs = ({ query }) => listDocsV1("writeoffs", "writeoff", query);
H.listInventory = ({ query }) => listDocsV1("inventory_counts", "inventory", query, db()`and status = 'completed'`);

async function docLinesFrom(items) {
  const out = [];
  for (const [i, it] of (items || []).entries()) {
    const p = await resolveProduct({ productId: it.productId, externalId: it.productExternalId, sku: it.sku, barcode: it.barcode });
    if (!p) throw badRequest(`Linia ${i + 1}: produs negăsit (${it.sku || it.productExternalId || it.productId || "?"})`);
    out.push({ product: p._id, quantity: it.quantity });
  }
  if (!out.length) throw badRequest("„items” este obligatoriu");
  return out;
}

H.createTransfer = async ({ body, key }) => {
  const source = sourceOf(key);
  if (body?.externalId) {
    const [dup] = await db()`select id from transfers where source = ${source} and external_id = ${String(body.externalId)}`;
    if (dup) return { data: (await entityDTOs("transfer", [dup._id])).get(String(dup._id)), meta: { duplicate: true } };
  }
  const from = await resolveWarehouse(body?.fromWarehouse || body?.fromWarehouseId || body?.fromWarehouseCode || body?.fromWarehouseExternalId);
  const to = await resolveWarehouse(body?.toWarehouse || body?.toWarehouseId || body?.toWarehouseCode || body?.toWarehouseExternalId);
  if (!from || !to) throw badRequest("Depozit negăsit (fromWarehouse / toWarehouse)");
  const actor = { id: null, name: actorName(key), role: "admin", system: true };
  const doc = await createTransfer({ fromWarehouse: from._id, toWarehouse: to._id, items: await docLinesFrom(body.items), note: body.note || `Transfer din ${actorName(key)}`, externalId: body.externalId, source }, actor);
  return { data: (await entityDTOs("transfer", [doc._id])).get(String(doc._id)), status: 201 };
};

H.createWriteoff = async ({ body, key }) => {
  const source = sourceOf(key);
  if (body?.externalId) {
    const [dup] = await db()`select id from writeoffs where source = ${source} and external_id = ${String(body.externalId)}`;
    if (dup) return { data: (await entityDTOs("writeoff", [dup._id])).get(String(dup._id)), meta: { duplicate: true } };
  }
  const w = await resolveWarehouse(body?.warehouse || body?.warehouseId || body?.warehouseCode || body?.warehouseExternalId);
  if (!w) throw badRequest("Depozit negăsit");
  const actor = { id: null, name: actorName(key), role: "admin", system: true };
  const doc = await createWriteoff({ warehouse: w._id, reasonCode: body.reasonCode || "other", reason: body.reason, items: await docLinesFrom(body.items), externalId: body.externalId, source }, actor);
  return { data: (await entityDTOs("writeoff", [doc._id])).get(String(doc._id)), status: 201 };
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
  ["GET", "/changes", H.changes, "read"],
  ["GET", "/changes/cursor", H.changesCursor, "read"],
  ["POST", "/changes/ack", H.changesAck, "read"],
  ["GET", "/objects/:entity/:id", H.getObject, "read"],
  ["GET", "/customers/:id/prices", H.getCustomerPrices, "read"],
  ["POST", "/customers/:id/prices", H.setCustomerPrices, "write", true],
  ["GET", "/transfers", H.listTransfers, "read"],
  ["POST", "/transfers", H.createTransfer, "write", true],
  ["GET", "/writeoffs", H.listWriteoffs, "read"],
  ["POST", "/writeoffs", H.createWriteoff, "write", true],
  ["GET", "/inventory", H.listInventory, "read"],
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
