// Schimbul de date cu 1C: fluxul de modificari (change_log) si formatul complet al fiecarui obiect.
// 1C cere periodic „ce s-a schimbat dupa cursorul X”, aplica datele si confirma noul cursor.
import { db, isUuid } from "./db";
import { getSettings } from "./settings";
import { productDTO, customerDTO, warehouseDTO, categoryDTO, supplierDTO, ordersDTO } from "./dto";
import { stockJson } from "./products";
import { CUSTOMER_COLS } from "./customers";
import { orderSelect } from "./orderService";
import { signedPhotoUrl } from "./woo";
import { publicBaseUrl } from "./publicUrl";
import { writeoffReasonLabel } from "./constants";

export const ENTITIES = ["product", "category", "warehouse", "customer", "supplier", "order", "stock", "arrival", "transfer", "writeoff", "inventory"];

const iso = (d) => (d ? new Date(d).toISOString() : null);
const photoVersion = async (photo) => {
  const { createHash } = await import("node:crypto");
  return createHash("sha1").update(String(photo || "")).digest("hex").slice(0, 16);
};

async function lookups() {
  const sql = db();
  const [ws, ps] = await Promise.all([
    sql`select id, name, code, external_id from warehouses`,
    sql`select id, external_id, sku, barcode, name, unit from products`,
  ]);
  return { warehouses: new Map(ws.map((w) => [String(w._id), w])), products: new Map(ps.map((p) => [String(p._id), p])) };
}

const whRef = (map, id) => {
  const w = map.get(String(id));
  return w ? { id: String(w._id), code: w.code || null, externalId: w.externalId || null, name: w.name } : id ? { id: String(id) } : null;
};

const lineRef = (products, l) => {
  const p = products.get(String(l.product));
  return {
    productId: l.product ? String(l.product) : null,
    productExternalId: p?.externalId || null,
    sku: l.sku || p?.sku || null,
    barcode: p?.barcode || null,
    name: l.productName || p?.name || null,
    unit: l.unit || p?.unit || null,
    quantity: Number(l.quantity) || 0,
  };
};

