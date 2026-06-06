# CRM Lux Store

CRM pentru magazin de produse chimice auto & echipamente pentru spalatorii self-wash.
Gestioneaza produse, depozite, comenzi (cu aprobare), sarcini, transferuri, receptii de
marfa si anulari de stoc. Construit cu **Next.js 16 + MongoDB (Mongoose) + Tailwind**,
cu integrare completa **Make.com**.

---

## 1. Cerinte

- **Node.js 18+** (testat pe Node 22)
- **MongoDB** — local sau [MongoDB Atlas](https://www.mongodb.com/atlas) (gratuit)

---

## 2. Instalare

```bash
npm install
```

Copiaza `.env.example` in `.env.local` si completeaza:

```env
MONGODB_URI=mongodb://localhost:27017/crm-lux-store   # sau URI-ul de Atlas
JWT_SECRET=un-secret-lung-aleator
MAKE_API_KEY=cheie-secreta-pentru-make
MAKE_WEBHOOK_URL=                                       # optional, se poate seta si din UI
SEED_ADMIN_EMAIL=admin@crm.local
SEED_ADMIN_PASSWORD=admin123
SEED_ADMIN_NAME=Administrator
```

> Daca nu ai MongoDB local: creeaza un cluster gratuit pe Atlas, apasa **Connect →
> Drivers**, copiaza URI-ul si pune-l in `MONGODB_URI`.

---

## 3. Pornire

```bash
npm run dev      # dezvoltare → http://localhost:3006
npm run build    # build de productie
npm start        # ruleaza build-ul de productie → http://localhost:3006
```

La prima pornire se creeaza automat contul de admin din `.env.local`.

**Autentificare initiala:** `admin@crm.local` / `admin123` (schimba parola dupa logare).

---

## 4. Functionalitati

| Modul | Descriere |
|-------|-----------|
| **Conturi** | Admin adauga manageri. Rol-uri: admin / manager. |
| **Comenzi** | Mai multe produse pe comanda, total calculat automat. Comenzile managerilor necesita **aprobarea adminului**; cele ale adminului se aproba automat. Responsabilul este managerul insusi (fortat) sau ales de admin. |
| **Produse** | Denumire (obligatoriu), descriere, foto, unitate de masura (bucata/kg/litri/metru), pret, stoc pe depozit. |
| **Depozite** | Creezi oricate depozite; apar peste tot unde selectezi stoc. |
| **Receptie marfa** | Inregistrezi stocul nou primit — stocul creste automat in depozitul ales. |
| **Transfer** | Muti o cantitate dintr-un depozit in altul. |
| **Anulare (spisanie)** | Scoti din stoc produse defecte/expirate, cu motiv. |
| **Sarcini** | Indicatii pentru manageri, cu termen (data) si prioritate. |
| **Rapoarte** | Raport **comenzi** (filtre dupa data si status, valoare totala) si raport **stoc** (per produs/depozit, valoare, stoc scazut), cu **export CSV** (se deschide in Excel). |
| **Stoc** | Se scade automat la aprobarea comenzilor si la transfer/anulare; creste la receptie. Avertizare stoc scazut pe panou. |

---

## 5. Integrare Make.com

Toata configurarea e vizibila in aplicatie la **Integrare Make** (meniu, doar admin):
URL de baza, cheia API si lista de endpoint-uri.

### Make → CRM (Make trimite date in CRM)

Foloseste modulul **HTTP** din Make. La fiecare cerere adauga header-ul:

```
x-api-key: <MAKE_API_KEY din .env.local>
```

Endpoint-uri:

| Metoda | Cale | Descriere |
|--------|------|-----------|
| GET | `/api/make/ping` | Test conexiune |
| GET | `/api/make/products` | Lista produse + stoc |
| POST | `/api/make/products` | Creeaza produs |
| GET | `/api/make/warehouses` | Lista depozite (id-uri) |
| GET | `/api/make/orders` | Lista comenzi |
| POST | `/api/make/orders` | Creeaza comanda (ramane `pending`) |
| POST | `/api/make/arrivals` | Receptie marfa (creste stocul) |

Exemplu creare comanda (`POST /api/make/orders`):

```json
{
  "items": [{ "sku": "SH-5L", "warehouseId": "<id-depozit>", "quantity": 2 }],
  "customerName": "Ion Popescu",
  "responsibleEmail": "manager@crm.local"
}
```

### CRM → Make (CRM trimite evenimente catre Make)

1. In Make creezi un scenariu cu trigger **Webhooks → Custom webhook** si copiezi URL-ul.
2. Il lipesti in pagina **Integrare Make → Webhook de iesire** (sau in `MAKE_WEBHOOK_URL`).

Evenimente trimise: `order.created`, `order.approved`, `order.rejected`,
`product.created`, `arrival.created`, `transfer.created`, `writeoff.created`.
Format: `{ "event": "...", "timestamp": "...", "data": { ... } }`.

---

## 6. Test rapid (optional)

Cu un MongoDB pornit pe `:27017` si serverul de dev ruland pe portul 3010
(`PORT=3010 npm run dev`):

```bash
bash scripts/smoke.sh
```

Ruleaza 19 verificari end-to-end (autentificare, roluri, stoc, fluxul de aprobare a
comenzilor, transfer, anulare, integrare Make etc.).

---

## 7. Structura proiectului

```
app/
  (app)/            paginile protejate (dashboard, comenzi, produse, ...)
  api/              rute API interne + api/make/* (integrare externa)
  login/            pagina de autentificare
  _components/      kit UI reutilizabil + contexte
lib/                mongodb, auth, api guards, stock, make, seed, client
models/             schemele Mongoose
proxy.js            protectia rutelor (auth)
```
