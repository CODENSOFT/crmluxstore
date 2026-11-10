// Integrarea cu scanerele de coduri de bare / terminalele de colectare date (TSD).
// Scanerul (sau aplicatia lui) trimite o „sesiune de scanare” = lista de coduri + cantitati pentru
// o operatiune. CRM-ul recunoaste codurile, iar sesiunea se aplica -> receptie, casare, transfer,
// inventariere sau verificarea pregatirii unei comenzi. Aplicarea poate fi automata (apply: true)
// sau dupa verificare in CRM (Integrari -> Scanere), unde se leaga si codurile necunoscute.
import { db, idOf, isUuid } from "./db";
import { badRequest, notFound, round4 } from "./api";
import { resolveWarehouse } from "./products";
import { createArrival, createTransfer, createWriteoff, createInventory, updateInventory } from "./stockDocs";
import { loadOrder, setOrderStage } from "./orderService";
import { logAudit } from "./audit";
import { runAfter } from "./events";
import { WRITEOFF_REASONS } from "./constants";
import { nextNumber } from "./counters";
import { activeDiscount, discountedPrice } from "./discount";

export const SCAN_OPERATIONS = [
  { key: "arrival", label: "Recepție marfă", needs: ["warehouse"] },
  { key: "writeoff", label: "Casare", needs: ["warehouse"] },
  { key: "transfer", label: "Transfer între depozite", needs: ["warehouse", "toWarehouse"] },
  { key: "inventory", label: "Inventariere (numărare)", needs: ["warehouse"] },
  { key: "picking", label: "Pregătire comandă (verificare)", needs: ["order"] },
  { key: "list", label: "Listă de coduri (fără efect asupra stocului)", needs: [] },
];
// Drepturile necesare pentru a aplica o operatiune din scanare (angajatii; adminul are tot)
export const SCAN_PERMS = { writeoff: "stock.writeoff", transfer: "stock.transfer", inventory: "stock.inventory" };

export const SCAN_OPERATION_KEYS = SCAN_OPERATIONS.map((o) => o.key);
export const scanOperationLabel = (k) => SCAN_OPERATIONS.find((o) => o.key === k)?.label || k;

export const SCAN_STATUS = {
  pending: { label: "De verificat", tone: "warn" },
  applied: { label: "Aplicată", tone: "ok" },
  rejected: { label: "Respinsă", tone: "neutral" },
  error: { label: "Eroare", tone: "bad" },
};

const MAX_LINES = 5000;

/* ---------------- Recunoasterea codurilor ---------------- */

// Variante ale aceluiasi cod: spatii, UPC-A (12 cifre) <-> EAN-13 cu 0 in fata, GTIN-14
function codeVariants(raw) {
  const c = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!c) return [];
  const v = new Set([c]);
  if (/^\d+$/.test(c)) {
    if (c.length === 12) v.add("0" + c);
    if (c.length === 13 && c.startsWith("0")) v.add(c.slice(1));
    if (c.length === 14 && c.startsWith("0")) {
      v.add(c.slice(1));
      if (c.startsWith("00")) v.add(c.slice(2));
    }
  }
  return [...v];
}

/**
 * Gaseste produsele pentru o lista de coduri, intr-un numar mic de interogari.
 * Ordinea: coduri suplimentare (cu multiplicator) -> cod de bare principal -> SKU -> cod 1C.
 * Intoarce Map(cod -> { product, multiplier, via }).
 */
