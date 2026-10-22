// Integrare directa cu site-ul luxstore.md (WooCommerce REST API v3) — fara Make / servicii intermediare.
import crypto from "node:crypto";
import { db, isUuid } from "./db";
import { getSettings, updateSettings } from "./settings";
import { createOrder, systemActor, cancelOrder, addPayment } from "./orderService";
import { upsertCustomer } from "./customers";
import { applyMovements } from "./stock";
import { round2 } from "./api";
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
  if (isUuid(String(s.woo?.warehouse || ""))) return s.woo.warehouse;
  if (isUuid(String(s.defaultWarehouse || ""))) return s.defaultWarehouse;
  const [w] = await db()`select id from warehouses where active order by is_default desc, created_at limit 1`;
  return w?._id;
}

async function findProductForLine(li) {
  const sql = db();
  const wooId = li.variation_id || li.product_id;
  if (wooId) {
    const [p] = await sql`select id from products where woo_id = ${wooId} limit 1`;
    if (p) return p._id;
  }
  if (li.sku) {
    const [p] = await sql`select id, woo_id from products where lower(sku) = ${li.sku.trim().toLowerCase()} limit 1`;
    if (p) {
      if (wooId && !p.wooId) {
        await sql`update products set woo_id = ${wooId}, woo_parent_id = ${li.variation_id ? li.product_id : null} where id = ${p._id}`;
      }
      return p._id;
    }
  }
  // Produs necunoscut in CRM: il cream automat (fara stoc), ca sa nu pierdem comanda
  const unitPrice = li.quantity ? (Number(li.total) + Number(li.total_tax || 0)) / li.quantity : Number(li.price) || 0;
  const [created] = await sql`insert into products ${sql({
    name: li.name,
    sku: li.sku || null,
    price: round2(unitPrice),
    wooId: wooId || null,
    wooParentId: li.variation_id ? li.product_id : null,
    source: "woo",
    description: "Creat automat la importul unei comenzi de pe site. Verificați datele produsului.",
  })} returning id`;
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
    await cancelOrder(order._id, actor, `Anulată pe site (status: ${wo.status})`);
    return "cancelled";
  }
  if (wo.date_paid && wo.payment_method !== "cod" && order.paymentStatus !== "paid" && !isClosed(order.status)) {
    const remaining = round2(order.total - (order.paidAmount || 0));
    if (remaining > 0) {
      await addPayment(order._id, { amount: remaining, method: "online", reference: wo.transaction_id, note: "Plată confirmată pe site" }, actor);
      return "paid";
    }
  }
  return "unchanged";
}

