# Integrarea CRM Lux Store ↔ 1C

Document pentru programatorul 1C. Descrie API-ul CRM-ului Lux Store, fluxul de schimb recomandat, formatele JSON și exemple de cod 1C (BSL).

- **Adresa de bază:** `https://crmluxstore.vercel.app/api/v1` (adresa exactă apare în CRM → Integrări → 1C)
- **Specificația OpenAPI 3.1:** `GET /api/v1/openapi.json` (se importă în Postman / Swagger)
- **Autentificare:** antetul `X-API-Key: <cheie>` (sau `Authorization: Bearer <cheie>`)
- **Format:** JSON UTF-8, numere cu punct zecimal, date ISO 8601 în UTC (`2026-10-17T09:12:00Z`)

---

## Кратко для программиста 1С (резюме на русском)

CRM Lux Store — оперативная система продаж (заказы из магазина, сайта luxstore.md, B2B). 1С — бухгалтерия.
Обмен идёт по REST/JSON через `HTTPСоединение`, без внешних компонент. Ключ API создаётся в CRM: **Integrări → API și chei → Cheie nouă (tip 1C)**.

| Направление | Что | Метод |
|---|---|---|
| 1С → CRM | Склады, группы, номенклатура, цены, штрихкоды | `POST /warehouses`, `/categories`, `/products` |
| 1С → CRM | Контрагенты | `POST /customers` |
| 1С → CRM | Поступления товаров | `POST /arrivals` |
| CRM → 1С | Подтверждённые заказы → «Реализация» / «Заказ клиента» | `GET /orders?exported=0` |
| 1С → CRM | Подтверждение выгрузки заказа (номер документа 1С) | `POST /orders/{id}/export` |
| 1С → CRM | Оплаты (выписка банка, ПКО) | `POST /orders/{id}/payments` |
| 1С → CRM | Номер налоговой накладной (e-Factura) | `PATCH /orders/{id}` |
| Сверка | Остатки, движения | `GET /stock`, `GET /movements` |

Ключ сопоставления — поле **`externalId`** = `Строка(Ссылка.УникальныйИдентификатор())`. Повторная отправка безопасна (идемпотентно): существующие объекты обновляются, дубликаты не создаются.

---

## 1. Rolul fiecărui sistem

| | CRM Lux Store | 1C |
|---|---|---|
| Comenzi (magazin, site, telefon, B2B) | **sursa** — se creează și se procesează aici | primește comenzile confirmate |
| Stoc operativ | **sursa** — se scade la confirmarea comenzii | se actualizează din documentele de vânzare |
| Nomenclator, prețuri, coduri de bare | primește din 1C (după integrare) | **sursa** |
| Contragenți (date fiscale) | bidirecțional | **sursa** pentru datele fiscale |
| Recepții de marfă | primește din 1C (sau se fac direct în CRM) | **sursa** (documentele de intrare) |
| Plăți / încasări | primește din 1C | **sursa** |
| Facturi fiscale (e-Factura) | primește numărul facturii | **sursa** |

> Recomandare: păstrați CRM-ul ca sursă a **stocului operativ** (vânzările se întâmplă acolo în timp real). 1C trimite **recepțiile** (`POST /arrivals`) și preia **vânzările** (`GET /orders?exported=0`). Suprascrierea stocului din 1C (`POST /stock` cu `mode=set`) folosiți-o doar la inventariere / reconciliere, după ce 1C a procesat toate comenzile preluate — altfel se pot pierde vânzările încă neînregistrate în 1C.

---

## 2. Conectare și reguli generale

### Autentificare