export async function resolveCodes(codes, q = db()) {
  const out = new Map();
  const uniq = [...new Set(codes.map((c) => String(c ?? "").trim()).filter(Boolean))];
  if (!uniq.length) return out;
  const variantsOf = new Map(uniq.map((c) => [c, codeVariants(c)]));
  const all = [...new Set([...variantsOf.values()].flat())];
  const lower = all.map((c) => c.toLowerCase());

  const cols = q`p.id, p.name, p.sku, p.barcode, p.unit, p.price, p.wholesale_price, p.cost_price, p.active, p.external_id,
                 p.discount, p.discount_from, p.discount_to`;
  const [extra, byBarcode, bySku, byExt] = await Promise.all([
    q`select b.code, b.multiplier, ${cols} from product_barcodes b join products p on p.id = b.product_id where b.code in ${q(all)}`,
    q`select ${cols} from products p where p.barcode in ${q(all)}`,
    q`select ${cols} from products p where lower(p.sku) in ${q(lower)}`,
    q`select ${cols} from products p where p.external_id in ${q(all)}`,
  ]);
  const strip = ({ code, multiplier, ...p }) => p;
  const mExtra = new Map(extra.map((r) => [r.code, r]));
  const mBarcode = new Map(byBarcode.map((r) => [r.barcode, r]));
  const mSku = new Map(bySku.map((r) => [String(r.sku).toLowerCase(), r]));
  const mExt = new Map(byExt.map((r) => [r.externalId, r]));

  for (const [code, variants] of variantsOf) {
    let hit = null;
    for (const v of variants) {
      if (mExtra.has(v)) {
        const r = mExtra.get(v);
        hit = { product: strip(r), multiplier: Number(r.multiplier) || 1, via: "extra" };
        break;
      }
    }
    if (!hit) for (const v of variants) if (mBarcode.has(v)) { hit = { product: mBarcode.get(v), multiplier: 1, via: "barcode" }; break; }
    if (!hit) for (const v of variants) if (mSku.has(v.toLowerCase())) { hit = { product: mSku.get(v.toLowerCase()), multiplier: 1, via: "sku" }; break; }
    if (!hit) for (const v of variants) if (mExt.has(v)) { hit = { product: mExt.get(v), multiplier: 1, via: "externalId" }; break; }
    if (hit) out.set(code, hit);
  }
  return out;
}

/** Fisa scurta a produsului pentru ecranul scanerului (pret + stoc pe depozite) */
export async function lookupCode(code, { warehouse } = {}, q = db()) {
  const c = String(code ?? "").trim();
  if (!c) throw badRequest("Lipsește codul (parametrul code)");
  const hit = (await resolveCodes([c], q)).get(c);
  if (!hit) return { found: false, code: c };
  const p = hit.product;
  const stock = await q`
    select w.id as warehouse_id, w.code, w.name, coalesce(s.quantity, 0) as quantity
    from warehouses w left join stock s on s.warehouse_id = w.id and s.product_id = ${p._id}
    where w.active order by w.is_default desc, w.name`;
  const wh = warehouse ? await resolveWarehouse(warehouse, q) : null;
  const [extra] = await q`select coalesce(json_agg(json_build_object('code', code, 'multiplier', multiplier) order by code), '[]'::json) as list
                          from product_barcodes where product_id = ${p._id}`;
  return {
    found: true,
    code: c,
    multiplier: hit.multiplier,
    matchedBy: hit.via,
    product: {
      id: p._id,
      name: p.name,
      sku: p.sku || null,
      barcode: p.barcode || null,
      extraBarcodes: extra?.list || [],
      externalId: p.externalId || null,
      unit: p.unit,
      price: p.price || 0,
      wholesalePrice: p.wholesalePrice ?? null,
      // reducerea pe produs (ca in API v1): procent, perioada, pretul cu amanuntul dupa reducerea de azi
      discount: p.discount > 0 ? p.discount : null,
      discountFrom: p.discountFrom || null,
      discountTo: p.discountTo || null,
      salePrice: activeDiscount(p) ? discountedPrice(p.price, activeDiscount(p)) : null,
      active: p.active !== false,
      photoUrl: `/api/products/${p._id}/photo`,
      stock: stock.map((s) => ({ warehouseId: s.warehouseId, warehouseCode: s.code || null, warehouseName: s.name, quantity: s.quantity })),
      totalStock: round4(stock.reduce((t, s) => t + (s.quantity || 0), 0)),
      quantityInWarehouse: wh ? stock.find((s) => String(s.warehouseId) === String(wh._id))?.quantity ?? 0 : null,
    },
  };
}

