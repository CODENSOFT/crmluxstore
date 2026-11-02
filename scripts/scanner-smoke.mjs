// Test end-to-end al integrarii cu scanerele (API v1 /scanner + rutele interne din pagina Scanare).
// ATENTIE: ruleaza DOAR pe o baza de date de test goala. NICIODATA pe site.
//   1) NOU_POSTGRES_URL= POSTGRES_URL=postgres://…/crm_test npx next start -p 3032
//   2) B=http://localhost:3032 node --env-file=.env.local scripts/scanner-smoke.mjs
const B = process.env.B || "http://localhost:3032";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(B)) throw new Error(`Testele ruleaza doar pe un server local, nu pe ${B}`);
const ADMIN = { email: process.env.SMOKE_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@crm.local", password: process.env.SMOKE_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD };
if (!ADMIN.password) throw new Error("Lipseste parola administratorului de test (rulati cu --env-file=.env.local)");

let fails = 0;
let jar = "";
let KEY = "";
async function call(method, path, body, { api } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { "Content-Type": "application/json", ...(api ? { "X-API-Key": api } : jar ? { cookie: jar } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const c of res.headers.getSetCookie?.() || []) if (c.startsWith("crm_session=")) jar = c.split(";")[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ...json };
}
const v1 = (m, p, b) => call(m, "/api/v1" + p, b, { api: KEY });
function check(name, cond, extra) {
  if (cond) console.log("✅", name);
  else { fails++; console.log("❌", name, extra !== undefined ? JSON.stringify(extra).slice(0, 700) : ""); }
}
const stockAt = async (pid, wid) => {
  const r = await call("GET", `/api/products/${pid}`);
  return (r.data.stock || []).find((s) => String(s.warehouse?._id || s.warehouse) === String(wid))?.quantity ?? 0;
};

let r = await call("POST", "/api/auth/login", ADMIN);
check("login admin", r.ok, r);
r = await call("GET", "/api/warehouses");
const WA = r.data[0]._id;
r = await call("POST", "/api/warehouses", { name: "Magazin test", code: "MAG", type: "store" });
const WB = r.data._id;
r = await call("POST", "/api/products", { name: "Green Star 11 kg", sku: "KC-GS-11", barcode: "4004764700038", unit: "bucata", price: 1450, initialStock: [{ warehouse: WA, quantity: 100 }] });
check("produs 1 cu cod de bare", r.ok, r);
const P1 = r.data._id;
r = await call("POST", "/api/products", { name: "Spumă PINK 20 L", sku: "PINK-20", unit: "bucata", price: 1890 });
const P2 = r.data._id;

// coduri suplimentare
r = await call("POST", `/api/products/${P1}/barcodes`, { code: "14004764700035", multiplier: 4, note: "bax" });
check("cod de bax adaugat", r.ok && r.data.length === 1 && r.data[0].multiplier === 4, r);
r = await call("POST", `/api/products/${P2}/barcodes`, { code: "14004764700035" });
check("cod folosit de alt produs respins", !r.ok && r.status === 400, r);
r = await call("POST", `/api/products/${P2}/barcodes`, { code: "4004764700038" });
check("codul principal al altui produs respins", !r.ok && r.status === 400, r);

// cheie de scaner
r = await call("POST", "/api/integrations/api-keys", { name: "TSD test", kind: "scanner", scopes: ["read", "write"] });
check("cheie scaner creata", r.ok && r.data.key, r);
KEY = r.data.key;

r = await v1("GET", "/scanner");
check("GET /scanner", r.ok && r.data.kind === "scanner" && r.data.warehouses.length >= 2 && r.data.operations.length === 6, r);
r = await v1("GET", "/products");
check("cheia de scaner nu are acces la /products", r.status === 403, r);
r = await v1("GET", "/ping");
check("ping cu cheia de scaner", r.ok, r);

r = await v1("GET", "/scanner/lookup?code=04004764700038&warehouse=" + WA);
check("lookup GTIN-14 cu zerouri -> produs, stoc 100", r.ok && r.data.found && r.data.product.id === P1 && r.data.product.quantityInWarehouse === 100, r);
r = await v1("GET", "/scanner/lookup?code=kc-gs-11");
check("lookup dupa SKU (litere mici)", r.ok && r.data.found && r.data.matchedBy === "sku", r);
r = await v1("GET", "/scanner/lookup?code=14004764700035");
check("lookup cod bax -> multiplicator 4", r.ok && r.data.multiplier === 4, r);
r = await v1("GET", "/scanner/lookup?code=999");
check("lookup cod necunoscut", r.ok && r.data.found === false, r);
r = await v1("GET", "/scanner/catalog?limit=1");
check("catalog paginat", r.ok && r.data.length === 1 && r.meta.total >= 2 && r.meta.hasMore, r);

// receptie aplicata direct: 3 + bax 2×4 = 11
r = await v1("POST", "/scanner/sessions", { operation: "arrival", warehouse: "MAG", externalId: "T-1", device: "TSD-1", items: [{ code: "4004764700038", quantity: 2 }, { code: "4004764700038" }, { code: "14004764700035", quantity: 2 }], apply: true });
check("receptie aplicata", r.status === 201 && r.data.status === "applied" && r.data.result?.docType === "arrival", r);
check("stoc MAG = 11", (await stockAt(P1, WB)) === 11);
r = await v1("POST", "/scanner/sessions", { operation: "arrival", warehouse: "MAG", externalId: "T-1", items: [{ code: "4004764700038", quantity: 2 }], apply: true });
check("retrimitere = duplicat, fara dublare", r.status === 200 && r.meta.duplicate === true, r);
check("stoc MAG tot 11", (await stockAt(P1, WB)) === 11);

// casare cu stoc insuficient -> sesiune salvata cu applyError
r = await v1("POST", "/scanner/sessions", { operation: "writeoff", warehouse: "MAG", externalId: "T-2", items: [{ code: "4004764700038", quantity: 50 }], options: { reasonCode: "damaged" }, apply: true });
check("casare peste stoc -> salvata cu applyError", r.ok && r.data.status === "error" && r.meta.applyError, r);

// cod necunoscut -> pending, apoi legare din CRM + aplicare
r = await v1("POST", "/scanner/sessions", { operation: "transfer", warehouse: WA, toWarehouse: "MAG", externalId: "T-3", items: [{ code: "4004764700038", quantity: 5 }, { code: "UNK-777", quantity: 2 }], apply: true });
check("transfer cu cod necunoscut -> pending", r.ok && r.data.status === "pending" && r.data.unknownCount === 1 && r.meta.applyError, r);
const S3 = r.data.id;
r = await v1("GET", "/scanner/sessions/T-3");
check("GET sesiune dupa externalId", r.ok && r.data.id === S3, r);
r = await call("PATCH", `/api/scanner/sessions/${S3}`, { action: "link", code: "UNK-777", productId: P1, saveBarcode: true });
check("legare cod necunoscut", r.ok && r.data.unknownCount === 0, r);
r = await call("PATCH", `/api/scanner/sessions/${S3}`, { action: "apply" });
check("aplicare transfer din CRM", r.ok && r.data.status === "applied", r);
check("stoc dupa transfer: A=93, MAG=18", (await stockAt(P1, WA)) === 93 && (await stockAt(P1, WB)) === 18);
r = await v1("GET", "/scanner/lookup?code=UNK-777");
check("codul legat e salvat la produs", r.ok && r.data.found && r.data.matchedBy === "extra", r);

// inventariere: fisa noua din scanare
r = await call("POST", "/api/inventory", { warehouse: WA });
check("fisa inventariere", r.ok, r);
const INV = r.data._id;
r = await v1("GET", "/scanner/inventories");
check("inventarieri deschise", r.ok && r.data.some((i) => i.id === INV), r);
r = await v1("GET", `/scanner/inventories/${INV}?blind=1`);
check("linii inventariere blind (fara expected)", r.ok && r.data.lines.length >= 1 && !("expected" in r.data.lines[0]), r);
r = await v1("POST", "/scanner/sessions", { operation: "inventory", inventoryId: INV, items: [{ code: "4004764700038", quantity: 90 }], options: { mode: "set" }, apply: true });
check("inventariere: cantitate setata", r.ok && r.data.status === "applied", r);
r = await v1("POST", "/scanner/sessions", { operation: "inventory", inventoryId: INV, items: [{ code: "KC-GS-11", quantity: 2 }], options: { mode: "add" }, apply: true });
r = await call("GET", `/api/inventory/${INV}`);
const line = r.data.items.find((l) => String(l.product) === String(P1));
check("inventariere: mode add = 92", line?.counted === 92, line);

// sesiune din CRM (pagina Scanare) + lista
r = await call("POST", "/api/scanner/sessions", { operation: "list", items: [{ code: "4004764700038" }, { code: "nimic" }] });
check("lista din CRM salvata", r.ok && r.data.status === "pending" && r.data.unknownCount === 1, r);
r = await call("PATCH", `/api/scanner/sessions/${r.data._id}`, { action: "reject" });
check("respingere", r.ok && r.data.status === "rejected", r);
r = await call("GET", "/api/scanner/sessions?status=pending");
check("lista sesiuni + contoare", r.ok && Array.isArray(r.data.items) && r.data.counts, r);
r = await call("GET", "/api/scanner/lookup?code=4004764700038");
check("lookup intern", r.ok && r.data.found, r);
r = await call("GET", "/api/scanner/context");
check("context pagina Scanare", r.ok && Array.isArray(r.data.orders) && Array.isArray(r.data.inventories), r);
r = await call("GET", "/api/integrations/overview");
check("overview are sectiunea scanner", r.ok && r.data.scanner.sessions >= 5 && r.data.scanner.extraBarcodes === 2, r);
r = await call("DELETE", `/api/products/${P1}/barcodes?code=UNK-777`);
check("stergere cod suplimentar", r.ok, r);

console.log(fails ? `\n${fails} teste esuate` : "\nToate testele au trecut");
process.exit(fails ? 1 : 0);