```
GET /api/v1/ping
X-API-Key: lux_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Răspuns:

```json
{ "ok": true, "data": { "ok": true, "key": "1C Contabilitate", "kind": "1c", "time": "2026-10-17T09:12:00.000Z" } }
```

- Cheia are drepturi `read` (GET) și/sau `write` (POST/PATCH/DELETE).
- Cheia se vede o singură dată la creare. Dacă se pierde, se revocă și se creează alta.
- Fiecare cerere de scriere apare în CRM → Integrări → **Jurnal** (sursa „1C”), cu rezultat și durată.

### Format răspuns

```json
{ "ok": true,  "data": { ... }, "meta": { "page": 1, "limit": 100, "total": 250, "hasMore": true } }
{ "ok": false, "error": "Mesaj de eroare în română" }
```

| Cod HTTP | Semnificație |
|---|---|
| 200 / 201 | Reușit / creat |
| 400 | Date invalide (mesajul spune exact ce) |
| 401 | Cheie lipsă sau invalidă |
| 403 | Cheia nu are dreptul necesar |
| 404 | Obiect inexistent / endpoint inexistent |
| 409 | Duplicat (ex: SKU deja folosit) |
| 5xx | Eroare temporară — reîncercați după 30–60 s |

### Operațiuni în lot

Endpoint-urile `POST /products`, `/customers`, `/categories`, `/warehouses`, `/suppliers`, `/stock` acceptă:

- un obiect: `{ ... }`
- o listă: `[ {...}, {...} ]`
- sau `{ "items": [ {...}, {...} ] }` — **maximum 1000 elemente** per cerere.

Răspunsul raportează fiecare element separat (un element greșit nu blochează restul):

```json
{
  "ok": true,
  "data": {
    "total": 3, "created": 1, "updated": 1, "errors": 1,
    "results": [
      { "index": 0, "status": "updated", "id": "6ad3…", "externalId": "8f2c…", "sku": "KC-GS-11" },
      { "index": 1, "status": "created", "id": "6ad4…", "externalId": "91aa…", "sku": "FOX-FOAM-5" },
      { "index": 2, "status": "error", "error": "Câmpul „name” este obligatoriu pentru produse noi", "sku": "X-1" }
    ]
  }
}
```

### Paginare și sincronizare incrementală

- Listele acceptă `page` (de la 1) și `limit` (max 1000). `meta.hasMore = true` → cereți pagina următoare.
- `updatedSince=<ISO>` întoarce doar ce s-a modificat după acea dată, ordonat crescător după `updatedAt`. Salvați în 1C (ex: într-o constantă) `updatedAt` al ultimului element procesat și folosiți-l la următorul schimb.
- `GET /movements` folosește `since` + `meta.nextSince` (cursor).

### Date și numere

- Datele se trimit în UTC: `XMLСтрока(УниверсальноеВремя(Дата)) + "Z"`.
- Sumele sunt în MDL, cu TVA inclus (setarea implicită a magazinului), rotunjite la 2 zecimale.
- Cantitățile pot fi fracționare (litri, kg) — max 4 zecimale.

---

## 3. Identificatori și potrivire

| Obiect | Potrivire (în ordine) | Recomandat din 1C |
|---|---|---|
| Produs | `externalId` → `sku` → `barcode` | `externalId` = UUID, `sku` = Артикул, `barcode` = Штрихкод |
| Categorie | `externalId` → denumire | UUID grupei |
| Depozit | `externalId` → `code` → denumire | UUID + cod scurt |
| Client | `externalId` → `idno` → telefon → email | UUID contragentului, IDNO |
| Furnizor | `externalId` → `idno` → denumire | UUID contragentului |
| Comandă | `id` CRM, `number` (CMD-000123) sau `externalId` | — |

La prima sincronizare, produsele deja existente în CRM se leagă automat după SKU / cod de bare și primesc `externalId`. Din acel moment, potrivirea se face după `externalId`.

**Unități de măsură** (câmpul `unit`):

| 1C | CRM |
|---|---|
| шт / buc | `bucata` |
| л / litru | `litri` |
| кг | `kg` |
| м | `metru` |
| набор / set | `set` |
| упак / pachet | `pachet` |
| пара | `pereche` |

---

## 4. Scenariul de schimb recomandat

Rulați din 1C o **sarcină programată** (Регламентное задание) la fiecare 5–15 minute:

1. **Depozite** (o dată / la modificare) — `POST /warehouses`
2. **Grupe de produse** — `POST /categories`
3. **Nomenclator + prețuri** modificate de la ultimul schimb — `POST /products`
4. **Contragenți** modificați — `POST /customers`
5. **Recepții** noi (Поступление товаров) — `POST /arrivals` (cu `externalId` = UUID documentului)
6. **Comenzi de preluat** — `GET /orders?exported=0` → creați documentul în 1C → `POST /orders/{id}/export`
7. **Plăți** înregistrate în 1C pentru comenzi CRM — `POST /orders/{id}/payments`
8. (opțional) **Factura fiscală** — `PATCH /orders/{id}` cu `invoice.number`
9. (zilnic, opțional) **Reconciliere** — `GET /stock` vs. soldurile din 1C; diferențele se analizează, nu se suprascriu automat.

---

## 5. Referință endpoint-uri

### 5.1 Depozite

`POST /warehouses`

```json
{ "items": [
  { "externalId": "a1b2c3d4-0000-0000-0000-000000000001", "code": "DEP-1", "name": "Depozit principal", "type": "warehouse" },
  { "externalId": "a1b2c3d4-0000-0000-0000-000000000002", "code": "MAG-1", "name": "Magazin Lunca Bîcului", "type": "store", "address": "Chișinău, str. Lunca Bîcului 23" }
] }
```

`type`: `warehouse` | `store` | `vehicle`. `GET /warehouses` întoarce lista cu `id`, `externalId`, `code`.

### 5.2 Categorii

`POST /categories`

```json
[ { "externalId": "c0ffee00-…", "name": "Chimie auto" },
  { "externalId": "c0ffee01-…", "name": "Spumă activă & detergenți", "parentExternalId": "c0ffee00-…" } ]
