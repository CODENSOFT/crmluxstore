# Integrarea scanerelor de coduri de bare cu CRM Lux Store

Pentru dezvoltatorul programului de scanare / terminalului de colectare date (TSD).
CRM-ul are deja tot ce trebuie pe partea lui: trebuie doar să alegeți modul potrivit aparatului și, dacă e cazul, să apelați API-ul de mai jos.

## Кратко (резюме на русском)

- **Режим клавиатуры (HID, USB / Bluetooth)** — работает сразу: страница «Scanare» в CRM принимает код + Enter. Настройка не нужна (суффикс Enter включён на большинстве сканеров).
- **ТСД через REST API** — JSON по HTTPS, ключ в заголовке `X-API-Key` (или `Authorization: Bearer`). Ключ типа «Scaner» создаёт администратор CRM. Основной вызов: `POST /api/v1/scanner/sessions` — список кодов + количеств для операции (приёмка, списание, перемещение, инвентаризация, сборка заказа).
- **Файл выгрузки** (CSV / TXT: `код;количество` или один код на строку) — загружается на странице «Scanare».
- Повторная отправка с тем же `externalId` не дублирует остатки. Неизвестные коды не теряются: сессия ждёт проверки в CRM.

---

## 1. Trei moduri de conectare

| Mod | Când | Ce trebuie făcut |
|---|---|---|
| **Tastatură (HID)** | Scaner USB / Bluetooth / inel, sau terminal cu „keyboard wedge” | Nimic în CRM. Scanerul trebuie să trimită **Enter** (sau Tab) după cod. Se scanează în pagina **Scanare**, în căutarea produselor și în formulare (comandă, recepție, transfer, casare). |
| **API REST** | Terminal Android (Zebra, Honeywell, Urovo, Point Mobile, Newland…) cu program propriu | Cheie API de tip **Scaner** + apelurile din secțiunea 3. |
| **Fișier** | Terminalul salvează lista (inventarieri mari, lucru fără rețea) | Export CSV / TXT, încărcat în **Scanare → Încarcă fișier de la scaner** (secțiunea 5). |

Scanarea cu **camera telefonului** funcționează în pagina Scanare (Chrome pe Android).

## 2. Conectare API

- Adresa de bază: `https://crmluxstore.vercel.app/api/v1`
- Autentificare: antet `X-API-Key: <cheie>` sau `Authorization: Bearer <cheie>`
- Cheia se creează în CRM: **Integrări → API și chei → Cheie nouă → Scaner**. O cheie de scaner are acces **doar** la `/api/v1/scanner/*` și `/api/v1/ping`.
- Format: JSON UTF-8. Răspuns reușit: `{ "ok": true, "data": …, "meta": … }`. Eroare: `{ "ok": false, "error": "mesaj în română" }` cu cod HTTP 400 / 401 / 403 / 404 / 409 / 500.
- Toate cererile apar în CRM la **Integrări → Jurnal** (sursa „Scaner”).
- Specificația completă: `GET /api/v1/openapi.json` (se importă în Postman / Swagger).

Test rapid:

```bash
curl -H "X-API-Key: $CHEIE" https://crmluxstore.vercel.app/api/v1/scanner
```

## 3. Endpoint-uri

### 3.1 `GET /scanner` — configurarea terminalului

```json
{ "ok": true, "data": {
  "ok": true, "device": "TSD Depozit 1", "kind": "scanner", "time": "2026-11-02T09:00:00.000Z",
  "operations": [
    { "key": "arrival",   "label": "Recepție marfă",               "needs": ["warehouse"] },
    { "key": "writeoff",  "label": "Casare",                        "needs": ["warehouse"] },
    { "key": "transfer",  "label": "Transfer între depozite",       "needs": ["warehouse", "toWarehouse"] },
    { "key": "inventory", "label": "Inventariere (numărare)",       "needs": ["warehouse"] },
    { "key": "picking",   "label": "Pregătire comandă (verificare)","needs": ["order"] },
    { "key": "list",      "label": "Listă de coduri (fără efect asupra stocului)", "needs": [] }
  ],
  "warehouses": [ { "id": "6b1f…", "code": "DEP-1", "name": "Depozit central", "type": "warehouse", "isDefault": true } ]
} }
```

Depozitul se poate trimite ca `id`, `code` sau nume.

### 3.2 `GET /scanner/lookup?code=4840000000017&warehouse=DEP-1` — produsul după cod

