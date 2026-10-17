// Integrare directa cu site-ul luxstore.md (WooCommerce REST API v3) — fara Make / servicii intermediare.
import crypto from "node:crypto";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Warehouse from "@/models/Warehouse";
import { getSettings, getSettingsDoc, invalidateSettings } from "./settings";
import { createOrder, systemActor, cancelOrder, addPayment } from "./orderService";
import { upsertCustomer } from "./customers";
import { applyMovements } from "./stock";
import { escapeRegex, round2 } from "./api";
import { runAfter } from "./events";
import { logIntegration } from "./integrationLog";
import { isClosed } from "./orderStages";

const SITE_ACTOR = "Site luxstore.md";

export function wooConfigured(s) {
  return !!(s?.woo?.url && s.woo.consumerKey && s.woo.consumerSecret);
}

export function wooReady(s) {
  return !!(s?.woo?.enabled && wooConfigured(s));
}

function apiBase(s) {
  return s.woo.url.trim().replace(/\/+$/, "") + "/wp-json/wc/v3/";
}

export async function wooFetch(s, path, { method = "GET", query = {}, body } = {}) {
  const url = new URL(path, apiBase(s));
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const auth = Buffer.from(`${s.woo.consumerKey}:${s.woo.consumerSecret}`).toString("base64");
  const doFetch = (u, withHeader) =>
    fetch(u, {
      method,
      headers: {
        ...(withHeader ? { Authorization: `Basic ${auth}` } : {}),
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "LuxStore-CRM/2.0",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });

  let res = await doFetch(url, true);
  // Unele servere elimina antetul Authorization — WooCommerce accepta si cheile in query (doar HTTPS)
  if (res.status === 401 && url.protocol === "https:") {
    const u2 = new URL(url);
    u2.searchParams.set("consumer_key", s.woo.consumerKey);
    u2.searchParams.set("consumer_secret", s.woo.consumerSecret);
    res = await doFetch(u2, false);
  }
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* raspuns non-JSON */
  }
  if (!res.ok) {
    const msg = json?.message || (text && text.length < 200 ? text : "") || res.statusText;
    throw new Error(`WooCommerce ${res.status}: ${msg}`);
  }
  if (json === null) throw new Error("Site-ul nu a returnat JSON. Verificați adresa (URL) și permalink-urile WordPress.");
  return {
    data: json,
    total: Number(res.headers.get("x-wp-total") || 0),
    pages: Number(res.headers.get("x-wp-totalpages") || 0),
  };
}