```

### 5.3 Produse (nomenclator)

`POST /products`

```json
{ "items": [
  {
    "externalId": "8f2c1d4e-5b6a-11ee-8c99-0242ac120002",
    "sku": "KC-GS-11",
    "barcode": "4004764700038",
    "name": "Koch-Chemie Green Star 11 kg",
    "categoryExternalId": "c0ffee00-…",
    "brand": "Koch-Chemie",
    "packaging": "Canistră 11 kg",
    "unit": "bucata",
    "price": 1450.00,
    "wholesalePrice": 1300.00,
    "costPrice": 980.00,
    "vatRate": 20,
    "minStock": 3,
    "active": true
  }
] }
```

- Câmpurile lipsă **nu** se modifică (trimiteți doar ce s-a schimbat, ex: doar `externalId` + `price`).
- `price` = preț cu amănuntul (cu TVA), `wholesalePrice` = preț angro (clienți B2B), `costPrice` = preț de achiziție (fără TVA).
- Opțional `stock: [{ "warehouse": "DEP-1", "quantity": 12 }]` setează stocul absolut (vezi recomandarea din secțiunea 1).
- `DELETE /products/{externalId|sku|id}` → produsul devine inactiv (istoricul rămâne).

`GET /products?updatedSince=2026-10-01T00:00:00Z&limit=500` — produsele cu stoc pe depozite:

```json
{ "id": "6ad3…", "externalId": "8f2c…", "sku": "KC-GS-11", "name": "Koch-Chemie Green Star 11 kg",
  "unit": "bucata", "price": 1450, "wholesalePrice": 1300, "costPrice": 980,
  "stock": [ { "warehouseId": "6ad1…", "warehouseCode": "DEP-1", "warehouseExternalId": "a1b2…", "quantity": 100 } ],
  "totalStock": 100, "active": true, "updatedAt": "2026-10-17T09:12:00.000Z" }
