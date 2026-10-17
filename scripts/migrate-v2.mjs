// Migrare date existente la versiunea 2 a CRM-ului (redesign + integrari fara Make).
// Idempotent: se poate rula de mai multe ori; a doua oara nu mai modifica nimic.
//
//   node --env-file=.env.local scripts/migrate-v2.mjs          (simulare: arata ce s-ar schimba)
//   node --env-file=.env.local scripts/migrate-v2.mjs --apply  (aplica modificarile)
import mongoose from "mongoose";

const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error("Lipseste MONGODB_URI (rulati cu --env-file=.env.local)");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const log = (...a) => console.log(APPLY ? "•" : "[simulare]", ...a);

await mongoose.connect(URI);
const db = mongoose.connection.db;
const col = (n) => db.collection(n);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const phoneNorm = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  return d ? d.slice(-8) : undefined;
};

const done = await col("migrations").findOne({ _id: "v2" });
if (done && !process.argv.includes("--force")) {
  console.log(`Migrarea v2 a fost deja aplicata la ${done.at.toISOString()}. (--force pentru a o rula din nou)`);
  await mongoose.disconnect();
  process.exit(0);
}

/* 1. Comenzi: canal, subtotal, plati, client ---------------------------------- */
const orders = await col("orders").find({}).toArray();
let ordersFixed = 0;
const customerByName = new Map();
let customersCreated = 0;
const maxCl = await col("customers").find({ number: /^CL-\d+$/ }).sort({ number: -1 }).limit(1).toArray();
let clSeq = maxCl.length ? parseInt(maxCl[0].number.split("-")[1], 10) : 0;