export function verifyWooSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const stripHtml = (h) =>
  String(h || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function siteWarehouse(s) {
  if (s.woo?.warehouse) return s.woo.warehouse;
  if (s.defaultWarehouse) return s.defaultWarehouse;
  const w = await Warehouse.findOne({ active: { $ne: false } }).sort({ isDefault: -1, createdAt: 1 }).lean();
  return w?._id;
}

async function findProductForLine(li) {
  const wooId = li.variation_id || li.product_id;
  if (wooId) {
    const p = await Product.findOne({ wooId }).select("_id").lean();
    if (p) return p._id;
  }
  if (li.sku) {
    const p = await Product.findOne({ sku: { $regex: `^${escapeRegex(li.sku.trim())}$`, $options: "i" } });
    if (p) {
      if (wooId && !p.wooId) {
        p.wooId = wooId;
        if (li.variation_id) p.wooParentId = li.product_id;
        await p.save();
      }
      return p._id;
    }
  }
  // Produs necunoscut in CRM: il cream automat (fara stoc), ca sa nu pierdem comanda
  const unitPrice = li.quantity ? (Number(li.total) + Number(li.total_tax || 0)) / li.quantity : Number(li.price) || 0;
  const created = await Product.create({
    name: li.name,
    sku: li.sku || undefined,
    price: round2(unitPrice),
    wooId: wooId || undefined,
    wooParentId: li.variation_id ? li.product_id : undefined,
    source: "woo",
    description: "Creat automat la importul unei comenzi de pe site. Verificați datele produsului.",
  });
  return created._id;
}

function mapDelivery(wo, s) {
  const line = wo.shipping_lines?.[0];
  const cost = round2(Number(wo.shipping_total || 0) + Number(wo.shipping_tax || 0));
  const title = `${line?.method_title || ""} ${line?.method_id || ""}`.toLowerCase();
  let method = "courier_chisinau";
  if (!line || /local_pickup|preluare|ridicare|pickup|magazin/.test(title)) method = "pickup";
  else if (/moldova|tara|țar/.test(title)) method = "courier_moldova";
  else if (/chi[sș]in/.test(title)) method = "courier_chisinau";
  else {
    const byCost = (s.deliveryMethods || []).find((m) => m.cost === cost && m.key !== "pickup");
    if (byCost) method = byCost.key;
  }
  const sh = wo.shipping || {};
  const b = wo.billing || {};
  return {
    method,
    label: line?.method_title,
    cost,
    city: sh.city || b.city || undefined,
    address: [sh.address_1 || b.address_1, sh.address_2 || b.address_2].filter(Boolean).join(", ") || undefined,
    recipient: [sh.first_name, sh.last_name].filter(Boolean).join(" ") || undefined,
    phone: sh.phone || b.phone || undefined,
  };
}

function mapPaymentMethod(pm) {
  if (pm === "cod") return "cod";
  if (pm === "bacs") return "transfer";
  if (pm === "cheque") return "cash";
  return pm ? "online" : "cash";
}

// Actualizeaza o comanda deja importata cand se schimba pe site (anulare / plata)
async function syncExisting(order, wo) {
  const actor = await systemActor(SITE_ACTOR);
  if (["cancelled", "refunded", "failed"].includes(wo.status) && !isClosed(order.status)) {
    await cancelOrder(order, actor, `Anulată pe site (status: ${wo.status})`);
    return "cancelled";
  }
  if (wo.date_paid && wo.payment_method !== "cod" && order.paymentStatus !== "paid" && !isClosed(order.status)) {
    const remaining = round2(order.total - (order.paidAmount || 0));
    if (remaining > 0) {
      await addPayment(order, { amount: remaining, method: "online", reference: wo.transaction_id, note: "Plată confirmată pe site" }, actor);
      return "paid";
    }
  }
  return "unchanged";
}

/** Importa (idempotent) o comanda WooCommerce in CRM. */
export async function importWooOrder(wo, s) {
  s = s || (await getSettings());
  const externalId = String(wo.id);
  const existing = await Order.findOne({ externalSource: "woo", externalId });
  if (existing) return { order: existing, created: false, result: await syncExisting(existing, wo) };
  if (["checkout-draft", "trash", "failed", "cancelled", "refunded"].includes(wo.status)) {
    return { order: null, created: false, result: "skipped" };
  }

  const warehouse = await siteWarehouse(s);
  if (!warehouse) throw new Error("Nu există niciun depozit în CRM pentru comenzile de pe site");

  const b = wo.billing || {};
  const person = [b.first_name, b.last_name].filter(Boolean).join(" ").trim();
  const { customer } = await upsertCustomer({
    type: b.company ? "company" : "individual",
    name: b.company || person || `Client site #${wo.number || wo.id}`,
    contactPerson: b.company ? person : undefined,
    phone: b.phone,
    email: b.email,
    city: wo.shipping?.city || b.city,
    address: [wo.shipping?.address_1 || b.address_1, wo.shipping?.address_2 || b.address_2].filter(Boolean).join(", "),
    source: "site",
    segment: "retail",
    wooCustomerId: wo.customer_id || undefined,
  });

  const items = [];
  for (const li of wo.line_items || []) {
    const qty = Number(li.quantity) || 0;
    if (qty <= 0) continue;
    items.push({
      product: await findProductForLine(li),
      warehouse,
      quantity: qty,
      unitPrice: round2((Number(li.total) + Number(li.total_tax || 0)) / qty),
      discount: 0,
    });
  }
  if (!items.length) return { order: null, created: false, result: "skipped" };

  const paymentMethod = mapPaymentMethod(wo.payment_method);
  const fees = (wo.fee_lines || []).reduce((t, f) => t + Number(f.total || 0), 0);
  const noteParts = [wo.customer_note, fees ? `Taxe suplimentare pe site: ${fees.toFixed(2)}` : null, wo.payment_method_title ? `Plată: ${wo.payment_method_title}` : null];

  const actor = await systemActor(SITE_ACTOR);
  try {
    const order = await createOrder(
      {
        items,
        customer: customer._id,
        customerName: person || b.company || customer.name,
        customerPhone: b.phone,
        customerEmail: b.email,
        channel: "site",
        delivery: mapDelivery(wo, s),
        paymentMethod,
        payments:
          wo.date_paid && wo.payment_method !== "cod"
            ? [{ amount: Number(wo.total), method: "online", reference: wo.transaction_id, note: "Achitat pe site" }]
            : [],
        note: noteParts.filter(Boolean).join(" · ") || undefined,
        externalSource: "woo",
        externalId,
        externalNumber: String(wo.number || wo.id),
      },
      actor,
      { initialStatus: "new", incoming: "site", allowPriceEdit: true }
    );
    return { order, created: true, result: "created" };
  } catch (e) {
    if (e?.code === 11000) {
      const again = await Order.findOne({ externalSource: "woo", externalId });
      if (again) return { order: again, created: false, result: "unchanged" };
    }
    throw e;
  }
}

/** Trage comenzile din ultimele N zile (plasa de siguranta daca un webhook s-a pierdut). */
export async function syncWooOrders({ days = 3 } = {}) {
  const s = await getSettings({ fresh: true });
  if (!wooConfigured(s)) throw new Error("Integrarea cu site-ul nu este configurată");
  const started = Date.now();
  const after = new Date(Date.now() - days * 86400000).toISOString();
  const stats = { created: 0, updated: 0, skipped: 0, errors: 0, messages: [] };
  for (let page = 1; page <= 20; page++) {
    const { data, pages } = await wooFetch(s, "orders", {
      query: { after, per_page: 50, page, orderby: "date", order: "asc" },
    });
    for (const wo of data) {
      try {
        const r = await importWooOrder(wo, s);
        if (r.result === "created") stats.created++;
        else if (r.result === "skipped") stats.skipped++;
        else stats.updated++;
      } catch (e) {
        stats.errors++;
        stats.messages.push(`#${wo.number || wo.id}: ${e.message}`);
      }
    }
    if (!pages || page >= pages) break;
  }
  const doc = await getSettingsDoc();
  doc.woo.lastOrderSyncAt = new Date();
  await doc.save();
  invalidateSettings();
  await logIntegration({
    source: "woo",
    direction: "in",
    action: "orders.sync",
    status: stats.errors ? "error" : "ok",
    count: stats.created,
    message: `Noi: ${stats.created}, actualizate: ${stats.updated}, ignorate: ${stats.skipped}, erori: ${stats.errors}${stats.messages.length ? " — " + stats.messages.slice(0, 3).join("; ") : ""}`,
    durationMs: Date.now() - started,
  });
  return stats;
}

async function ensureCategory(wooCat) {
  if (!wooCat) return undefined;
  let c = await Category.findOne({ $or: [{ wooId: wooCat.id }, { name: wooCat.name }] });
  if (!c) c = await Category.create({ name: stripHtml(wooCat.name), slug: wooCat.slug, wooId: wooCat.id });
  else if (!c.wooId) {
    c.wooId = wooCat.id;
    await c.save();
  }
  return c._id;
}

/** Importa catalogul de pe site: creeaza produsele lipsa si le leaga pe cele existente (dupa SKU). */
export async function importWooProducts({ importStock = false, warehouse } = {}) {
  const s = await getSettings({ fresh: true });
  if (!wooConfigured(s)) throw new Error("Integrarea cu site-ul nu este configurată");
  const started = Date.now();
  const stats = { created: 0, linked: 0, skipped: 0, errors: 0 };
  const wh = warehouse || (await siteWarehouse(s));

  const upsert = async (item, parent) => {
    const wooId = item.id;
    const name = parent
      ? `${stripHtml(parent.name)} — ${(item.attributes || []).map((a) => a.option).join(", ")}`
      : stripHtml(item.name);
    const sku = (item.sku || "").trim() || undefined;
    let p = await Product.findOne({ wooId });
    if (!p && sku) p = await Product.findOne({ sku: { $regex: `^${escapeRegex(sku)}$`, $options: "i" } });
    const photo = item.image?.src || item.images?.[0]?.src || parent?.images?.[0]?.src;
    const category = await ensureCategory((parent || item).categories?.[0]);
    if (p) {
      p.wooId = wooId;
      if (parent) p.wooParentId = parent.id;
      if (!p.photo && photo) p.photo = photo;
      if (!p.category && category) p.category = category;
      if (!p.description) p.description = stripHtml((parent || item).short_description || (parent || item).description).slice(0, 2000) || undefined;
      await p.save();
      stats.linked++;
      return;
    }
    const created = await Product.create({
      name,
      sku,
      price: round2(Number(item.regular_price || item.price) || 0),
      description: stripHtml((parent || item).short_description || (parent || item).description).slice(0, 2000) || undefined,
      photo,
      category,
      wooId,
      wooParentId: parent?.id,
      active: (parent || item).status !== "draft",
      source: "woo",
    });
    stats.created++;
    const q = Number(item.stock_quantity);
    if (importStock && wh && q > 0) {
      await applyMovements([{ product: created._id, warehouse: wh, set: q, type: "initial" }], {
        refType: "Product",
        refId: created._id,
        user: { name: SITE_ACTOR },
        note: "Stoc inițial preluat de pe site",
        silent: true,
      });
    }
  };

  for (let page = 1; page <= 30; page++) {
    const { data, pages } = await wooFetch(s, "products", { query: { per_page: 100, page, status: "any" } });
    for (const prod of data) {
      try {
        if (prod.type === "variable") {
          const { data: vars } = await wooFetch(s, `products/${prod.id}/variations`, { query: { per_page: 100 } });
          for (const v of vars) await upsert(v, prod);
        } else {
          await upsert(prod);
        }
      } catch {
        stats.errors++;
      }
    }
    if (!pages || page >= pages) break;
  }
  const doc = await getSettingsDoc();
  doc.woo.lastProductImportAt = new Date();
  await doc.save();
  invalidateSettings();
  await logIntegration({
    source: "woo",
    direction: "in",
    action: "products.import",
    status: stats.errors ? "error" : "ok",
    count: stats.created + stats.linked,
    message: `Create: ${stats.created}, legate: ${stats.linked}, erori: ${stats.errors}`,
    durationMs: Date.now() - started,
  });
  return stats;
}

/** Publica stocul pe site (suma depozitelor marcate „sincronizat cu site-ul”). */
export async function pushStockToWoo(productIds) {
  const s = await getSettings();
  if (!wooReady(s)) return { updated: 0 };
  const started = Date.now();
  const warehouses = await Warehouse.find({ syncToSite: { $ne: false }, active: { $ne: false } }).select("_id").lean();
  const allowed = new Set(warehouses.map((w) => String(w._id)));
  const filter = { wooId: { $exists: true, $ne: null } };
  if (productIds?.length) filter._id = { $in: productIds };
  const products = await Product.find(filter).select("wooId wooParentId stock").lean();

  const simple = [];
  const variations = new Map();
  for (const p of products) {
    const qty = Math.max(
      0,
      Math.floor((p.stock || []).filter((x) => allowed.has(String(x.warehouse))).reduce((t, x) => t + (x.quantity || 0), 0))
    );
    const upd = { id: p.wooId, manage_stock: true, stock_quantity: qty };
    if (p.wooParentId) {
      if (!variations.has(p.wooParentId)) variations.set(p.wooParentId, []);
      variations.get(p.wooParentId).push(upd);
    } else simple.push(upd);
  }

  let updated = 0;
  let error = null;
  try {
    for (let i = 0; i < simple.length; i += 100) {
      await wooFetch(s, "products/batch", { method: "POST", body: { update: simple.slice(i, i + 100) } });
      updated += Math.min(100, simple.length - i);
    }
    for (const [parent, list] of variations) {
      await wooFetch(s, `products/${parent}/variations/batch`, { method: "POST", body: { update: list } });
      updated += list.length;
    }
  } catch (e) {
    error = e.message;
  }
  if (!productIds?.length || error) {
    await logIntegration({
      source: "woo",
      direction: "out",
      action: "stock.push",
      status: error ? "error" : "ok",
      count: updated,
      message: error || `Stoc actualizat pe site pentru ${updated} produse`,
      durationMs: Date.now() - started,
    });
  }
  if (!productIds?.length) {
    const doc = await getSettingsDoc();
    doc.woo.lastStockPushAt = new Date();
    await doc.save();
    invalidateSettings();
  }
  if (error) throw new Error(error);
  return { updated };
}

export function queueWooStockPush(productIds) {
  runAfter(() => pushStockToWoo(productIds).catch(() => {}));
}

const WOO_STATUS = { processing: "processing", ready: "processing", invoicing: "processing", completed: "completed", cancelled: "cancelled", rejected: "cancelled" };

export function queueWooOrderStatus(order) {
  runAfter(async () => {
    const s = await getSettings();
    if (!wooReady(s) || !s.woo.pushOrderStatus || order.externalSource !== "woo" || !order.externalId) return;
    const status = WOO_STATUS[order.status];
    if (!status) return;
    try {
      await wooFetch(s, `orders/${order.externalId}`, { method: "PUT", body: { status } });
    } catch (e) {
      await logIntegration({ source: "woo", direction: "out", action: "order.status", status: "error", ref: order.number, message: e.message });
    }
  });
}

/** Test conexiune: numar de produse si comenzi vizibile pe site. */
export async function testWoo(s) {
  const [p, o] = await Promise.all([
    wooFetch(s, "products", { query: { per_page: 1 } }),
    wooFetch(s, "orders", { query: { per_page: 1 } }),
  ]);
  return { products: p.total, orders: o.total };
}

/** Creeaza automat pe site webhook-urile pentru comenzi (order.created / order.updated). */
export async function ensureWooWebhooks(s, deliveryUrl) {
  const { data: hooks } = await wooFetch(s, "webhooks", { query: { per_page: 100 } });
  const result = [];
  for (const topic of ["order.created", "order.updated"]) {
    const found = hooks.find((h) => h.topic === topic && h.delivery_url === deliveryUrl);
    if (found && found.status === "active") {
      result.push({ topic, id: found.id, status: "exists" });
      continue;
    }
    if (found) {
      await wooFetch(s, `webhooks/${found.id}`, { method: "PUT", body: { status: "active", secret: s.woo.webhookSecret } });
      result.push({ topic, id: found.id, status: "reactivated" });
      continue;
    }
    const { data } = await wooFetch(s, "webhooks", {
      method: "POST",
      body: {
        name: `CRM Lux Store — ${topic}`,
        topic,
        delivery_url: deliveryUrl,
        secret: s.woo.webhookSecret,
        status: "active",
      },
    });
    result.push({ topic, id: data.id, status: "created" });
  }
  return result;
}