```

### 5.4 Clienți (contragenți)

`POST /customers`

```json
[ {
  "externalId": "d5e6f7a8-…",
  "type": "company",
  "name": "SRL AquaWash Self-Service",
  "idno": "1003600012345",
  "vatCode": "0600123",
  "iban": "MD24AG000000022512345678",
  "bank": "MAIB",
  "legalAddress": "mun. Chișinău, str. Calea Ieșilor 10",
  "phone": "+373 69 123 456",
  "email": "office@aquawash.md",
  "segment": "carwash",
  "priceType": "wholesale",
  "discount": 5,
  "paymentTermDays": 14
} ]
```

`segment`: `retail` (persoană fizică), `carwash` (spălătorie self-service), `detailing`, `service`, `dealer`, `fleet`, `other`.
`GET /customers?updatedSince=…` întoarce și clienții creați în CRM (ex: de pe site) — 1C îi poate crea ca contragenți.

### 5.5 Comenzi (CRM → 1C)

`GET /orders?exported=0&limit=100` — comenzile **confirmate** (în pregătire / gata / livrare / finalizate) care încă nu au fost preluate în 1C.

```json
{
  "id": "6ad380c95c05ca98724015b8",
  "number": "CMD-000124",
  "status": "processing",
  "statusLabel": "În pregătire",
  "channel": "site",
  "createdAt": "2026-10-17T07:05:41.000Z",
  "currency": "MDL",
  "customer": { "id": "6ad3…", "externalId": "d5e6…", "name": "SRL AquaWash Self-Service", "idno": "1003600012345", "phone": "+373 69 123 456" },
  "priceType": "wholesale",
  "items": [
    { "productId": "6ad3…", "productExternalId": "8f2c…", "sku": "KC-GS-11", "name": "Koch-Chemie Green Star 11 kg",
      "warehouseId": "6ad1…", "warehouseCode": "DEP-1", "warehouseExternalId": "a1b2…",
      "quantity": 10, "unit": "bucata", "unitPrice": 1300, "discount": 5, "lineTotal": 12350, "vatRate": 20 }
  ],
  "subtotal": 12350, "deliveryCost": 150, "vatTotal": 2083.33, "total": 12500,
  "delivery": { "method": "courier_chisinau", "label": "Curier Chișinău (2–3 zile)", "city": "Chișinău", "address": "str. Ismail 10" },
  "paymentMethod": "transfer", "paymentStatus": "partial", "paidAmount": 5000,
  "payments": [ { "id": "…", "amount": 5000, "method": "transfer", "date": "2026-10-17T08:00:00.000Z", "reference": "OP 112" } ],
  "external": { "source": "woo", "id": "9123", "number": "9123" },
  "export1c": { "exported": false, "exportedAt": null, "docNumber": null, "docId": null }
}
```

- `lineTotal` = `quantity × unitPrice × (1 − discount/100)`; `total` = Σ `lineTotal` + `deliveryCost` (TVA inclus).
- Livrarea (`deliveryCost`) se înregistrează în 1C ca serviciu.
- După crearea documentului în 1C, confirmați preluarea:

`POST /orders/{id}/export`

```json
{ "docNumber": "RL-000045", "docId": "3b9e…-uuid-document-1c" }
```

Comanda dispare din `exported=0` și în CRM apare „Preluată în 1C · doc. RL-000045”.

- Comenzile anulate **după** preluare au `status: "cancelled"`; le găsiți cu `GET /orders?updatedSince=…&status=cancelled` și anulați documentul în 1C.

`POST /orders` — creare comandă din 1C (opțional, ex: vânzări B2B introduse în 1C):

```json
{
  "externalId": "uuid-document-1c",
  "externalNumber": "ZK-000310",
  "status": "processing",
  "customer": { "externalId": "d5e6…", "name": "SRL AquaWash Self-Service", "idno": "1003600012345" },
  "items": [ { "productExternalId": "8f2c…", "warehouse": "DEP-1", "quantity": 4, "price": 1300 } ],
  "paymentMethod": "transfer",
  "note": "Comandă din 1C"
}
```

`status`: `new` (fără rezervare de stoc), `processing` (scade stocul), `completed`. Trimiterea repetată cu același `externalId` întoarce comanda existentă (`meta.duplicate = true`).

`PATCH /orders/{id}`

```json
{ "status": "completed", "invoice": { "number": "AA 1234567", "date": "2026-10-17" }, "delivery": { "trackingNumber": "NP-20456" } }
```

`status` acceptat: `processing`, `ready`, `invoicing`, `completed`, `cancelled` (cu `reason`).

### 5.6 Plăți

`POST /orders/{id}/payments`

```json
{ "amount": 7500.00, "method": "transfer", "date": "2026-10-18T10:00:00Z", "reference": "OP 118" }
```

`method`: `cash`, `card`, `transfer`, `cod` (ramburs), `online`. Suma nu poate depăși restul de plată.

### 5.7 Recepții (intrări de marfă)

`POST /arrivals`

```json
{
  "externalId": "uuid-document-postuplenie",
  "warehouse": "DEP-1",
  "supplierExternalId": "uuid-furnizor",
  "supplier": "Koch-Chemie Distribuție",
  "supplierInvoice": "FV-2231",
  "supplierInvoiceDate": "2026-10-16",
  "updateCostPrice": true,
  "items": [
    { "productExternalId": "8f2c…", "quantity": 30, "unitCost": 990.00 },
    { "sku": "FOX-FOAM-5", "quantity": 12, "unitCost": 260.00 }
  ]
}
```

Stocul crește imediat; `updateCostPrice: true` actualizează prețul de achiziție al produselor. Același `externalId` trimis de două ori nu dublează recepția.

### 5.8 Stocuri

`GET /stock?warehouse=DEP-1` — sold pe produs × depozit.

`POST /stock` — reconciliere / inventariere:

```json
{ "mode": "set", "note": "Inventariere 1C 31.10.2026",
  "items": [ { "productExternalId": "8f2c…", "warehouse": "DEP-1", "quantity": 97 } ] }