Codul se caută în ordinea: cod de bare suplimentar (inclusiv bax cu multiplicator) → cod de bare principal → SKU → cod 1C. EAN-13 / UPC-A / GTIN-14 se potrivesc cu sau fără zerourile din față.

```json
{ "ok": true, "data": {
  "found": true, "code": "4840000000017", "multiplier": 1, "matchedBy": "barcode",
  "product": {
    "id": "3f6c…", "name": "Detergent X 5L", "sku": "DX-5", "barcode": "4840000000017",
    "extraBarcodes": [ { "code": "14840000000014", "multiplier": 4 } ],
    "unit": "pcs", "price": 250, "wholesalePrice": 210,
    "discount": 10, "discountFrom": "2026-11-20", "discountTo": "2026-11-30", "salePrice": 225, "active": true,
    "photoUrl": "/api/products/3f6c…/photo",
    "stock": [ { "warehouseId": "6b1f…", "warehouseCode": "DEP-1", "warehouseName": "Depozit central", "quantity": 12 } ],
    "totalStock": 12, "quantityInWarehouse": 12
  }
} }
```

Reducerea pe produs: `discount` (%, `null` = fără), perioada `discountFrom` / `discountTo` (zile incluse, `null` = fără limită) și `salePrice` — prețul cu amănuntul după reducerea valabilă azi (`null` dacă azi nu e reducere).

Cod necunoscut: `{ "ok": true, "data": { "found": false, "code": "…" } }` (HTTP 200).

### 3.3 `GET /scanner/catalog?updatedSince=2026-11-01T00:00:00Z&page=1&limit=1000&warehouse=DEP-1` — catalog pentru offline

Paginat (`limit` ≤ 5000), ordonat după `updatedAt`. Prima dată fără `updatedSince`, apoi doar modificările.

```json
{ "ok": true,
  "data": [ { "id": "3f6c…", "name": "Detergent X 5L", "sku": "DX-5", "barcode": "4840000000017",
              "extraBarcodes": [ { "code": "14840000000014", "multiplier": 4 } ],
              "unit": "pcs", "price": 250, "discount": null, "discountFrom": null, "discountTo": null, "salePrice": null,
              "stock": 12, "active": true, "updatedAt": "2026-11-01T10:00:00.000Z" } ],
  "meta": { "page": 1, "limit": 1000, "total": 1840, "hasMore": true } }
```

### 3.4 `GET /scanner/orders` — comenzi de pregătit

Comenzile cu status „În lucru” (`processing`) și liniile lor (`productId`, `name`, `sku`, `barcode`, `quantity`, `unit`, `warehouse`). Parametri: `status` (listă separată prin virgulă), `limit`.

### 3.5 `GET /scanner/inventories` și `GET /scanner/inventories/{id}?blind=1`

Fișele de inventariere deschise; cu `{id}` — liniile (`productId`, `name`, `barcode`, `expected`, `counted`). `blind=1` ascunde stocul scriptic (`expected`) pentru numărare „oarbă”.

### 3.6 `POST /scanner/sessions` — trimiterea unei liste scanate (principalul apel)

```json
{
  "operation": "arrival",
  "warehouse": "DEP-1",
  "externalId": "TSD01-2026-11-02-0007",
  "device": "Zebra TC21 #1",
  "note": "Factura 12345",
  "items": [
    { "code": "4840000000017", "quantity": 10 },
    { "code": "14840000000014", "quantity": 2 },
    { "code": "4840000000017" }
  ],
  "options": { "supplier": "SRL Furnizor", "supplierInvoice": "12345" },
  "apply": true
}
```

| Câmp | Descriere |
|---|---|
| `operation` | `arrival`, `writeoff`, `transfer`, `inventory`, `picking`, `list` |
| `warehouse` / `toWarehouse` | depozitul (id / cod / nume); `toWarehouse` doar la transfer |
| `orderId` | la `picking`: ID-ul sau numărul comenzii (`CMD-000123`) |
| `inventoryId` | la `inventory`: fișa existentă (ID sau număr); lipsă = se creează o fișă nouă pentru depozit |
| `items[]` | `code` (cod de bare / SKU) + `quantity` (implicit 1). Același cod de mai multe ori se adună. Max. 5000 linii. Codul de bax se înmulțește automat cu multiplicatorul. |
| `externalId` | **recomandat**: identificator unic al listei pe terminal. Retrimiterea cu același `externalId` întoarce sesiunea existentă (`meta.duplicate: true`) — stocul nu se dublează. |
| `options.mode` | la `inventory`: `set` (înlocuiește cantitatea numărată, implicit) sau `add` (adună — numărare pe zone) |
| `options.reasonCode` / `reason` | la `writeoff`: `expired`, `damaged`, `defect`, `internal`, `sample`, `lost`, `other` |
| `options.supplier`, `supplierInvoice` | la `arrival` (opțional) |
| `options.markReady` | la `picking`: dacă comanda e completă, trece la „Gata de livrare” (implicit `true`) |
| `apply` | `true` = se aplică imediat dacă toate codurile sunt recunoscute; `false` = rămâne „De verificat” în CRM |