/* ---------------- Sesiuni de scanare ---------------- */

// Agrega liniile pe cod (acelasi cod scanat de mai multe ori = o linie) si recunoaste produsele
async function buildItems(rawItems, q) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw badRequest("Lista „items” este goală");
  if (rawItems.length > MAX_LINES) throw badRequest(`Maximum ${MAX_LINES} linii per sesiune`);
  const agg = new Map();
  rawItems.forEach((it, i) => {
    const code = String(it?.code ?? it?.barcode ?? it?.sku ?? "").trim();
    if (!code) throw badRequest(`Linia ${i + 1}: lipsește codul`);
    const qty = it?.quantity === undefined || it?.quantity === null || it?.quantity === "" ? 1 : Number(String(it.quantity).replace(",", "."));
    if (!Number.isFinite(qty) || qty < 0) throw badRequest(`Linia ${i + 1}: cantitate invalidă pentru „${code}”`);
    const cur = agg.get(code) || { code, scanned: 0, scans: 0 };
    cur.scanned = round4(cur.scanned + qty);
    cur.scans += 1;
    agg.set(code, cur);
  });
  return resolveItems([...agg.values()], q);
}

async function resolveItems(lines, q, overrides = {}) {
  const hits = await resolveCodes(lines.map((l) => l.code), q);
  // legaturi manuale (cod necunoscut -> produs) facute in CRM
  const manualIds = [...new Set(Object.values(overrides).filter((x) => isUuid(String(x))))];
  const manual = manualIds.length
    ? new Map((await q`select id, name, sku, barcode, unit, active from products where id in ${q(manualIds)}`).map((p) => [String(p._id), p]))
    : new Map();
  return lines.map((l) => {
    const forced = overrides[l.code] ? manual.get(String(overrides[l.code])) : null;
    const hit = forced ? { product: forced, multiplier: 1, via: "manual" } : hits.get(l.code);
    if (!hit) return { code: l.code, scanned: l.scanned, scans: l.scans, quantity: l.scanned, matched: false, productId: null, productName: null };
    return {
      code: l.code,
      scanned: l.scanned,
      scans: l.scans,
      multiplier: hit.multiplier,
      quantity: round4(l.scanned * hit.multiplier),
      matched: true,
      matchedBy: hit.via,
      productId: hit.product._id,
      productName: hit.product.name,
      sku: hit.product.sku || null,
      unit: hit.product.unit,
      inactive: hit.product.active === false,
    };
  });
}

const SESSION_SELECT = (q) => q`
  select s.*,
    (select json_build_object('_id', w.id, 'name', w.name, 'code', w.code) from warehouses w where w.id = s.warehouse_id) as warehouse,
    (select json_build_object('_id', w.id, 'name', w.name, 'code', w.code) from warehouses w where w.id = s.to_warehouse_id) as to_warehouse,
    (select json_build_object('_id', o.id, 'number', o.number, 'status', o.status, 'customerName', o.customer_name) from orders o where o.id = s.order_id) as "order",
    (select json_build_object('_id', i.id, 'number', i.number, 'status', i.status) from inventory_counts i where i.id = s.inventory_id) as inventory,
    (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = s.created_by_id) as created_by,
    (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = s.applied_by_id) as applied_by
  from scan_sessions s`;

export async function getScanSession(id, q = db()) {
  if (!isUuid(String(id))) throw notFound("Sesiunea de scanare nu există");
  const [s] = await q`${SESSION_SELECT(q)} where s.id = ${id}`;
  if (!s) throw notFound("Sesiunea de scanare nu există");
  return s;
}