```

- `mode: "set"` — cantitatea devine exact valoarea trimisă; `mode: "add"` — se adaugă (sau scade cu valoare negativă).
- Fiecare modificare apare în registrul de stoc al CRM cu tipul „Sincronizare 1C / API”.

### 5.9 Registrul de stoc

`GET /movements?since=2026-10-01T00:00:00Z&limit=500`

```json
{ "data": [ { "id": "…", "productId": "…", "sku": "KC-GS-11", "warehouseId": "…", "quantity": -10, "balanceAfter": 90,
              "type": "sale", "ref": { "type": "Order", "id": "…", "number": "CMD-000124" }, "createdAt": "…" } ],
  "meta": { "limit": 500, "hasMore": true, "nextSince": "2026-10-17T07:05:41.512Z" } }
```

`type`: `initial`, `arrival`, `sale`, `sale_return`, `transfer_out`, `transfer_in`, `writeoff`, `inventory`, `adjustment`, `sync`.

---

## 6. Exemple de cod 1C (BSL)

### 6.1 Funcție comună de apel

```bsl
// Общий модуль "ЛюксCRM" (Сервер, Вызов сервера)

Функция Запрос(Метод, Ресурс, Данные = Неопределено) Экспорт

    Сервер  = "crmluxstore.vercel.app";
    КлючAPI = Константы.ЛюксCRM_КлючAPI.Получить(); // хранить ключ в константе / безопасном хранилище

    Соединение = Новый HTTPСоединение(Сервер, 443, , , , 60, Новый ЗащищенноеСоединениеOpenSSL);

    Заголовки = Новый Соответствие;
    Заголовки.Вставить("X-API-Key", КлючAPI);
    Заголовки.Вставить("Content-Type", "application/json; charset=utf-8");
    Заголовки.Вставить("Accept", "application/json");

    HTTPЗапрос = Новый HTTPЗапрос("/api/v1" + Ресурс, Заголовки);

    Если Данные <> Неопределено Тогда
        Запись = Новый ЗаписьJSON;
        Запись.УстановитьСтроку();
        ЗаписатьJSON(Запись, Данные);
        HTTPЗапрос.УстановитьТелоИзСтроки(Запись.Закрыть(), КодировкаТекста.UTF8, ИспользованиеByteOrderMark.НеИспользовать);
    КонецЕсли;

    Ответ = Соединение.ВызватьHTTPМетод(Метод, HTTPЗапрос);
    Текст = Ответ.ПолучитьТелоКакСтроку(КодировкаТекста.UTF8);

    Чтение = Новый ЧтениеJSON;
    Чтение.УстановитьСтроку(Текст);
    Результат = ПрочитатьJSON(Чтение, Истина); // Соответствие
    Чтение.Закрыть();

    Если Ответ.КодСостояния >= 400 Или Результат.Получить("ok") <> Истина Тогда
        ВызватьИсключение СтрШаблон("CRM %1 %2 (HTTP %3): %4", Метод, Ресурс, Ответ.КодСостояния, Результат.Получить("error"));
    КонецЕсли;

    Возврат Результат;

