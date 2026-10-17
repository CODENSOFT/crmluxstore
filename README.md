# Lux Store CRM

CRM pentru **Lux Store** (luxstore.md, Chișinău) — magazin de chimie auto, spumă activă, produse de detailing, parfumuri auto, echipamente și piese pentru spălătorii self-service.

Comenzi din magazin, site, telefon și B2B · clienți și condiții comerciale · stoc pe depozite cu registru complet · recepții, transferuri, casări, inventariere · plăți și datorii · rapoarte · integrare directă cu site-ul (WooCommerce) și pregătire completă pentru 1C — **fără Make sau alte servicii intermediare**.

Construit cu **Next.js 16 (App Router) + MongoDB (Mongoose) + Tailwind CSS 4**, găzduit pe Vercel.

---

## Module

| Modul | Ce face |
|---|---|
| **Panou** | Vânzări azi / luna (vs. luna trecută), marjă, de încasat, grafic 30 zile, canale, top produse și clienți, stoc critic, comenzi de procesat, sarcinile mele |
| **Comenzi** | Flux: Nouă → (Așteaptă aprobare) → În pregătire → Gata → Livrare & facturare → Finalizată; anulare cu retur automat în stoc. Prețuri amănunt / angro pe client, reduceri, livrare, TVA, plăți parțiale, scadențe, notă internă, cereri de modificare cu aprobare, repetare comandă, factură / aviz / fișă de depozit tipărite (cu suma în litere) |
| **Clienți** | Persoane fizice și juridice (IDNO, IBAN), segmente (spălătorii self-service, detailing, service, revânzători…), tip preț, reducere implicită, termen de plată, istoric, produse preferate, datorii, sarcini |
| **Produse** | Categorii, mărci, SKU, cod de bare (scaner), preț amănunt / angro / achiziție cu marjă, cotă TVA, stoc minim, seturi (kit-uri), fotografii, import / export Excel (CSV), registru de mișcări |
| **Stoc** | Matrice produs × depozit, valoare la vânzare / cost, listă „de comandat” (pe baza vânzărilor din 30 zile), registrul tuturor mișcărilor |
| **Recepții / Transferuri / Casări** | Documente cu mai multe linii, numerotate (REC-, TRF-, ANL-), cu actualizarea prețului de achiziție și motive de casare |
| **Inventariere** | Fișă de numărare (și pentru scaner), plusuri / lipsuri, diferență valorică, corectarea automată a stocului |
| **Furnizori / Depozite** | Contacte, condiții, istoric recepții; depozite (depozit, magazin, mașină), depozit implicit, stoc publicat pe site |
| **Sarcini** | Tablou Kanban cu drag & drop, termene, priorități, legate de clienți / comenzi, notificări |
| **Rapoarte** | Vânzări (zi / săptămână / lună, categorii, canale, manageri, metode de plată), produse (clasificare ABC, stoc fără mișcare), clienți, datorii (cu restanțe), stoc, casări — export Excel |
| **Integrări** | Site luxstore.md (WooCommerce), chei API, API v1 pentru 1C, webhook-uri de ieșire semnate, jurnal de sincronizare |
| **Administrare** | Utilizatori (admin / manager), istoric activitate, setări companie / TVA / livrare / stoc |

Extra: căutare globală **Ctrl/⌘ + K**, tasta **N** = comandă nouă, temă luminoasă / întunecată, interfață adaptată pentru telefon.

---

## Pornire locală

```bash
npm install
cp .env.example .env.local    # completați MONGODB_URI și JWT_SECRET
npm run dev                   # http://localhost:3030
```

La prima pornire se creează automat contul de administrator (din `SEED_ADMIN_*`), categoriile magazinului și un depozit implicit.

| Variabilă | Rol |
|---|---|
| `MONGODB_URI` | Baza de date MongoDB (Atlas) |
| `JWT_SECRET` | Secret pentru sesiuni |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Contul de admin creat la prima pornire |
| `CRM_API_KEY` | Opțional — cheie API „master” (de preferat cheile create din Integrări) |
| `CRON_SECRET` | Opțional — protejează sincronizarea zilnică `/api/cron/sync` |

`MAKE_API_KEY` / `MAKE_WEBHOOK_URL` nu mai sunt folosite și pot fi șterse din Vercel.

---

## Trecerea de la versiunea veche (date existente)

După publicare, rulați o singură dată migrarea (completează câmpurile noi, creează fișe de client din numele de pe comenzile vechi, numerotează documentele de stoc și pune soldul inițial în registrul de stoc):

```bash
node --env-file=.env.local scripts/migrate-v2.mjs           # simulare — arată ce se va schimba
node --env-file=.env.local scripts/migrate-v2.mjs --apply   # aplică
```

Comenzile vechi cu status „Complet” sunt considerate achitate (versiunea veche nu urmărea plățile).

---

## Integrări (fără Make)

### Site luxstore.md (WooCommerce)
CRM → **Integrări → Site luxstore.md**: adresa site-ului + cheile REST API WooCommerce (Citire/Scriere) → **Salvează** → **Creează automat webhook-urile**.
- Comenzile de pe site intră instant (webhook semnat HMAC) ca „Nouă de pe site”, cu clientul găsit / creat după telefon sau email.
- Opțional: stocul se publică pe site la fiecare mișcare; statusul comenzii (finalizată / anulată) se actualizează pe site.
- Plasă de siguranță: sincronizare zilnică automată (Vercel Cron) + buton „Sincronizează comenzile”.

### 1C
API REST v1 la `/api/v1`, cu chei create din **Integrări → API și chei** (tip 1C).
Documentația completă pentru programatorul 1C (flux, JSON, exemple de cod BSL): **[`public/docs/INTEGRARE-1C.md`](public/docs/INTEGRARE-1C.md)** — disponibilă și în aplicație la `/docs/INTEGRARE-1C.md`. Specificația OpenAPI: `/api/v1/openapi.json`.

### Webhook-uri de ieșire
Evenimente (comandă creată / modificată, plată, stoc modificat, produs, client, recepție…) trimise prin POST JSON către orice adresă, semnate cu `X-Lux-Signature: sha256=HMAC`.

---

## Teste

```bash
# pe o bază de date de TEST goală:
MONGODB_URI=mongodb://localhost:27017/crm-test npm run dev
B=http://localhost:3030 node scripts/smoke.mjs     # ~96 verificări end-to-end
```

---

## Structura proiectului

```
app/
  (app)/              paginile aplicației (panou, comenzi, clienți, produse, stoc, ...)
  api/                API intern (sesiune) + api/v1 (extern, chei API) + webhooks + cron
  print/              documente tipăribile (factură, aviz, fișă de depozit)
  login/              autentificare
  _components/        kit UI (ui, overlay, table, charts, pickers, icons)
lib/                  logica de business: orderService, stock (registru atomic), stockDocs,
                      pricing, customers, woo, apiV1, openapi, events (webhook-uri), dto
models/               schemele Mongoose
public/docs/          documentația pentru integrarea 1C
scripts/              migrare v2, test end-to-end, resetare admin
proxy.js              protecția paginilor (sesiune)
```
