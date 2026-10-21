# Lux Store CRM

CRM pentru **Lux Store** (luxstore.md, Chișinău) — magazin de chimie auto, spumă activă, produse de detailing, parfumuri auto, echipamente și piese pentru spălătorii self-service.

Comenzi din magazin, site, telefon și B2B · clienți și condiții comerciale · stoc pe depozite cu registru complet · recepții, transferuri, casări, inventariere · plăți și datorii · rapoarte · integrare directă cu site-ul (WooCommerce) și pregătire completă pentru 1C — **fără Make sau alte servicii intermediare**.

Construit cu **Next.js 16 (App Router) + Postgres (Supabase) + Tailwind CSS 4**, găzduit pe Vercel.

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
| **Integrări** | Site luxstore.md (WooCommerce), bot Telegram pentru clienți, chei API, API v1 pentru 1C, webhook-uri de ieșire semnate, jurnal de sincronizare |
| **Bot Telegram** | Catalog pe categorii cu foto, descriere, preț și stoc; coș; verifică stocul (dacă clientul cere mai mult, îi propune cantitatea disponibilă); telefon + livrare / ridicare; comanda intră în CRM cu sursa „Bot Telegram”; clientul primește statusul; română și rusă |
| **Prețuri individuale** | Pe fiecare client: produsele cumpărate des, cu prețul lui; comenzile clientului (și botul) folosesc automat aceste prețuri |
| **Limbă** | Interfața în română (implicit) sau rusă — fiecare utilizator alege din profil; documentele tipărite rămân în română. Texte noi: `node scripts/i18n-extract.mjs` arată ce lipsește din `lib/i18n/ru/` |
| **Administrare** | Utilizatori și drepturi (administrator / angajat + drepturi suplimentare pe persoană), istoric activitate, setări companie / TVA / livrare / stoc |

Import de produse din **Excel (.xlsx)** sau CSV, cu recunoașterea automată a coloanelor; publicarea produselor noi pe site se face **manual**, din butonul „Publică pe site” (nimic automat).

Extra: căutare globală **Ctrl/⌘ + K**, tasta **N** = comandă nouă, temă luminoasă / întunecată, interfață adaptată pentru telefon.

---

## Roluri și drepturi

- **Administrator principal** (unul singur) — tot, plus: creează / modifică administratorii, Setări și Integrări.
- **Administrator** — acces complet la lucru (comenzi, stoc, catalog, ștergere, angajați).
- **Angajat** — munca de zi cu zi, **fără nicio ștergere**: comenzile proprii și cele noi de pe site, comenzi noi (cu aprobare, dacă e activată), plăți, sarcinile proprii, vizualizare produse și stoc, recepții de marfă, clienți și furnizori noi.
- **Drepturi suplimentare** (bifate de administrator în *Utilizatori*, cu seturi rapide „Vânzări”, „Depozit”, „Șef vânzări”): vede toate comenzile · aprobă comenzi · produse și prețuri · editare clienți / furnizori · transferuri · casări · inventariere · sarcinile echipei · rapoarte · ștergere. Se aplică imediat; definite în `lib/permissions.js`.

---

## Pornire locală

```bash
npm install
cp .env.example .env.local    # completați POSTGRES_URL și JWT_SECRET
npm run dev                   # http://localhost:3030
```

La prima pornire se creează automat **schema bazei de date** (tabele, indexuri, securitate RLS), contul de administrator (din `SEED_ADMIN_*`), categoriile magazinului și un depozit implicit. Nu există pași manuali de migrare.

| Variabilă | Rol |
|---|---|
| `POSTGRES_URL` | Baza de date Postgres (Supabase) — setată automat de integrarea Supabase din Vercel. Acceptă și `DATABASE_URL`. |
| `JWT_SECRET` | Secret pentru sesiuni |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | Contul de admin creat la prima pornire |
| `CRM_API_KEY` | Opțional — cheie API „master” (de preferat cheile create din Integrări) |
| `CRON_SECRET` | Opțional — protejează sincronizarea zilnică `/api/cron/sync` |