/** Obiectele complete (formatul API v1) pentru o lista de id-uri ale unei entitati. Map id -> obiect */
export async function entityDTOs(entity, ids, { baseUrl } = {}) {
  const sql = db();
  const list = [...new Set(ids.map(String))].filter(isUuid);
  const out = new Map();
  if (!list.length) return out;
  const L = ["arrival", "transfer", "writeoff", "inventory", "product", "stock"].includes(entity) ? await lookups() : null;

  if (entity === "product") {
    const rows = await sql`
      select p.id, p.name, p.description, p.sku, p.barcode, p.category_id, c.name as category_name, p.brand, p.packaging, p.unit,
             p.price, p.wholesale_price, p.cost_price, p.vat_rate, p.min_stock, p.is_composite, p.components, p.tags, p.active,
             p.external_id, p.woo_id, p.created_at, p.updated_at, p.photo, ${stockJson(sql)} as stock
      from products p left join categories c on c.id = p.category_id where p.id in ${sql(list)}`;
    for (const p of rows) {
      const dto = productDTO(p, { warehouses: L.warehouses });
      dto.tags = p.tags || [];
      dto.photoUrl = !p.photo ? null : /^https?:\/\//.test(p.photo) ? p.photo : baseUrl ? signedPhotoUrl(baseUrl, p._id, await photoVersion(p.photo)) : null;
      out.set(String(p._id), dto);
    }
  } else if (entity === "category") {
    for (const c of await sql`select * from categories where id in ${sql(list)}`) out.set(String(c._id), categoryDTO(c));
  } else if (entity === "warehouse") {
    for (const w of await sql`select * from warehouses where id in ${sql(list)}`) out.set(String(w._id), warehouseDTO(w));
  } else if (entity === "customer") {
    const [rows, prices] = await Promise.all([
      sql`select ${sql.unsafe(CUSTOMER_COLS)} from customers c where c.id in ${sql(list)}`,
      sql`select cp.customer_id, cp.product_id, cp.price, p.external_id, p.sku, p.name
          from customer_prices cp join products p on p.id = cp.product_id where cp.customer_id in ${sql(list)} order by cp.position`,
    ]);
    for (const c of rows) {
      const dto = customerDTO(c);
      dto.prices = prices
        .filter((r) => String(r.customerId) === String(c._id))
        .map((r) => ({ productId: String(r.productId), productExternalId: r.externalId || null, sku: r.sku || null, name: r.name, price: r.price }));
      out.set(String(c._id), dto);
    }
  } else if (entity === "supplier") {
    for (const s of await sql`select * from suppliers where id in ${sql(list)}`) out.set(String(s._id), { ...supplierDTO(s), paymentTermDays: s.paymentTermDays || 0, brands: s.brands || [], note: s.note || null });
  } else if (entity === "order") {
    const settings = await getSettings();
    const rows = await sql`${orderSelect(sql)} where o.id in ${sql(list)}`;
    for (const dto of await ordersDTO(rows, settings.currency)) out.set(String(dto.id), dto);
  } else if (entity === "stock") {
    const rows = await sql`select id, external_id, sku, barcode, name, unit, ${stockJson(sql)} as stock from products p where p.id in ${sql(list)}`;
    for (const p of rows) {
      const stock = (p.stock || []).map((s) => ({ ...whRef(L.warehouses, s.warehouse), warehouseId: String(s.warehouse), quantity: s.quantity }));
      out.set(String(p._id), {
        productId: String(p._id),
        productExternalId: p.externalId || null,
        sku: p.sku || null,
        barcode: p.barcode || null,
        name: p.name,
        unit: p.unit,
        stock: stock.map((s) => ({ warehouseId: s.warehouseId, warehouseCode: s.code || null, warehouseExternalId: s.externalId || null, warehouseName: s.name || null, quantity: s.quantity })),
        totalStock: stock.reduce((t, s) => t + (s.quantity || 0), 0),
      });
    }
  } else if (entity === "arrival") {
    const rows = await sql`
      select a.*, (select json_build_object('id', s.id, 'externalId', s.external_id, 'idno', s.idno, 'name', s.name) from suppliers s where s.id = a.supplier_id) as supplier_ref
      from arrivals a where a.id in ${sql(list)}`;
    for (const d of rows) {
      out.set(String(d._id), {
        id: String(d._id),
        type: "arrival",
        number: d.number || null,
        externalId: d.externalId || null,
        source: d.source || "crm",
        date: iso(d.createdAt),
        warehouse: whRef(L.warehouses, d.warehouseId),
        supplier: d.supplierRef ? { ...d.supplierRef, id: String(d.supplierRef.id) } : d.supplier ? { name: d.supplier } : null,
        supplierInvoice: d.supplierInvoice || null,
        supplierInvoiceDate: iso(d.supplierInvoiceDate),
        total: d.total || 0,
        items: (d.items || []).map((l) => ({ ...lineRef(L.products, l), unitCost: l.unitCost ?? null, lineTotal: l.lineTotal ?? null })),
        note: d.note || null,
        updatedAt: iso(d.updatedAt),
      });
    }
  } else if (entity === "transfer") {
    for (const d of await sql`select * from transfers where id in ${sql(list)}`) {
      out.set(String(d._id), {
        id: String(d._id),
        type: "transfer",
        number: d.number || null,
        externalId: d.externalId || null,
        source: d.source || "crm",
        date: iso(d.createdAt),
        fromWarehouse: whRef(L.warehouses, d.fromWarehouseId),
        toWarehouse: whRef(L.warehouses, d.toWarehouseId),
        items: (d.items || []).map((l) => lineRef(L.products, l)),
        note: d.note || null,
        updatedAt: iso(d.updatedAt),
      });
    }
  } else if (entity === "writeoff") {
    for (const d of await sql`select * from writeoffs where id in ${sql(list)}`) {
      out.set(String(d._id), {
        id: String(d._id),
        type: "writeoff",
        number: d.number || null,
        externalId: d.externalId || null,
        source: d.source || "crm",
        date: iso(d.createdAt),
        warehouse: whRef(L.warehouses, d.warehouseId),
        reasonCode: d.reasonCode,
        reasonLabel: writeoffReasonLabel(d.reasonCode),
        reason: d.reason || null,
        totalCost: d.totalCost || 0,
        items: (d.items || []).map((l) => ({ ...lineRef(L.products, l), unitCost: l.unitCost ?? null })),
        updatedAt: iso(d.updatedAt),
      });
    }
  } else if (entity === "inventory") {
    for (const d of await sql`select * from inventory_counts where id in ${sql(list)}`) {
      out.set(String(d._id), {
        id: String(d._id),
        type: "inventory",
        number: d.number || null,
        status: d.status,
        date: iso(d.createdAt),
        completedAt: iso(d.completedAt),
        warehouse: whRef(L.warehouses, d.warehouseId),
        summary: d.summary || null,
        // doar pozitiile numarate: sistem (inainte) -> numarat, diferenta
        items: (d.items || [])
          .filter((l) => l.counted !== null && l.counted !== undefined)
          .map((l) => ({ ...lineRef(L.products, { ...l, quantity: l.counted }), expected: l.expected ?? null, counted: l.counted, diff: l.expected != null ? Math.round((l.counted - l.expected) * 10000) / 10000 : null, unitCost: l.unitCost ?? null })),
        updatedAt: iso(d.updatedAt),
      });
    }
  }
  return out;
}