export async function listScanSessions({ status, operation, source, limit = 50, skip = 0 } = {}, q = db()) {
  const conds = [q`true`];
  if (status) conds.push(q`s.status = ${status}`);
  if (operation) conds.push(q`s.operation = ${operation}`);
  if (source) conds.push(q`s.source = ${source}`);
  const where = conds.slice(1).reduce((a, c) => q`${a} and ${c}`, conds[0]);
  const [items, [{ n }], counts] = await Promise.all([
    q`${SESSION_SELECT(q)} where ${where} order by s.created_at desc limit ${limit} offset ${skip}`,
    q`select count(*)::int as n from scan_sessions s where ${where}`,
    q`select status, count(*)::int as n from scan_sessions group by status`,
  ]);
  return { items, total: n, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
}

/**
 * Creeaza o sesiune de scanare.
 * input: { operation, warehouse, toWarehouse, inventoryId, orderId, device, note, externalId, items: [{ code, quantity }],
 *          options: { mode: "set"|"add", reasonCode, reason, supplierId, supplier, supplierInvoice, markReady }, apply }
 * origin: { source: "scanner"|"crm"|"file", sourceName, apiKeyId, user }
 */
export async function createScanSession(input, origin) {
  const sql = db();
  const operation = SCAN_OPERATION_KEYS.includes(input?.operation) ? input.operation : null;
  if (!operation) throw badRequest(`Operațiune necunoscută. Valori permise: ${SCAN_OPERATION_KEYS.join(", ")}`);
  const source = origin.source || "crm";
  if (input.externalId) {
    const [dup] = await sql`select id from scan_sessions where source = ${source} and external_id = ${String(input.externalId)}`;
    if (dup) return { session: await getScanSession(dup._id), duplicate: true };
  }

  const wh = input.warehouse ? await resolveWarehouse(input.warehouse) : null;
  if (input.warehouse && !wh) throw badRequest(`Depozit negăsit: ${input.warehouse}`);
  const toWh = input.toWarehouse ? await resolveWarehouse(input.toWarehouse) : null;
  if (input.toWarehouse && !toWh) throw badRequest(`Depozitul destinație nu a fost găsit: ${input.toWarehouse}`);

  let orderId = null;
  if (operation === "picking") {
    const ref = String(input.orderId || input.order || "").trim();
    if (!ref) throw badRequest("Pentru pregătirea comenzii trimiteți „orderId” (ID sau număr CMD-…)");
    const [o] = await sql`select id from orders where ${isUuid(ref) ? sql`id = ${ref}` : sql`false`} or number = ${ref} or external_id = ${ref} limit 1`;
    if (!o) throw badRequest(`Comanda „${ref}” nu există`);
    orderId = o._id;
  }
  let inventoryId = null;
  if (operation === "inventory" && input.inventoryId) {
    const ref = String(input.inventoryId).trim();
    const [inv] = await sql`select id, status, warehouse_id from inventory_counts where ${isUuid(ref) ? sql`id = ${ref}` : sql`false`} or number = ${ref} limit 1`;
    if (!inv) throw badRequest(`Inventarierea „${ref}” nu există`);
    if (inv.status !== "draft") throw badRequest(`Inventarierea „${ref}” este închisă`);
    inventoryId = inv._id;
  }

  const items = await buildItems(input.items, sql);
  const opts = input.options && typeof input.options === "object" ? input.options : {};
  const options = {
    mode: opts.mode === "add" ? "add" : "set",
    reasonCode: WRITEOFF_REASONS.some((r) => r.key === opts.reasonCode) ? opts.reasonCode : undefined,
    reason: opts.reason ? String(opts.reason).slice(0, 500) : undefined,
    supplierId: isUuid(String(opts.supplierId || "")) ? opts.supplierId : undefined,
    supplier: opts.supplier ? String(opts.supplier).slice(0, 200) : undefined,
    supplierInvoice: opts.supplierInvoice ? String(opts.supplierInvoice).slice(0, 100) : undefined,
    markReady: opts.markReady !== false,
  };

  const [row] = await sql`insert into scan_sessions ${sql({
    number: await nextNumber("scan", sql),
    operation,
    device: input.device ? String(input.device).slice(0, 120) : null,
    warehouseId: wh?._id || null,
    toWarehouseId: toWh?._id || null,
    inventoryId,
    orderId,
    options: sql.json(options),
    items: sql.json(items),
    unknownCount: items.filter((i) => !i.matched).length,
    note: input.note ? String(input.note).slice(0, 1000) : null,
    externalId: input.externalId ? String(input.externalId) : null,
    source,
    sourceName: origin.sourceName || null,
    apiKeyId: origin.apiKeyId || null,
    createdById: origin.user?.id && isUuid(String(origin.user.id)) ? origin.user.id : null,
  })} returning id`;

  let session = await getScanSession(row._id);
  if (input.apply && session.unknownCount === 0 && operation !== "list") {
    session = await applyScanSession(session._id, origin.user || { id: null, name: origin.sourceName || "Scaner", role: "admin", system: true });
  }
  return { session, duplicate: false };
}

/** Leaga un cod necunoscut de un produs (si, optional, salveaza codul ca cod de bare suplimentar). */
export async function linkScanCode(sessionId, { code, productId, saveBarcode = true, multiplier = 1 }, actor) {
  const sql = db();
  const s = await getScanSession(sessionId);
  if (s.status !== "pending" && s.status !== "error") throw badRequest("Sesiunea este deja închisă");
  if (!isUuid(String(productId || ""))) throw badRequest("Alegeți produsul");
  const [p] = await sql`select id, name from products where id = ${productId}`;
  if (!p) throw badRequest("Produsul nu există");
  if (!s.items.some((i) => i.code === code)) throw badRequest("Codul nu face parte din această sesiune");
  if (saveBarcode) {
    const m = Number(multiplier) > 0 ? Number(multiplier) : 1;
    await sql`insert into product_barcodes ${sql({ code, productId, multiplier: m })}
              on conflict (code) do update set product_id = excluded.product_id, multiplier = excluded.multiplier`;
    runAfter(() => logAudit({ action: "product_edited", category: "product", entity: p, entityName: p.name, user: actor, details: `Cod de bare suplimentar ${code}${m !== 1 ? ` (× ${m})` : ""}` }));
  }
  const overrides = saveBarcode ? {} : { [code]: productId };
  // pastram legaturile manuale facute anterior in aceasta sesiune
  for (const i of s.items) if (i.matchedBy === "manual" && i.code !== code) overrides[i.code] = i.productId;
  const items = await resolveItems(s.items.map((i) => ({ code: i.code, scanned: i.scanned, scans: i.scans })), sql, overrides);
  await sql`update scan_sessions set items = ${sql.json(items)}, unknown_count = ${items.filter((i) => !i.matched).length}, error = null where id = ${s._id}`;
  return getScanSession(s._id);
}

/** Elimina din sesiune liniile cu coduri necunoscute (ex: coduri scanate din greseala) */
export async function dropUnknownCodes(sessionId) {
  const sql = db();
  const s = await getScanSession(sessionId);
  if (s.status !== "pending" && s.status !== "error") throw badRequest("Sesiunea este deja închisă");
  const items = s.items.filter((i) => i.matched);
  if (!items.length) throw badRequest("Sesiunea nu are niciun cod recunoscut");
  await sql`update scan_sessions set items = ${sql.json(items)}, unknown_count = 0, error = null where id = ${s._id}`;
  return getScanSession(s._id);
}

// Liniile recunoscute, agregate pe produs
function productLines(items) {
  const m = new Map();
  for (const i of items) {
    if (!i.matched || !(i.quantity > 0)) continue;
    const cur = m.get(String(i.productId)) || { product: i.productId, quantity: 0, name: i.productName };
    cur.quantity = round4(cur.quantity + i.quantity);
    m.set(String(i.productId), cur);
  }
  return [...m.values()];
}

/** Aplica sesiunea: creeaza documentul de stoc corespunzator (o singura data — idempotent). */
export async function applyScanSession(sessionId, actor, patch = {}) {
  const sql = db();
  const s = await getScanSession(sessionId);
  if (s.status === "applied") return s;
  if (s.status === "rejected") throw badRequest("Sesiunea a fost respinsă");
  if (s.unknownCount > 0) throw badRequest(`Sesiunea are ${s.unknownCount} coduri necunoscute. Legați-le de produse sau eliminați-le întâi.`);
  if (s.operation === "list") throw badRequest("O listă de coduri nu modifică stocul — nu are ce aplica");

  // corectii facute la verificare (depozit, motiv etc.)
  const whId = patch.warehouse ? (await resolveWarehouse(patch.warehouse))?._id : s.warehouseId;
  const toWhId = patch.toWarehouse ? (await resolveWarehouse(patch.toWarehouse))?._id : s.toWarehouseId;
  const options = { ...(s.options || {}), ...(patch.options || {}) };
  const lines = productLines(s.items);
  const externalId = `scan-${s._id}`;
  const label = `${s.number}${s.device ? ` · ${s.device}` : ""}`;
  const who = actor?.system ? actor : { ...actor };

  // Document deja creat la o incercare anterioara (ex: intrerupere dupa creare) -> nu-l dublam
  const existing = async (table) => {
    const [d] = await sql`select id, number from ${sql(table)} where external_id = ${externalId} limit 1`;
    return d || null;
  };
  const HREF = { arrival: (id) => `/receptie/${id}`, writeoff: () => "/anulare", transfer: () => "/transfer" };
  const TABLE = { arrival: "arrivals", writeoff: "writeoffs", transfer: "transfers" };

  let result;
  try {
    const prev = TABLE[s.operation] ? await existing(TABLE[s.operation]) : null;
    if (prev) {
      result = { docType: s.operation, docId: prev._id, number: prev.number, href: HREF[s.operation](prev._id) };
    } else if (s.operation === "arrival") {
      if (!whId) throw badRequest("Alegeți depozitul pentru recepție");
      if (!lines.length) throw badRequest("Nicio cantitate de recepționat");
      const { doc } = await createArrival(
        { warehouse: whId, supplierId: options.supplierId, supplier: options.supplier, supplierInvoice: options.supplierInvoice, items: lines, note: s.note || `Scanare ${label}`, externalId, source: "scanner", updateCostPrice: false },
        who
      );
      result = { docType: "arrival", docId: doc._id, number: doc.number, href: `/receptie/${doc._id}` };
    } else if (s.operation === "writeoff") {
      if (!whId) throw badRequest("Alegeți depozitul pentru casare");
      if (!lines.length) throw badRequest("Nicio cantitate de casat");
      const doc = await createWriteoff({ warehouse: whId, reasonCode: options.reasonCode || "other", reason: options.reason || s.note || `Scanare ${label}`, items: lines, externalId, source: "scanner" }, who);
      result = { docType: "writeoff", docId: doc._id, number: doc.number, href: `/anulare` };
    } else if (s.operation === "transfer") {
      if (!whId || !toWhId) throw badRequest("Alegeți depozitul sursă și destinație");
      if (!lines.length) throw badRequest("Nicio cantitate de transferat");
      const doc = await createTransfer({ fromWarehouse: whId, toWarehouse: toWhId, items: lines, note: s.note || `Scanare ${label}`, externalId, source: "scanner" }, who);
      result = { docType: "transfer", docId: doc._id, number: doc.number, href: `/transfer` };
    } else if (s.operation === "inventory") {
      let invId = s.inventoryId;
      if (!invId) {
        if (!whId) throw badRequest("Alegeți depozitul inventarierii");
        const inv = await createInventory({ warehouse: whId, note: `Din scanarea ${label}` }, { ...who, id: who.id && isUuid(String(who.id)) ? who.id : null });
        invId = inv._id;
      }
      const [inv] = await sql`select id, number, status, items from inventory_counts where id = ${invId}`;
      if (!inv || inv.status !== "draft") throw badRequest("Inventarierea nu mai este deschisă");
      const known = new Set(inv.items.map((l) => String(l.product)));
      const missing = lines.filter((l) => !known.has(String(l.product)));
      if (missing.length) throw badRequest(`Produse care nu fac parte din inventariere: ${missing.slice(0, 5).map((l) => l.name).join(", ")}${missing.length > 5 ? "…" : ""}`);
      const prev = new Map(inv.items.map((l) => [String(l.product), l.counted]));
      const counts = lines.map((l) => ({
        product: l.product,
        counted: options.mode === "add" ? round4((Number(prev.get(String(l.product))) || 0) + l.quantity) : l.quantity,
      }));
      const doc = await updateInventory(invId, { items: counts });
      result = { docType: "inventory", docId: doc._id, number: doc.number, href: `/inventariere/${doc._id}`, lines: counts.length, mode: options.mode };
    } else if (s.operation === "picking") {
      const order = await loadOrder(s.orderId);
      if (!order) throw badRequest("Comanda nu mai există");
      const need = new Map();
      for (const it of order.items) {
        const k = String(it.product);
        const cur = need.get(k) || { product: k, name: it.productName, ordered: 0, picked: 0 };
        cur.ordered = round4(cur.ordered + Number(it.quantity));
        need.set(k, cur);
      }
      const extra = [];
      for (const l of lines) {
        const row = need.get(String(l.product));
        if (row) row.picked = round4(row.picked + l.quantity);
        else extra.push({ product: l.product, name: l.name, picked: l.quantity });
      }
      const rows = [...need.values()].map((r) => ({ ...r, diff: round4(r.picked - r.ordered) }));
      const complete = rows.every((r) => r.diff === 0) && !extra.length;
      result = { docType: "order", docId: order._id, number: order.number, href: `/comenzi/${order._id}`, complete, lines: rows, extra };
      if (complete && options.markReady && order.status === "processing") {
        await setOrderStage(order._id, "ready", who);
        result.markedReady = true;
      }
    }
  } catch (e) {
    await sql`update scan_sessions set status = 'error', error = ${e.message} where id = ${s._id}`;
    throw e;
  }
  await sql`update scan_sessions set
      status = 'applied', applied_at = now(), result = ${sql.json(result)}, error = null,
      applied_by_id = ${actor?.id && isUuid(String(actor.id)) ? actor.id : null},
      warehouse_id = ${whId || null}, to_warehouse_id = ${toWhId || null}, options = ${sql.json(options)}
    where id = ${s._id}`;
  runAfter(() =>
    logAudit({ action: "scan_applied", category: "stock", entityName: s.number, user: actor, details: `${scanOperationLabel(s.operation)} · ${lines.length} produse${result?.number ? ` → ${result.number}` : ""}` })
  );
  return getScanSession(s._id);
}

export async function rejectScanSession(sessionId, actor, reason) {
  const sql = db();
  const s = await getScanSession(sessionId);
  if (s.status === "applied") throw badRequest("Sesiunea a fost deja aplicată");
  await sql`update scan_sessions set status = 'rejected', error = ${reason || null}, applied_by_id = ${actor?.id || null}, applied_at = now() where id = ${s._id}`;
  return getScanSession(s._id);
}

/* ---------------- Date pentru aplicatia scanerului ---------------- */

/** Catalog compact pentru lucrul offline pe terminal (cod -> produs) */
export async function scannerCatalog({ updatedSince, page = 1, limit = 1000, warehouse } = {}, q = db()) {
  const conds = [q`true`];
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) throw badRequest("updatedSince trebuie să fie o dată ISO 8601");
    conds.push(q`p.updated_at > ${d}`);
  }
  const wh = warehouse ? await resolveWarehouse(warehouse, q) : null;
  const where = conds.slice(1).reduce((a, c) => q`${a} and ${c}`, conds[0]);
  const lim = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const off = (Math.max(1, Number(page) || 1) - 1) * lim;
  const [rows, [{ n }]] = await Promise.all([
    q`select p.id, p.name, p.sku, p.barcode, p.unit, p.price, p.active, p.updated_at, p.discount, p.discount_from, p.discount_to,
        coalesce((select json_agg(json_build_object('code', b.code, 'multiplier', b.multiplier)) from product_barcodes b where b.product_id = p.id), '[]'::json) as extra_barcodes,
        coalesce((select sum(quantity) from stock s where s.product_id = p.id ${wh ? q`and s.warehouse_id = ${wh._id}` : q``}), 0) as stock
      from products p where ${where} order by p.updated_at, p.id limit ${lim} offset ${off}`,
    q`select count(*)::int as n from products p where ${where}`,
  ]);
  return {
    items: rows.map((p) => ({
      id: p._id,
      name: p.name,
      sku: p.sku || null,
      barcode: p.barcode || null,
      extraBarcodes: p.extraBarcodes,
      unit: p.unit,
      price: p.price || 0,
      discount: p.discount > 0 ? p.discount : null,
      discountFrom: p.discountFrom || null,
      discountTo: p.discountTo || null,
      salePrice: activeDiscount(p) ? discountedPrice(p.price, activeDiscount(p)) : null,
      stock: p.stock,
      active: p.active !== false,
      updatedAt: p.updatedAt,
    })),
    meta: { page: Math.max(1, Number(page) || 1), limit: lim, total: n, hasMore: off + rows.length < n },
  };
}