КонецФункции

Функция ДатаISO(Дата) Экспорт
    Возврат XMLСтрока(УниверсальноеВремя(Дата)) + "Z";
КонецФункции
```

### 6.2 Trimiterea nomenclatorului

```bsl
Процедура ВыгрузитьНоменклатуру(МассивСсылок) Экспорт

    Элементы = Новый Массив;
    Для Каждого Ссылка Из МассивСсылок Цикл
        Элемент = Новый Структура;
        Элемент.Вставить("externalId", Строка(Ссылка.УникальныйИдентификатор()));
        Элемент.Вставить("sku", Ссылка.Артикул);
        Элемент.Вставить("name", Ссылка.Наименование);
        Элемент.Вставить("unit", "bucata");
        Элемент.Вставить("price", ЦенаНоменклатуры(Ссылка, "Розничная"));   // ваша функция
        Элемент.Вставить("wholesalePrice", ЦенаНоменклатуры(Ссылка, "Оптовая"));
        Если ЗначениеЗаполнено(Ссылка.Родитель) Тогда
            Элемент.Вставить("categoryExternalId", Строка(Ссылка.Родитель.УникальныйИдентификатор()));
        КонецЕсли;
        Элементы.Добавить(Элемент);

        Если Элементы.Количество() = 500 Тогда // пачками
            ОтправитьПачку(Элементы);
            Элементы = Новый Массив;
        КонецЕсли;
    КонецЦикла;
    Если Элементы.Количество() > 0 Тогда
        ОтправитьПачку(Элементы);
    КонецЕсли;

КонецПроцедуры

Процедура ОтправитьПачку(Элементы)
    Результат = ЛюксCRM.Запрос("POST", "/products", Новый Структура("items", Элементы));
    Данные = Результат.Получить("data");
    Для Каждого Строка Из Данные.Получить("results") Цикл
        Если Строка.Получить("status") = "error" Тогда
            ЗаписьЖурналаРегистрации("ЛюксCRM.Номенклатура", УровеньЖурналаРегистрации.Предупреждение, , ,
                Строка.Получить("sku") + ": " + Строка.Получить("error"));
        КонецЕсли;
    КонецЦикла;
КонецПроцедуры
```

### 6.3 Preluarea comenzilor

```bsl
Процедура ЗагрузитьЗаказыИзCRM() Экспорт

    Результат = ЛюксCRM.Запрос("GET", "/orders?exported=0&limit=100");
    Для Каждого Заказ Из Результат.Получить("data") Цикл
        НачатьТранзакцию();
        Попытка
            Документ = СоздатьРеализацию(Заказ); // ваша процедура: контрагент по customer.externalId / idno,
                                                 // строки по items[].productExternalId / sku, склад по warehouseCode
            Подтверждение = Новый Структура("docNumber, docId", Документ.Номер, Строка(Документ.Ссылка.УникальныйИдентификатор()));
            ЛюксCRM.Запрос("POST", "/orders/" + Заказ.Получить("id") + "/export", Подтверждение);
            ЗафиксироватьТранзакцию();
        Исключение
            ОтменитьТранзакцию();
            ЗаписьЖурналаРегистрации("ЛюксCRM.Заказы", УровеньЖурналаРегистрации.Ошибка, , , 
                Заказ.Получить("number") + ": " + ОписаниеОшибки());
        КонецПопытки;
    КонецЦикла;