/** Cursorul curent: ultima modificare „stabila” (mai veche de cateva secunde, deja confirmata in baza). */
export async function stableCursor() {
  const [r] = await db()`select coalesce(max(seq), 0) as seq from change_log where at < now() - interval '5 seconds'`;
  return Number(r.seq) || 0;
}

/**
 * Modificarile de dupa cursor, grupate pe obiect (ultima stare), in ordinea aparitiei.
 * Modificarile facute chiar de aceasta cheie (ecoul propriilor trimiteri) se omit, daca nu se cere altfel.
 */
export async function changesSince({ after = 0, limit = 200, entities, keyId, includeOwn = false, req }) {
  const sql = db();
  const max = await stableCursor();
  const ents = (entities || []).filter((e) => ENTITIES.includes(e));
  const groups = await sql`
    select entity, entity_id, max(seq) as seq, (array_agg(op order by seq desc))[1] as op, max(at) as at
    from change_log
    where seq > ${after} and seq <= ${max}
      ${ents.length ? sql`and entity in ${sql(ents)}` : sql``}
      ${includeOwn || !keyId ? sql`` : sql`and origin is distinct from ${keyId}`}
    group by entity, entity_id
    order by max(seq)
    limit ${limit + 1}`;
  const hasMore = groups.length > limit;
  const page = groups.slice(0, limit);
  const settings = await getSettings();
  const baseUrl = req ? publicBaseUrl(settings, req) : settings.publicUrl || "";
  const byEntity = new Map();
  for (const g of page) {
    if (!byEntity.has(g.entity)) byEntity.set(g.entity, []);
    byEntity.get(g.entity).push(g.entityId);
  }
  const dtos = new Map();
  for (const [entity, ids] of byEntity) dtos.set(entity, await entityDTOs(entity, ids, { baseUrl }));
  const data = page.map((g) => {
    const obj = g.op === "delete" ? null : dtos.get(g.entity)?.get(String(g.entityId)) || null;
    return { seq: Number(g.seq), entity: g.entity, id: String(g.entityId), op: obj ? "upsert" : "delete", at: iso(g.at), data: obj };
  });
  const cursor = hasMore ? Number(page[page.length - 1].seq) : Math.max(after, max);
  return { data, meta: { after, cursor, hasMore, count: data.length } };
}

/** Marcheaza modificarile produse de o cerere a cheii (pentru a nu le trimite inapoi ca ecou). */
export async function markOrigin(keyId, startSeq, ids) {
  const list = [...new Set(ids.map(String))].filter(isUuid);
  if (!keyId || !list.length) return;
  await db()`update change_log set origin = ${keyId} where seq > ${startSeq} and origin is null and entity_id in ${db()(list)}`;
}

export async function currentSeq() {
  const [r] = await db()`select coalesce(max(seq), 0) as seq from change_log`;
  return Number(r.seq) || 0;
}

/** Toate id-urile (uuid) gasite intr-un raspuns — ce a creat / modificat cererea */
export function collectIds(value, out = new Set()) {
  if (!value) return out;
  if (Array.isArray(value)) for (const v of value) collectIds(v, out);
  else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && isUuid(v) && /(^id$|Id$)/.test(k)) out.add(v);
      else if (v && typeof v === "object") collectIds(v, out);
    }
  }
  return out;
}

/** Starea schimbului pentru pagina Integrari -> 1C */
export async function syncStatus() {
  const sql = db();
  const keys = await sql`select id, name, kind, active, sync_seq, sync_at, last_used_at from api_keys where kind = '1c' order by created_at`;
  const max = await currentSeq();
  const minAck = keys.length ? Math.min(...keys.filter((k) => k.active).map((k) => Number(k.syncSeq) || 0), max) : 0;
  const ids = keys.map((k) => k._id);
  const pending = await sql`
    select entity, count(distinct entity_id)::int as n from change_log
    where seq > ${minAck} ${ids.length ? sql`and (origin is null or origin not in ${sql(ids)})` : sql``}
    group by entity order by entity`;
  return {
    cursor: max,
    keys: keys.map((k) => ({ id: k._id, name: k.name, active: k.active, ackCursor: Number(k.syncSeq) || 0, ackAt: k.syncAt, lastUsedAt: k.lastUsedAt, behind: Math.max(0, max - (Number(k.syncSeq) || 0)) })),
    pending: Object.fromEntries(pending.map((p) => [p.entity, p.n])),
  };
}