for (const o of orders) {
  const set = {};
  if (!o.channel) set.channel = /make/i.test(o.note || "") ? "site" : "store";
  if (o.subtotal == null) set.subtotal = round2((o.items || []).reduce((s, i) => s + (i.lineTotal || 0), 0));
  if (o.vatTotal == null) set.vatTotal = round2((o.total || 0) * 20 / 120);
  if (!o.delivery) set.delivery = { method: "pickup", label: "Ridicare din magazin", cost: 0 };
  if (!o.paymentMethod) set.paymentMethod = "cash";
  if (!o.payments) {
    // Inainte de v2 platile nu erau urmarite: comenzile finalizate se considera achitate
    if (o.status === "completed" && o.total > 0) {
      set.payments = [{ _id: new mongoose.Types.ObjectId(), amount: round2(o.total), method: "cash", date: o.updatedAt || o.createdAt, note: "Migrare: comandă finalizată înainte de urmărirea plăților", createdByName: "Migrare" }];
      set.paidAmount = round2(o.total);
      set.paymentStatus = "paid";
    } else {
      set.payments = [];
      set.paidAmount = 0;
      set.paymentStatus = (o.total || 0) <= 0 ? "paid" : "unpaid";
    }
  }
  if (o.status === "completed" && !o.completedAt) set.completedAt = o.updatedAt || o.createdAt;
  // Client: legam comenzile vechi (doar nume) de fise de client
  if (!o.customer && o.customerName && o.customerName.trim()) {
    const key = o.customerName.trim().toLowerCase();
    let cid = customerByName.get(key);
    if (!cid) {
      const existing = await col("customers").findOne({ name: { $regex: `^${o.customerName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
      if (existing) cid = existing._id;
      else {
        cid = new mongoose.Types.ObjectId();
        clSeq++;
        if (APPLY) {
          await col("customers").insertOne({
            _id: cid,
            number: `CL-${String(clSeq).padStart(5, "0")}`,
            type: /\b(srl|sa|ii|ÎI|ÎCS|SC)\b/i.test(o.customerName) ? "company" : "individual",
            name: o.customerName.trim(),
            segment: "retail",
            priceType: "retail",
            discount: 0,
            paymentTermDays: 0,
            tags: [],
            active: true,
            source: "store",
            stats: { ordersCount: 0, totalSpent: 0, balance: 0 },
            createdAt: o.createdAt || new Date(),
            updatedAt: new Date(),
          });
        }
        customersCreated++;
      }
      customerByName.set(key, cid);
    }
    set.customer = cid;
  }
  if (Object.keys(set).length) {
    ordersFixed++;
    if (APPLY) await col("orders").updateOne({ _id: o._id }, { $set: set });
  }
}
log(`Comenzi actualizate: ${ordersFixed} din ${orders.length}; clienți creați din numele de pe comenzi: ${customersCreated}`);

/* 2. Statistici clienti ------------------------------------------------------- */
if (APPLY) {
  const SALE = ["processing", "ready", "invoicing", "completed"];
  const agg = await col("orders")
    .aggregate([
      { $match: { customer: { $ne: null }, status: { $nin: ["rejected", "cancelled"] } } },
      {
        $group: {
          _id: "$customer",
          count: { $sum: { $cond: [{ $in: ["$status", SALE] }, 1, 0] } },
          total: { $sum: { $cond: [{ $in: ["$status", SALE] }, "$total", 0] } },
          paid: { $sum: { $cond: [{ $in: ["$status", SALE] }, { $ifNull: ["$paidAmount", 0] }, 0] } },
          last: { $max: "$createdAt" },
        },
      },
    ])
    .toArray();
  for (const a of agg) {
    await col("customers").updateOne(
      { _id: a._id },
      { $set: { "stats.ordersCount": a.count, "stats.totalSpent": round2(a.total), "stats.balance": round2(Math.max(0, a.total - a.paid)), "stats.lastOrderAt": a.last } }
    );
  }
  log(`Statistici recalculate pentru ${agg.length} clienți`);
}
const customers = await col("customers").find({ phone: { $nin: [null, ""] }, phoneNorm: { $exists: false } }).toArray();
for (const c of customers) if (APPLY) await col("customers").updateOne({ _id: c._id }, { $set: { phoneNorm: phoneNorm(c.phone) } });

/* 3. Documente de stoc vechi (o singura linie) -> linii + numere ---------------- */
async function migrateDocs(name, prefix, extra) {
  const docs = await col(name).find({}).sort({ createdAt: 1 }).toArray();
  const withNum = docs.filter((d) => /^[A-Z]+-\d+$/.test(d.number || ""));
  let seq = withNum.reduce((m, d) => Math.max(m, parseInt(d.number.split("-")[1], 10)), 0);
  let n = 0;
  for (const d of docs) {
    const set = {};
    if (!d.number) set.number = `${prefix}-${String(++seq).padStart(6, "0")}`;
    if ((!d.items || !d.items.length) && d.product) {
      const p = await col("products").findOne({ _id: d.product }, { projection: { name: 1, sku: 1, unit: 1, costPrice: 1 } });
      set.items = [{ product: d.product, productName: d.productName || p?.name, sku: p?.sku, unit: p?.unit, quantity: d.quantity, ...extra(d, p) }];
    }
    if (Object.keys(set).length) {
      n++;
      if (APPLY) await col(name).updateOne({ _id: d._id }, { $set: set });
    }
  }
  log(`${name}: ${n} documente completate`);
}
await migrateDocs("stockarrivals", "REC", (d) => ({ unitCost: d.unitCost, lineTotal: d.unitCost ? round2(d.unitCost * d.quantity) : 0 }));
await migrateDocs("transfers", "TRF", () => ({}));
await migrateDocs("writeoffs", "ANL", (d, p) => ({ unitCost: p?.costPrice }));
if (APPLY) {
  for (const d of await col("stockarrivals").find({ total: { $exists: false } }).toArray()) {
    await col("stockarrivals").updateOne({ _id: d._id }, { $set: { total: round2((d.items || []).reduce((s, l) => s + (l.lineTotal || 0), 0)) } });
  }
  for (const d of await col("writeoffs").find({ reasonCode: { $exists: false } }).toArray()) {
    await col("writeoffs").updateOne({ _id: d._id }, { $set: { reasonCode: "other" } });
  }
}

/* 4. Sold initial in registrul de stoc ----------------------------------------- */
const hasLedger = await col("stockmovements").countDocuments({});
if (!hasLedger) {
  const products = await col("products").find({ "stock.0": { $exists: true } }, { projection: { name: 1, sku: 1, stock: 1, costPrice: 1 } }).toArray();
  const rows = [];
  for (const p of products) {
    for (const s of p.stock || []) {
      if ((s.quantity || 0) > 0) {
        rows.push({ product: p._id, productName: p.name, sku: p.sku, warehouse: s.warehouse, quantity: s.quantity, balanceAfter: s.quantity, type: "initial", unitCost: p.costPrice, refType: "Product", refId: p._id, userName: "Migrare", note: "Sold inițial la trecerea pe CRM v2", createdAt: new Date() });
      }
    }
  }
  if (APPLY && rows.length) await col("stockmovements").insertMany(rows);
  log(`Registru de stoc: ${rows.length} solduri inițiale`);
}

/* 5. Setari: eliminam campul Make, depozit implicit -------------------------- */
const settings = await col("settings").findOne({});
if (settings) {
  const set = {};
  if (!settings.defaultWarehouse) {
    const w = await col("warehouses").find({}).sort({ createdAt: 1 }).limit(1).toArray();
    if (w[0]) set.defaultWarehouse = w[0]._id;
  }
  if (APPLY) await col("settings").updateOne({ _id: settings._id }, { ...(Object.keys(set).length ? { $set: set } : {}), $unset: { makeWebhookUrl: "" } });
  log("Setări: câmpul Make eliminat" + (set.defaultWarehouse ? ", depozit implicit setat" : ""));
}

if (APPLY) await col("migrations").updateOne({ _id: "v2" }, { $set: { at: new Date() } }, { upsert: true });
console.log(APPLY ? "\nMigrarea v2 a fost aplicată." : "\nSimulare încheiată. Rulați cu --apply pentru a aplica.");
await mongoose.disconnect();