Răspuns (HTTP 201, sau 200 la duplicat):

```json
{ "ok": true,
  "data": { "id": "a9e2…", "number": "SCN-000014", "operation": "arrival", "status": "applied",
            "externalId": "TSD01-2026-11-02-0007", "unknownCount": 0,
            "items": [ { "code": "4840000000017", "scanned": 11, "quantity": 11, "matched": true, "productId": "3f6c…", "name": "Detergent X 5L", "sku": "DX-5", "multiplier": 1 },
                       { "code": "14840000000014", "scanned": 2, "quantity": 8, "matched": true, "productId": "3f6c…", "name": "Detergent X 5L", "sku": "DX-5", "multiplier": 4 } ],
            "result": { "docType": "arrival", "docId": "…", "number": "REC-000031", "href": "/receptie/…" },
            "error": null, "createdAt": "…", "appliedAt": "…" },
  "meta": { "duplicate": false } }
```

Statusuri: `pending` (de verificat), `applied`, `rejected`, `error`.
Dacă aplicarea nu reușește (ex. stoc insuficient la casare, coduri necunoscute) sesiunea **se salvează oricum**, iar `meta.applyError` conține motivul. Operatorul o corectează în CRM (**Scanare → Sesiuni**): leagă codurile necunoscute de produse (codul se salvează la produs pentru data viitoare) și apasă „Aplică”.

La `picking`, `result` conține comparația: `complete`, `lines[]` (`ordered`, `picked`, `diff`) și `extra[]` (produse care nu sunt în comandă).

### 3.7 `GET /scanner/sessions/{id}`

`{id}` = ID, numărul `SCN-…` sau `externalId`. Terminalul îl poate interoga ca să afișeze dacă lista a fost aplicată sau respinsă.

## 4. Flux recomandat pentru un terminal

1. La pornire: `GET /scanner` (depozite, operațiuni). Opțional `GET /scanner/catalog` pentru offline, apoi periodic cu `updatedSince`.
2. Operatorul alege operațiunea + depozitul (sau comanda / fișa de inventariere).
3. La fiecare scanare (online): `GET /scanner/lookup` ca să afișeze numele și stocul; offline — din catalog.
4. La final: `POST /scanner/sessions` cu `externalId` unic. La eroare de rețea — retrimiteți cu **același** `externalId`.
5. Afișați `status` / `meta.applyError`; opțional verificați ulterior cu `GET /scanner/sessions/{id}`.

## 5. Format fișier (CSV / TXT)

Acceptat la **Scanare → Încarcă fișier de la scaner**:

```
4840000000017;10
4840000000024;3
4840000000031
```

- Separator `;`, `,` sau TAB; o linie fără cantitate = 1 bucată; liniile repetate se adună.
- Antetul opțional se recunoaște automat (`cod`, `barcode`, `ean`, `code`, `штрихкод` / `cantitate`, `qty`, `количество`).
- Codare UTF-8 (cu sau fără BOM).

## 6. Ce ne trebuie de la dezvoltator

1. Modelul scanerului / terminalului, sistemul (Android / Windows / iOS) și numele programului.
2. Modul de transmitere: tastatură (HID), HTTP REST / JSON sau fișier export.
3. Pentru HTTP: poate trimite antetul `X-API-Key` (sau `Authorization: Bearer`) pe HTTPS?
4. Operațiunile folosite: recepție, casare, transfer, inventariere, pregătire comenzi, verificare preț / stoc.
5. Online sau offline (catalog descărcat pe terminal)?
6. Tipurile de cod: EAN-13 / EAN-8, UPC, Code 128, QR, DataMatrix; există coduri de bax cu multiplicator?
7. Are fiecare listă un identificator unic (pentru `externalId`)?
8. Un exemplu real de fișier / JSON pe care îl produce programul lor — dacă formatul lor e fix, îl putem accepta direct în CRM.