/** Importa (idempotent) o comanda WooCommerce in CRM. */
export async function importWooOrder(wo, s) {
  s = s || (await getSettings());
  const externalId = String(wo.id);
  const [existing] = await db()`select * from orders where external_source = 'woo' and external_id = ${externalId}`;
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
    if (e?.code === "23505") {
      const [again] = await db()`select * from orders where external_source = 'woo' and external_id = ${externalId}`;
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
  await updateSettings({ woo: { lastOrderSyncAt: new Date().toISOString() } });
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
  if (!wooCat) return null;
  const sql = db();
  const name = stripHtml(wooCat.name);
  const [c] = await sql`select id, woo_id from categories where woo_id = ${wooCat.id} or lower(name) = ${name.toLowerCase()} limit 1`;
  if (c) {
    if (!c.wooId) await sql`update categories set woo_id = ${wooCat.id} where id = ${c._id}`;
    return c._id;
  }
  const [n] = await sql`insert into categories ${sql({ name, slug: wooCat.slug || null, wooId: wooCat.id })} returning id`;
  return n._id;
}

/** Importa catalogul de pe site: creeaza produsele lipsa si le leaga pe cele existente (dupa SKU). */
export async function importWooProducts({ importStock = false, warehouse } = {}) {
  const s = await getSettings({ fresh: true });
  if (!wooConfigured(s)) throw new Error("Integrarea cu site-ul nu este configurată");
  const started = Date.now();
  const stats = { created: 0, linked: 0, skipped: 0, errors: 0 };
  const wh = warehouse || (await siteWarehouse(s));

  const sql = db();
  const upsert = async (item, parent) => {
    const wooId = item.id;
    const name = parent
      ? `${stripHtml(parent.name)} — ${(item.attributes || []).map((a) => a.option).join(", ")}`
      : stripHtml(item.name);
    const sku = (item.sku || "").trim() || null;
    let [p] = await sql`select id, photo, category_id, description from products where woo_id = ${wooId} limit 1`;
    if (!p && sku) [p] = await sql`select id, photo, category_id, description from products where lower(sku) = ${sku.toLowerCase()} limit 1`;
    const gallery = (item.image ? [item.image] : item.images?.length ? item.images : parent?.images || []).map((i) => i.src).filter(Boolean).slice(0, 10);
    const photo = gallery[0] || null;
    const category = await ensureCategory((parent || item).categories?.[0]);
    const description = stripHtml((parent || item).short_description || (parent || item).description).slice(0, 2000) || null;
    if (p) {
      await sql`update products set woo_id = ${wooId}, woo_parent_id = ${parent?.id || null},
                  photo = coalesce(nullif(photo, ''), ${photo}),
                  photos = case when photos = '[]'::jsonb then ${sql.json(gallery)} else photos end,
                  category_id = coalesce(category_id, ${category}),
                  description = coalesce(nullif(description, ''), ${description})
                where id = ${p._id}`;
      stats.linked++;
      return;
    }
    const [created] = await sql`insert into products ${sql({
      name,
      sku,
      price: round2(Number(item.regular_price || item.price) || 0),
      description,
      photo,
      photos: sql.json(gallery),
      categoryId: category,
      wooId,
      wooParentId: parent?.id || null,
      active: (parent || item).status !== "draft",
      source: "woo",
    })} returning id`;
    stats.created++;
    const q = Number(item.stock_quantity);
    if (importStock && wh && q > 0) {
      await applyMovements([{ product: created._id, warehouse: wh, set: q, type: "initial" }], {
        refType: "Product",
        refId: created._id,
        user: { name: SITE_ACTOR, system: true },
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
  await updateSettings({ woo: { lastProductImportAt: new Date().toISOString() } });
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
  const sql = db();
  const ids = (productIds || []).map(String).filter(isUuid);
  // cantitatea publicata = suma depozitelor active marcate „stoc pe site”
  const products = await sql`
    select p.id, p.woo_id, p.woo_parent_id,
           coalesce((select sum(s.quantity) from stock s join warehouses w on w.id = s.warehouse_id
                     where s.product_id = p.id and w.sync_to_site and w.active), 0) as qty
    from products p where p.woo_id is not null ${ids.length ? sql`and p.id in ${sql(ids)}` : sql``}`;
  const simple = [];
  const variations = new Map();
  for (const p of products) {
    const qty = Math.max(0, Math.floor(p.qty || 0));
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
  if (!productIds?.length) await updateSettings({ woo: { lastStockPushAt: new Date().toISOString() } });
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

/* ---------------- Publicare manuala a produselor pe site ---------------- */

// Link public, semnat, catre fotografia produsului (WooCommerce o descarca o singura data)
export function signedPhotoUrl(base, productId, version) {
  const sig = crypto.createHmac("sha256", process.env.JWT_SECRET || "lux").update(`${productId}:${version}`).digest("hex").slice(0, 32);
  return `${base}/api/public/product-photo/${productId}?v=${encodeURIComponent(version)}&s=${sig}`;
}

export function verifyPhotoSignature(productId, version, sig) {
  const expected = crypto.createHmac("sha256", process.env.JWT_SECRET || "lux").update(`${productId}:${version}`).digest("hex").slice(0, 32);
  const a = Buffer.from(String(sig || ""));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const photoVersion = (photo) => crypto.createHash("sha1").update(String(photo || "")).digest("hex").slice(0, 16);

async function wooCategoryId(s, categoryId) {
  if (!isUuid(String(categoryId || ""))) return null;
  const sql = db();
  const [c] = await sql`select id, name, woo_id from categories where id = ${categoryId}`;
  if (!c) return null;
  if (c.wooId) return c.wooId;
  const { data: found } = await wooFetch(s, "products/categories", { query: { search: c.name, per_page: 50 } });
  let hit = (found || []).find((x) => stripHtml(x.name).toLowerCase() === c.name.toLowerCase());
  if (!hit) ({ data: hit } = await wooFetch(s, "products/categories", { method: "POST", body: { name: c.name } }));
  await sql`update categories set woo_id = ${hit.id} where id = ${c._id}`;
  return hit.id;
}

const htmlDescription = (t) =>
  String(t || "")
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
    .join("");

/**
 * Publica pe site produsele alese (sau toate produsele active nepublicate).
 * Produsele noi se creeaza pe site; cele deja legate se actualizeaza (nume, pret, descriere, categorie, stoc).
 * Nu ruleaza automat — doar la apasarea butonului.
 */
export async function publishProductsToWoo({ ids, baseUrl } = {}) {
  const s = await getSettings({ fresh: true });
  if (!wooConfigured(s)) throw new Error("Site-ul nu este conectat. Administratorul principal trebuie să completeze cheile WooCommerce în Integrări → Site.");
  const sql = db();
  const list = (ids || []).map(String).filter(isUuid);
  const products = await sql`
    select p.id, p.name, p.sku, p.description, p.price, p.category_id, p.photo, p.photos, p.woo_id, p.woo_parent_id, p.tg_photo,
           coalesce((select sum(st.quantity) from stock st join warehouses w on w.id = st.warehouse_id
                     where st.product_id = p.id and w.sync_to_site and w.active), 0) as qty
    from products p
    where p.active and ${list.length ? sql`p.id in ${sql(list)}` : sql`p.woo_id is null`}
    order by p.created_at
    limit 200`;
  const started = Date.now();
  const results = [];
  for (const p of products) {
    try {
      if (p.wooParentId) throw new Error("Variantă de produs — se editează direct pe site");
      const cat = await wooCategoryId(s, p.categoryId);
      const body = {
        name: p.name,
        status: "publish",
        regular_price: (Number(p.price) || 0).toFixed(2),
        description: htmlDescription(p.description),
        manage_stock: true,
        stock_quantity: Math.max(0, Math.floor(p.qty || 0)),
        ...(p.sku ? { sku: p.sku } : {}),
        ...(cat ? { categories: [{ id: cat }] } : {}),
      };
      // toata galeria (prima = imaginea principala pe site)
      const gallery = (p.photos?.length ? p.photos : p.photo ? [p.photo] : []).slice(0, 10);
      const withImage = gallery.length && baseUrl && !/localhost|127\.0\.0\.1/.test(baseUrl)
        ? { images: gallery.map((ph) => ({ src: /^https?:\/\//.test(ph) ? ph : signedPhotoUrl(baseUrl, p._id, photoVersion(ph)) })) }
        : {};
      let wooId = p.wooId;
      let created = false;
      if (wooId) {
        await wooFetch(s, `products/${wooId}`, { method: "PUT", body });
      } else {
        try {
          const { data } = await wooFetch(s, "products", { method: "POST", body: { ...body, type: "simple", ...withImage } });
          wooId = data.id;
          created = true;
        } catch (e) {
          // SKU existent deja pe site -> legam produsul existent si il actualizam
          if (!p.sku || !/sku/i.test(e.message)) throw e;
          const { data: found } = await wooFetch(s, "products", { query: { sku: p.sku } });
          if (!found?.[0]) throw e;
          wooId = found[0].id;
          await wooFetch(s, `products/${wooId}`, { method: "PUT", body });
        }
        await sql`update products set woo_id = ${wooId} where id = ${p._id}`;
      }
      results.push({ product: p._id, name: p.name, ok: true, wooId, created });
    } catch (e) {
      results.push({ product: p._id, name: p.name, ok: false, error: e.message });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok);
  await logIntegration({
    source: "woo",
    direction: "out",
    action: "products.publish",
    status: errors.length ? "error" : "ok",
    count: okCount,
    message: `Publicate pe site: ${okCount}${errors.length ? ` · erori: ${errors.length} (${errors[0].name}: ${errors[0].error})` : ""}`,
    durationMs: Date.now() - started,
  });
  return { published: okCount, created: results.filter((r) => r.created).length, errors: errors.length, results };
}

/** Cate produse active nu sunt inca pe site */
export async function unpublishedCount() {
  const [r] = await db()`select count(*)::int as n from products where active and woo_id is null`;
  return r.n;
}