`MAKE_API_KEY` / `MAKE_WEBHOOK_URL` nu mai sunt folosite și pot fi șterse din Vercel.

---

## Baza de date (Supabase)

Pe Vercel: proiectul **crmluxstore** → **Storage → Create Database → Supabase** (regiunea **Frankfurt, eu-central-1**, aproape de funcțiile Vercel `fra1`) → conectați la toate mediile. Integrarea adaugă singură `POSTGRES_URL` și celelalte variabile; la următorul deploy CRM-ul creează tabelele și contul de admin.

- Toate tabelele au **RLS activat** și sunt închise pentru API-ul public Supabase (`anon` / `authenticated`): datele sunt accesibile doar prin CRM.
- Stocul se modifică **atomic, în tranzacții** (registru `stock_movements` + sold în `stock`), deci două comenzi simultane nu pot vinde aceeași bucată de două ori.
- Jurnalele tehnice vechi se curăță automat la sincronizarea zilnică.
- Resetare cont admin (dacă s-a pierdut parola): `node --env-file=.env.local scripts/reset-admin.mjs`

---

## Integrări (fără Make)

### Site luxstore.md (WooCommerce)
CRM → **Integrări → Site luxstore.md**: adresa site-ului + cheile REST API WooCommerce (Citire/Scriere) → **Salvează** → **Creează automat webhook-urile**.
- Comenzile de pe site intră instant (webhook semnat HMAC) ca „Nouă de pe site”, cu clientul găsit / creat după telefon sau email.
- Opțional: stocul se publică pe site la fiecare mișcare; statusul comenzii (finalizată / anulată) se actualizează pe site.
- Plasă de siguranță: sincronizare zilnică automată (Vercel Cron) + buton „Sincronizează comenzile”.

### Bot Telegram
CRM → **Integrări → Bot Telegram**: creați botul la @BotFather, lipiți tokenul, alegeți depozitul din care se vinde → **Conectează botul**. Comenzile apar în CRM ca „Nouă” cu sursa „Bot Telegram”.

### 1C
Schimb **direct și bidirecțional**, fără servicii intermediare:
- **1C → CRM:** depozite, grupe, nomenclator cu prețuri și coduri de bare, stocuri, contragenți, prețuri individuale, recepții, transferuri, casări, plăți, confirmarea preluării comenzilor.
- **CRM → 1C:** **fluxul de modificări** `GET /api/v1/changes?after=<cursor>` — tot ce se schimbă în CRM (din interfață, site, bot, API) se înregistrează automat (trigger-e în baza de date) și ajunge în 1C cu starea completă a obiectului; 1C confirmă cursorul (`POST /changes/ack`), iar ce a trimis chiar 1C nu i se întoarce (fără ecou).
- **Modul 1C gata făcut:** `public/docs/1c/LuxStoreCRM_Obmen.bsl` (общий модуль „ОбменСLuxStoreCRM”); starea schimbului se vede în **Integrări → 1C**.

API REST v1 la `/api/v1`, cu chei create din **Integrări → API și chei** (tip 1C).
Documentația completă pentru programatorul 1C (flux, JSON, exemple de cod BSL): **[`public/docs/INTEGRARE-1C.md`](public/docs/INTEGRARE-1C.md)** — disponibilă și în aplicație la `/docs/INTEGRARE-1C.md`. Specificația OpenAPI: `/api/v1/openapi.json`.

### Webhook-uri de ieșire
Evenimente (comandă creată / modificată, plată, stoc modificat, produs, client, recepție…) trimise prin POST JSON către orice adresă, semnate cu `X-Lux-Signature: sha256=HMAC`.

---

## Teste

```bash
# pe o bază de date de TEST goală (niciodată pe producție):
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/crm_test npm run dev
B=http://localhost:3030 node scripts/smoke.mjs     # ~100 verificări end-to-end
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
lib/db.js, schema.js  conexiunea Postgres (postgres.js) și schema SQL (aplicată automat)
public/docs/          documentația pentru integrarea 1C
scripts/              test end-to-end, resetare admin
proxy.js              protecția paginilor (sesiune)
```