КонецПроцедуры
```

### 6.4 Trimiterea unei plăți

```bsl
Платеж = Новый Структура;
Платеж.Вставить("amount", 7500);
Платеж.Вставить("method", "transfer");
Платеж.Вставить("date", ЛюксCRM.ДатаISO(ТекущаяДатаСеанса()));
Платеж.Вставить("reference", "ПП " + ДокументОплаты.Номер);
ЛюксCRM.Запрос("POST", "/orders/CMD-000124/payments", Платеж); // se acceptă și numărul comenzii
```

---

## 7. Webhook-uri (opțional, pentru actualizare instantă)

În loc de interogare periodică, CRM-ul poate trimite evenimente către un serviciu HTTP publicat de 1C (HTTP-сервис). Se configurează în CRM → Integrări → Webhook-uri.

```
POST <adresa ta>
Content-Type: application/json
X-Lux-Event: order.created
X-Lux-Delivery: 7f9c…  (UUID unic, pentru deduplicare)
X-Lux-Signature: sha256=<HMAC-SHA256(secret, corpul cererii) în hex>

{ "id": "7f9c…", "event": "order.created", "createdAt": "2026-10-17T09:12:00Z", "data": { …comanda, același format ca GET /orders… } }
```

Evenimente: `order.created`, `order.updated`, `order.status_changed`, `order.payment_added`, `order.deleted`, `product.created`, `product.updated`, `product.deleted`, `stock.changed`, `customer.created`, `customer.updated`, `arrival.created`, `transfer.created`, `writeoff.created`, `inventory.completed`, `task.created`.

- Răspundeți cu HTTP 2xx în maximum 8 secunde; la eroare de rețea / 5xx CRM-ul reîncearcă o dată.
- Webhook-urile sunt o notificare; sursa de adevăr rămâne API-ul (`GET /orders/{id}`).

---

## 8. Testare rapidă (curl)

```bash
curl -H "X-API-Key: $KEY" https://crmluxstore.vercel.app/api/v1/ping
curl -H "X-API-Key: $KEY" "https://crmluxstore.vercel.app/api/v1/orders?exported=0&limit=5"
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
     -d '{"items":[{"sku":"KC-GS-11","price":1499}]}' \
     https://crmluxstore.vercel.app/api/v1/products
```

---

## 9. Listă de verificare la punerea în funcțiune

1. [ ] Cheie API de tip „1C” creată în CRM, salvată în 1C (constantă / stocare securizată).
2. [ ] `GET /ping` reușit din 1C.
3. [ ] Depozitele din 1C trimise, cu `externalId` + `code`.
4. [ ] Grupele și nomenclatorul trimise; verificat în CRM → Integrări → 1C: „produse cu cod 1C”.
5. [ ] Contragenții B2B trimiși (IDNO, IBAN, tip preț, reducere, termen de plată).
6. [ ] Sarcina programată de schimb (5–15 min) activă în 1C.
7. [ ] Testat ciclul complet: comandă în CRM → confirmare → preluare în 1C → `export` → plată din 1C → comanda apare „Achitată” în CRM.
8. [ ] Jurnalul din CRM (Integrări → Jurnal, sursa 1C) fără erori.

---

## 10. Erori frecvente

| Mesaj | Cauză / soluție |
|---|---|
| `Cheie API invalidă sau revocată` | Cheie greșită sau revocată din CRM |
| `Cheia „…” nu are dreptul „write”` | Creați cheia cu drept de scriere |
| `Produs negăsit (…)` | Trimiteți întâi nomenclatorul sau folosiți `sku` / `barcode` existent |
| `Depozit negăsit` | Trimiteți depozitele sau folosiți `code` / `externalId` corect |
| `Stoc insuficient pentru „…”` | Comanda / casarea depășește stocul din CRM pe depozitul ales |
| `Suma depășește restul de plată` | Plata e mai mare decât restul comenzii (comanda e deja achitată?) |
| `Codul (SKU) „…” este deja folosit` | Două produse 1C cu același articol — unificați sau trimiteți `externalId` |
| HTTP 5xx / timeout | Reîncercați la următorul ciclu de schimb; datele sunt idempotente |