/** Comenzile de pregatit (pentru modul „picking” al terminalului) */
export async function ordersToPick({ status = "processing", limit = 50 } = {}, q = db()) {
  const statuses = String(status).split(",").map((s) => s.trim()).filter(Boolean);
  return q`
    select o.id, o.number, o.status, o.customer_name, o.created_at,
      coalesce((select json_agg(json_build_object('productId', i.product_id, 'name', i.product_name, 'sku', i.sku,
                'barcode', p.barcode, 'quantity', i.quantity, 'unit', i.unit,
                'warehouse', (select json_build_object('id', w.id, 'code', w.code, 'name', w.name) from warehouses w where w.id = i.warehouse_id))
                order by i.position)
        from order_items i left join products p on p.id = i.product_id where i.order_id = o.id), '[]'::json) as items
    from orders o where o.status in ${q(statuses)} order by o.created_at limit ${Math.min(200, Number(limit) || 50)}`;
}

/** Inventarierile deschise + liniile lor (pentru numararea pe terminal) */
export async function openInventories({ id, blind = false } = {}, q = db()) {
  const rows = id
    ? await q`select i.id, i.number, i.status, i.warehouse_id, i.items, i.created_at, w.name as warehouse_name, w.code as warehouse_code
              from inventory_counts i join warehouses w on w.id = i.warehouse_id where i.id = ${id}`
    : await q`select i.id, i.number, i.status, i.warehouse_id, i.created_at, w.name as warehouse_name, w.code as warehouse_code,
                     jsonb_array_length(i.items) as lines
              from inventory_counts i join warehouses w on w.id = i.warehouse_id where i.status = 'draft' order by i.created_at desc`;
  if (!id) return rows.map((r) => ({ id: r._id, number: r.number, warehouseId: r.warehouseId, warehouseName: r.warehouseName, warehouseCode: r.warehouseCode, lines: r.lines, createdAt: r.createdAt }));
  const inv = rows[0];
  if (!inv) throw notFound("Inventarierea nu există");
  const pids = inv.items.map((l) => l.product).filter((x) => isUuid(String(x)));
  const codes = pids.length ? await q`select id, barcode from products where id in ${q(pids)}` : [];
  const bc = new Map(codes.map((p) => [String(p._id), p.barcode]));
  return {
    id: inv._id,
    number: inv.number,
    status: inv.status,
    warehouseId: inv.warehouseId,
    warehouseName: inv.warehouseName,
    lines: inv.items.map((l) => ({
      productId: l.product,
      name: l.productName,
      sku: l.sku || null,
      barcode: bc.get(String(l.product)) || null,
      unit: l.unit,
      ...(blind ? {} : { expected: l.expected }),
      counted: l.counted ?? null,
    })),
  };
}

export { idOf };
