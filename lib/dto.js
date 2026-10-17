// Contractul public al datelor (API v1 + webhook-uri). Campurile de aici sunt stabile:
// 1C si alte sisteme se bazeaza pe ele — adaugati campuri noi, nu le redenumiti.
import Product from "@/models/Product";
import Warehouse from "@/models/Warehouse";
import { stageInfo } from "./orderStages";
import { MOVEMENT_TYPES } from "./constants";

const sid = (x) => (x ? String(x._id || x) : null);
const iso = (d) => (d ? new Date(d).toISOString() : null);

export function warehouseDTO(w) {
  if (!w) return null;
  return {
    id: sid(w),
    externalId: w.externalId || null,
    code: w.code || null,
    name: w.name,
    type: w.type || "warehouse",
    address: w.address || null,
    isDefault: !!w.isDefault,
    syncToSite: w.syncToSite !== false,
    active: w.active !== false,
    updatedAt: iso(w.updatedAt),
  };
}

export function categoryDTO(c) {
  if (!c) return null;
  return {
    id: sid(c),
    externalId: c.externalId || null,
    name: c.name,
    parentId: sid(c.parent),
    active: c.active !== false,
    updatedAt: iso(c.updatedAt),
  };
}

export function productDTO(p, { warehouses } = {}) {
  const stock = (p.stock || []).map((s) => {
    const wid = sid(s.warehouse);
    const w = s.warehouse?.name ? s.warehouse : warehouses?.get(wid);
    return {
      warehouseId: wid,
      warehouseCode: w?.code || null,
      warehouseExternalId: w?.externalId || null,
      warehouseName: w?.name || null,
      quantity: s.quantity || 0,
    };
  });
  return {
    id: sid(p),
    externalId: p.externalId || null,
    sku: p.sku || null,
    barcode: p.barcode || null,
    name: p.name,
    description: p.description || null,
    categoryId: sid(p.category),
    categoryName: p.category?.name || null,
    brand: p.brand || null,
    packaging: p.packaging || null,
    unit: p.unit,
    price: p.price || 0,
    wholesalePrice: p.wholesalePrice ?? null,
    costPrice: p.costPrice ?? null,
    vatRate: p.vatRate ?? null,
    minStock: p.minStock ?? null,
    isComposite: !!p.isComposite,
    components: (p.components || []).map((c) => ({
      productId: sid(c.product),
      name: c.productName,
      quantity: c.quantity,
    })),
    stock,
    totalStock: stock.reduce((s, x) => s + x.quantity, 0),
    active: p.active !== false,
    wooId: p.wooId ?? null,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

export function customerDTO(c) {
  if (!c) return null;
  return {
    id: sid(c),
    number: c.number || null,
    externalId: c.externalId || null,
    type: c.type || "individual",
    name: c.name,
    contactPerson: c.contactPerson || null,
    phone: c.phone || null,
    phone2: c.phone2 || null,
    email: c.email || null,
    idno: c.idno || null,
    vatCode: c.vatCode || null,
    iban: c.iban || null,
    bank: c.bank || null,
    legalAddress: c.legalAddress || null,
    city: c.city || null,
    address: c.address || null,
    segment: c.segment || "retail",
    priceType: c.priceType || "retail",
    discount: c.discount || 0,
    paymentTermDays: c.paymentTermDays || 0,
    source: c.source || null,
    tags: c.tags || [],
    note: c.note || null,
    active: c.active !== false,
    stats: {
      ordersCount: c.stats?.ordersCount || 0,
      totalSpent: c.stats?.totalSpent || 0,
      balance: c.stats?.balance || 0,
      lastOrderAt: iso(c.stats?.lastOrderAt),
    },
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}

export function supplierDTO(s) {
  return {
    id: sid(s),
    externalId: s.externalId || null,
    name: s.name,
    contactPerson: s.contactPerson || null,
    phone: s.phone || null,
    email: s.email || null,
    idno: s.idno || null,
    iban: s.iban || null,
    address: s.address || null,
    country: s.country || null,
    active: s.active !== false,
    updatedAt: iso(s.updatedAt),
  };
}

// Incarca in lot datele necesare pentru liniile de comanda (externalId produs, cod depozit)
async function lookups(orders) {
  const pids = new Set();
  const wids = new Set();
  for (const o of orders) {
    for (const it of o.items || []) {
      pids.add(sid(it.product));
      wids.add(sid(it.warehouse));
    }
  }
  const [products, warehouses] = await Promise.all([
    Product.find({ _id: { $in: [...pids] } }).select("externalId barcode").lean(),
    Warehouse.find({ _id: { $in: [...wids] } }).select("name code externalId").lean(),
  ]);
  return {
    products: new Map(products.map((p) => [String(p._id), p])),
    warehouses: new Map(warehouses.map((w) => [String(w._id), w])),
  };
}

export function orderDTO(o, maps = {}, currency = "MDL") {
  const customer = o.customer && o.customer.name ? o.customer : null;
  return {
    id: sid(o),
    number: o.number,
    status: o.status,
    statusLabel: stageInfo(o.status).label,
    channel: o.channel || "store",
    createdAt: iso(o.createdAt),
    updatedAt: iso(o.updatedAt),
    completedAt: iso(o.completedAt),
    currency,
    customer: {
      id: sid(o.customer),
      externalId: customer?.externalId || null,
      name: o.customerName || customer?.name || null,
      phone: o.customerPhone || customer?.phone || null,
      email: o.customerEmail || customer?.email || null,
      idno: customer?.idno || null,
      type: customer?.type || null,
    },
    priceType: o.priceType || "retail",
    items: (o.items || []).map((it) => {
      const p = maps.products?.get(sid(it.product));
      const w = maps.warehouses?.get(sid(it.warehouse));
      return {
        productId: sid(it.product),
        productExternalId: p?.externalId || null,
        sku: it.sku || null,
        barcode: p?.barcode || null,
        name: it.productName,
        warehouseId: sid(it.warehouse),
        warehouseCode: w?.code || null,
        warehouseExternalId: w?.externalId || null,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discount: it.discount || 0,
        lineTotal: it.lineTotal,
        vatRate: it.vatRate || 0,
      };
    }),
    subtotal: o.subtotal ?? o.total,
    deliveryCost: o.delivery?.cost || 0,
    vatTotal: o.vatTotal || 0,
    total: o.total,
    delivery: {
      method: o.delivery?.method || null,
      label: o.delivery?.label || null,
      city: o.delivery?.city || null,
      address: o.delivery?.address || null,
      recipient: o.delivery?.recipient || null,
      phone: o.delivery?.phone || null,
      date: iso(o.delivery?.date),
      trackingNumber: o.delivery?.trackingNumber || null,
    },
    paymentMethod: o.paymentMethod || null,
    paymentStatus: o.paymentStatus || "unpaid",
    paidAmount: o.paidAmount || 0,
    dueDate: iso(o.dueDate),
    payments: (o.payments || []).map((p) => ({
      id: sid(p),
      amount: p.amount,
      method: p.method,
      date: iso(p.date),
      reference: p.reference || null,
      note: p.note || null,
    })),
    responsible: o.responsible?.name
      ? { id: sid(o.responsible), name: o.responsible.name, email: o.responsible.email || null }
      : { id: sid(o.responsible) },
    note: o.note || null,
    invoice: { number: o.invoice?.number || null, date: iso(o.invoice?.date) },
    external: { source: o.externalSource || null, id: o.externalId || null, number: o.externalNumber || null },
    export1c: {
      exported: !!o.export1c?.exportedAt,
      exportedAt: iso(o.export1c?.exportedAt),
      docNumber: o.export1c?.docNumber || null,
      docId: o.export1c?.docId || null,
    },
  };
}

export async function ordersDTO(orders, currency) {
  const maps = await lookups(orders);
  return orders.map((o) => orderDTO(o, maps, currency));
}

export function movementDTO(m) {
  return {
    id: sid(m),
    productId: sid(m.product),
    sku: m.sku || null,
    productName: m.productName,
    warehouseId: sid(m.warehouse),
    quantity: m.quantity,
    balanceAfter: m.balanceAfter ?? null,
    type: m.type,
    typeLabel: MOVEMENT_TYPES[m.type]?.label || m.type,
    unitCost: m.unitCost ?? null,
    ref: { type: m.refType || null, id: sid(m.refId), number: m.refNumber || null },
    user: m.userName || null,
    note: m.note || null,
    createdAt: iso(m.createdAt),
  };
}

// Linii de document de stoc, cu compatibilitate pentru documentele vechi (o singura linie)
export function docLines(d) {
  if (d.items?.length) return d.items;
  if (d.product) {
    return [
      {
        product: d.product,
        productName: d.productName || d.product?.name,
        unit: d.product?.unit,
        quantity: d.quantity,
        unitCost: d.unitCost,
        lineTotal: d.unitCost ? d.unitCost * d.quantity : 0,
      },
    ];
  }
  return [];
}
