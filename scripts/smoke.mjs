// Test complet end-to-end al API-ului (comenzi, stoc, aprobari, plati, inventariere, API v1 / 1C, webhook site).
// ATENTIE: ruleaza DOAR pe o baza de date de test goala (creeaza si sterge date).
//   1) porniti serverul cu o baza de test:  POSTGRES_URL=postgres://postgres:postgres@localhost:5432/crm_test npm run dev
//   2) B=http://localhost:3030 node scripts/smoke.mjs
import crypto from "node:crypto";
const B = process.env.B || "http://localhost:3031";
let fails = 0;
const jars = {};
async function call(who, method, path, body, headers = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", ...(jars[who] ? { cookie: jars[who] } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect: "manual",
  });
  const sc = res.headers.getSetCookie?.() || [];
  for (const c of sc) if (c.startsWith("crm_session=")) jars[who] = c.split(";")[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ...json };
}
function check(name, cond, extra) {
  if (cond) console.log("✅", name);
  else { fails++; console.log("❌", name, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
}
const stockOf = (p, w) => (p.stock || []).find((s) => String(s.warehouse?._id || s.warehouse) === String(w))?.quantity ?? 0;

let r = await call("a", "POST", "/api/auth/login", { email: "admin@crm.local", password: "admin123" });
check("login admin", r.ok, r);
r = await call("a", "GET", "/api/warehouses");
check("depozit implicit seed", r.ok && r.data.length >= 1, r);
const WA = r.data[0]._id;
r = await call("a", "GET", "/api/categories");
check("categorii seed", r.ok && r.data.length >= 10, r);
const CAT = r.data[0]._id;
r = await call("a", "POST", "/api/warehouses", { name: "Magazin Lunca Bîcului", code: "MAG", type: "store" });
check("creare depozit B", r.ok, r);
const WB = r.data._id;

r = await call("a", "POST", "/api/products", {
  name: "Koch-Chemie Green Star 11 kg", sku: "KC-GS-11", unit: "bucata", price: 1450, wholesalePrice: 1300, costPrice: 980,
  category: CAT, brand: "Koch-Chemie", initialStock: [{ warehouse: WA, quantity: 100 }],
});
check("creare produs cu stoc initial", r.ok && stockOf(r.data, WA) === 100, r);
const P1 = r.data._id;
r = await call("a", "POST", "/api/products", { name: "Spumă activă PINK Self 20 L", sku: "PINK-20", unit: "bucata", price: 1890, costPrice: 1200, minStock: 3 });
const P2 = r.data._id;
r = await call("a", "POST", "/api/products", { name: "dublura sku", sku: "kc-gs-11" });
check("SKU duplicat respins", !r.ok && r.status === 400, r);

r = await call("a", "POST", "/api/customers", { type: "company", name: "SRL AquaWash Self-Service", phone: "+373 69 123 456", idno: "1003600012345", segment: "carwash", priceType: "wholesale", discount: 5, paymentTermDays: 14 });
check("creare client B2B", r.ok && r.data.number, r);
const C1 = r.data._id;
r = await call("a", "POST", "/api/customers", { name: "Alt nume", phone: "069123456" });
check("client duplicat detectat (telefon)", r.status === 409, r);

r = await call("a", "POST", "/api/orders", { customer: C1, items: [{ product: P1, warehouse: WA, quantity: 10 }], delivery: { method: "courier_chisinau" }, paymentMethod: "transfer" });
check("comanda admin -> in pregatire", r.ok && r.data.status === "processing", r);
const O1 = r.data._id;
check("pret angro + reducere client 5%", r.ok && r.data.items[0].unitPrice === 1300 && r.data.items[0].discount === 5 && r.data.items[0].lineTotal === 12350, r.data?.items);
check("total = linii + livrare 150", r.ok && r.data.total === 12500, r.data?.total);
check("TVA inclus calculat", r.ok && Math.abs(r.data.vatTotal - 2083.33) < 0.02, r.data?.vatTotal);
check("scadenta din termenul clientului", r.ok && !!r.data.dueDate, r.data?.dueDate);
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc scazut la 90", stockOf(r.data, WA) === 90, r.data?.stock);

r = await call("a", "POST", "/api/orders", { items: [{ product: P1, warehouse: WA, quantity: 1000 }] });
check("stoc insuficient respins", !r.ok && /Stoc insuficient/.test(r.error), r);

r = await call("a", "POST", "/api/users", { name: "Ana Manager", email: "ana@luxstore.md", password: "parola123", role: "manager" });
check("creare manager", r.ok, r);
const MID = r.data._id;
r = await call("m", "POST", "/api/auth/login", { email: "ana@luxstore.md", password: "parola123" });
check("login manager", r.ok, r);
r = await call("m", "POST", "/api/orders", { customerName: "Ion Rusu", customerPhone: "079555111", items: [{ product: P1, warehouse: WA, quantity: 5 }] });
check("comanda manager -> asteapta aprobare", r.ok && r.data.status === "pending_approval", r);
const O2 = r.data._id;
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc neschimbat inainte de aprobare", stockOf(r.data, WA) === 90, r.data?.stock);
r = await call("m", "PATCH", `/api/orders/${O2}`, { action: "approve" });
check("managerul nu poate aproba", r.status === 403, r);
r = await call("m", "GET", `/api/orders/${O1}`);
check("managerul nu vede comanda altuia", r.status === 403, r);
r = await call("a", "GET", "/api/notifications?read=0");
check("admin notificat pentru aprobare", r.ok && r.data.items.some((n) => n.type === "order_approval"), r.data?.items?.map((n) => n.type));
r = await call("a", "PATCH", `/api/orders/${O2}`, { action: "approve" });
check("admin aproba", r.ok && r.data.status === "processing", r);
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc 85 dupa aprobare", stockOf(r.data, WA) === 85, r.data?.stock);
r = await call("m", "PATCH", `/api/orders/${O2}`, { edit: { items: [{ product: P1, warehouse: WA, quantity: 6 }] } });
check("manager propune modificare (in lucru)", r.ok && !!r.data.pendingEdit, r);
r = await call("a", "PATCH", `/api/orders/${O2}`, { action: "approve_edit" });
check("admin aproba modificarea", r.ok && !r.data.pendingEdit && r.data.items[0].quantity === 6, r);
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc 84 dupa modificare", stockOf(r.data, WA) === 84, r.data?.stock);

r = await call("a", "POST", `/api/orders/${O1}/payments`, { amount: 5000, method: "transfer" });
check("plata partiala", r.ok && r.data.paymentStatus === "partial" && r.data.paidAmount === 5000, r);
r = await call("a", "POST", `/api/orders/${O1}/payments`, { amount: 99999 });
check("plata peste rest respinsa", !r.ok, r);
r = await call("a", "POST", `/api/orders/${O1}/payments`, { amount: 7500, method: "transfer" });
check("plata integrala", r.ok && r.data.paymentStatus === "paid", r);
for (const st of ["ready", "invoicing", "completed"]) {
  r = await call("a", "PATCH", `/api/orders/${O1}`, { action: "stage", stage: st });
  check(`stadiu ${st}`, r.ok && r.data.status === st, r);
}
r = await call("a", "GET", `/api/customers/${C1}`);
check("statistici client actualizate", r.ok && r.data.stats.ordersCount === 1 && r.data.stats.totalSpent === 12500 && r.data.stats.balance === 0, r.data?.stats);

r = await call("a", "PATCH", `/api/orders/${O2}`, { action: "cancel", reason: "Clientul a renunțat" });
check("anulare comanda -> stoc returnat", r.ok && r.data.status === "cancelled", r);
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc 90 dupa anulare", stockOf(r.data, WA) === 90, r.data?.stock);

r = await call("a", "POST", "/api/transfers", { fromWarehouse: WA, toWarehouse: WB, items: [{ product: P1, quantity: 20 }] });
check("transfer", r.ok && r.data.number, r);
r = await call("a", "POST", "/api/writeoffs", { warehouse: WB, reasonCode: "damaged", items: [{ product: P1, quantity: 2 }] });
check("casare", r.ok && r.data.totalCost === 1960, r);
r = await call("a", "POST", "/api/suppliers", { name: "Koch-Chemie Distribuție RO", country: "România" });
const S1 = r.data._id;
r = await call("a", "POST", "/api/arrivals", { warehouse: WA, supplierId: S1, supplierInvoice: "FV-2231", items: [{ product: P2, quantity: 12, unitCost: 1150 }, { product: P1, quantity: 30, unitCost: 990 }] });
check("receptie multi-linie", r.ok && r.data.total === 13800 + 29700, r);
r = await call("a", "GET", `/api/products/${P1}`);
check("stocuri: A=100, B=18, cost actualizat", stockOf(r.data, WA) === 100 && stockOf(r.data, WB) === 18 && r.data.costPrice === 990, { stock: r.data?.stock, cost: r.data?.costPrice });

r = await call("a", "POST", "/api/inventory", { warehouse: WB });
check("inventariere creata", r.ok && r.data.items.length >= 2, r);
const INV = r.data._id;
r = await call("a", "PATCH", `/api/inventory/${INV}`, { items: [{ product: P1, counted: 17 }] });
check("inventariere salvata", r.ok, r);
r = await call("a", "POST", `/api/inventory/${INV}`, { action: "complete" });
check("inventariere finalizata", r.ok && r.data.status === "completed" && r.data.summary.shortage === 1, r.data?.summary);
r = await call("a", "GET", `/api/products/${P1}`);
check("stoc B=17 dupa inventariere", stockOf(r.data, WB) === 17, r.data?.stock);

r = await call("a", "GET", `/api/movements?product=${P1}`);
check("registru miscari", r.ok && r.data.total >= 7, r.data?.total);
r = await call("a", "GET", "/api/stock");
check("situatie stoc", r.ok && r.data.rows.length >= 2, r);
r = await call("a", "GET", "/api/stock?view=reorder");
check("lista de comandat", r.ok, r);
r = await call("a", "GET", "/api/dashboard");
check("dashboard", r.ok && r.data.chart.length === 30 && r.data.month.revenue === 12500, r.data?.month);
for (const t of ["sales", "products", "customers", "debts", "stock", "writeoffs"]) {
  r = await call("a", "GET", `/api/reports/${t}`);
  check(`raport ${t}`, r.ok, r);
}
r = await call("a", "GET", "/api/search?q=koch");
check("cautare globala", r.ok && r.data.products.length >= 1, r);
r = await call("a", "GET", "/api/orders?status=open");
check("lista comenzi + contoare", r.ok && r.data.counts, r);
r = await call("a", "GET", "/api/products?status=low");
check("filtru stoc scazut", r.ok, r);

// ---------- API v1 (1C) ----------
r = await call("a", "POST", "/api/integrations/api-keys", { name: "1C Contabilitate", kind: "1c" });
check("creare cheie API 1C", r.ok && r.data.key, r);
const KEY = r.data.key;
const K = { "X-API-Key": KEY };
r = await call("x", "GET", "/api/v1/ping", undefined, K);
check("v1 ping", r.ok && r.data.kind === "1c", r);
r = await call("x", "GET", "/api/v1/ping", undefined, { "X-API-Key": "gresit" });
check("v1 cheie invalida -> 401", r.status === 401, r);
r = await call("x", "POST", "/api/v1/warehouses", { items: [{ externalId: "1c-wh-1", code: "DEP-1", name: "Depozit principal" }] }, K);
check("v1 depozite upsert (leaga dupa cod)", r.ok && r.data.updated === 1, r);
r = await call("x", "POST", "/api/v1/products", {
  items: [
    { externalId: "1c-p-001", sku: "KC-GS-11", name: "Koch-Chemie Green Star 11 kg", price: 1499 },
    { externalId: "1c-p-002", sku: "FOX-FOAM-5", name: "FOX LINE Spumă activă 5 L", price: 420, categoryName: "Spumă activă & detergenți", stock: [{ warehouse: "1c-wh-1", quantity: 40 }] },
    { sku: "fara-nume" },
  ],
}, K);
check("v1 produse upsert lot", r.ok && r.data.updated === 1 && r.data.created === 1 && r.data.errors === 1, r.data);
r = await call("x", "GET", "/api/v1/products?updatedSince=2000-01-01T00:00:00Z&limit=2", undefined, K);
check("v1 lista produse paginata", r.ok && r.data.length === 2 && r.meta.hasMore, r.meta);
r = await call("x", "POST", "/api/v1/stock", { mode: "set", items: [{ productExternalId: "1c-p-002", warehouse: "DEP-1", quantity: 35 }] }, K);
check("v1 setare stoc", r.ok && r.data.results[0].change === -5, r.data);
r = await call("x", "GET", "/api/v1/orders?exported=0", undefined, K);
check("v1 comenzi neexportate", r.ok && r.data.length >= 1 && r.data[0].items[0].productExternalId === "1c-p-001", r.data?.[0]?.items);
const toExport = r.data[0].id;
r = await call("x", "POST", `/api/v1/orders/${toExport}/export`, { docNumber: "RL-00045", docId: "uuid-1c" }, K);
check("v1 confirmare export 1C", r.ok && r.data.export1c.exported, r);
r = await call("x", "POST", "/api/v1/orders", { externalId: "1c-ord-77", status: "processing", customer: { externalId: "1c-c-9", name: "SRL Detailing Pro", idno: "1009600099999" }, items: [{ productExternalId: "1c-p-002", quantity: 3 }] }, K);
check("v1 creare comanda", r.status === 201 && r.data.status === "processing" && r.data.channel === "1c", r);
r = await call("x", "POST", "/api/v1/orders", { externalId: "1c-ord-77", items: [{ productExternalId: "1c-p-002", quantity: 3 }] }, K);
check("v1 comanda idempotenta", r.ok && r.meta?.duplicate, r);
r = await call("x", "POST", "/api/v1/arrivals", { externalId: "1c-rec-5", warehouse: "1c-wh-1", supplier: "Fox Line SRL", items: [{ sku: "FOX-FOAM-5", quantity: 10, unitCost: 260 }] }, K);
check("v1 receptie", r.status === 201, r);
r = await call("x", "GET", "/api/v1/movements?since=2000-01-01T00:00:00Z&limit=5", undefined, K);
check("v1 registru miscari", r.ok && r.data.length === 5 && r.meta.nextSince, r.meta);
r = await call("x", "GET", "/api/v1/openapi.json");
check("v1 openapi", r.openapi === "3.1.0", Object.keys(r));
r = await call("x", "GET", "/api/v1/nimic", undefined, K);
check("v1 404", r.status === 404, r);
r = await call("a", "GET", "/api/integrations/logs?source=1c");
check("jurnal integrare 1C", r.ok && r.data.items.length >= 3, r.data?.total);

// ---------- Site WooCommerce (webhook semnat) ----------
r = await call("a", "PUT", "/api/integrations/woo", { enabled: true, url: "https://luxstore.example", consumerKey: "ck_test", consumerSecret: "cs_test", importOrders: true });
check("configurare site", r.ok && r.data.webhookSecret, r);
const SECRET = r.data.webhookSecret;
const wo = {
  id: 9123, number: "9123", status: "processing", total: "1040.00", shipping_total: "150.00", payment_method: "cod", payment_method_title: "Ramburs",
  billing: { first_name: "Maria", last_name: "Ceban", phone: "+37360111222", email: "maria@example.md", city: "Chișinău", address_1: "str. Ismail 10" },
  shipping: { city: "Chișinău", address_1: "str. Ismail 10" },
  shipping_lines: [{ method_id: "flat_rate", method_title: "Curier Chișinău", total: "150.00" }],
  line_items: [
    { product_id: 501, sku: "FOX-FOAM-5", name: "FOX LINE Spumă activă 5 L", quantity: 2, total: "840.00", total_tax: "0" },
    { product_id: 777, sku: "AIR-MIAMI", name: "Parfum auto Miami", quantity: 1, total: "50.00", total_tax: "0" },
  ],
  customer_note: "Sunați înainte",
};
const raw = JSON.stringify(wo);
const sig = crypto.createHmac("sha256", SECRET).update(raw).digest("base64");
r = await call("w", "POST", "/api/webhooks/woo", raw, { "X-WC-Webhook-Signature": sig, "X-WC-Webhook-Topic": "order.created" });
check("webhook site -> comanda importata", r.ok && r.result === "created", r);
r = await call("w", "POST", "/api/webhooks/woo", raw, { "X-WC-Webhook-Signature": sig, "X-WC-Webhook-Topic": "order.updated" });
check("webhook site idempotent", r.ok && r.result === "unchanged", r);
r = await call("w", "POST", "/api/webhooks/woo", raw, { "X-WC-Webhook-Signature": "gresit", "X-WC-Webhook-Topic": "order.created" });
check("webhook semnatura invalida -> 401", r.status === 401, r);
r = await call("w", "POST", "/api/webhooks/woo", "webhook_id=12");
check("webhook ping", r.ok, r);
r = await call("a", "GET", "/api/orders?channel=site");
check("comanda site in lista (Nouă)", r.ok && r.data.items[0]?.status === "new" && r.data.items[0].total === 1040, r.data?.items?.[0]);
const SITE = r.data.items[0]._id;
r = await call("m", "GET", `/api/orders/${SITE}`);
check("managerul vede comanda noua de pe site (casuta comuna)", r.ok, r);
r = await call("m", "PATCH", `/api/orders/${SITE}`, { action: "approve" });
check("managerul poate confirma comanda de pe site (verificare stoc)", !r.ok && r.status === 400 && /Stoc insuficient/.test(r.error), r);
const cancelled = JSON.stringify({ ...wo, status: "cancelled" });
r = await call("w", "POST", "/api/webhooks/woo", cancelled, { "X-WC-Webhook-Signature": crypto.createHmac("sha256", SECRET).update(cancelled).digest("base64"), "X-WC-Webhook-Topic": "order.updated" });
check("anulare pe site -> anulata in CRM", r.ok && r.result === "cancelled", r);

// ---------- Webhook de iesire ----------
r = await call("a", "POST", "/api/integrations/webhooks", { name: "Test", url: `${B}/api/v1/ping`, events: ["order.created"] });
check("creare webhook iesire", r.ok && r.data.secret, r);
r = await call("a", "POST", `/api/integrations/webhooks/${r.data._id}`);
check("test webhook (livrare jurnalizata)", r.ok && r.data.status, r);

r = await call("a", "DELETE", `/api/orders/${SITE}`);
check("stergere comanda", r.ok, r);
r = await call("m", "GET", "/api/integrations/overview");
check("manager blocat la integrari", r.status === 403, r);
r = await call("a", "PATCH", `/api/users/${MID}`, { active: false });
r = await call("m", "GET", "/api/auth/me");
check("cont dezactivat -> sesiune invalida imediat", r.status === 401, r);

console.log(fails ? `\n${fails} ESECURI` : "\nTOATE TESTELE AU TRECUT");
process.exit(fails ? 1 : 0);
