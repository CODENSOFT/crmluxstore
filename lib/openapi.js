// Specificatia OpenAPI 3.1 pentru API-ul public v1 (se poate importa in Postman / Swagger / Insomnia)
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description, extra = {}) => ({ type: "number", description, ...extra });
const bool = (description) => ({ type: "boolean", description });
const nullable = (s) => ({ ...s, type: [s.type, "null"] });

const listResponse = (item) => ({
  description: "Listă paginată",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { ok: { const: true }, data: { type: "array", items: ref(item) }, meta: ref("ListMeta") },
      },
    },
  },
});
const oneResponse = (item, description = "OK") => ({
  description,
  content: { "application/json": { schema: { type: "object", properties: { ok: { const: true }, data: ref(item) } } } },
});
const batchBody = (item) => ({
  required: true,
  content: {
    "application/json": {
      schema: {
        oneOf: [
          { type: "object", properties: { items: { type: "array", maxItems: 1000, items: ref(item) } }, required: ["items"] },
          { type: "array", maxItems: 1000, items: ref(item) },
          ref(item),
        ],
      },
    },
  },
});
const errors = {
  400: { description: "Date invalide", content: { "application/json": { schema: ref("Error") } } },
  401: { description: "Cheie API lipsă sau invalidă", content: { "application/json": { schema: ref("Error") } } },
  403: { description: "Cheia nu are dreptul necesar (read / write)", content: { "application/json": { schema: ref("Error") } } },
  404: { description: "Inexistent", content: { "application/json": { schema: ref("Error") } } },
};
const p = (name, description, schema = { type: "string" }, where = "query") => ({ name, in: where, description, schema });
const paging = [p("page", "Pagina (de la 1)", { type: "integer", minimum: 1 }), p("limit", "Elemente pe pagină (max 1000)", { type: "integer", maximum: 1000 })];
const updatedSince = p("updatedSince", "Doar înregistrările modificate după această dată (ISO 8601). Folosiți-o pentru sincronizare incrementală.", { type: "string", format: "date-time" });
const idPath = (d) => p("id", d, { type: "string" }, "path");

export function openApiSpec(origin = "") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Lux Store CRM — API v1",
      version: "1.0.0",
      description:
        "API pentru integrarea CRM-ului Lux Store cu 1C și alte sisteme. Toate răspunsurile au forma `{ ok, data, meta? }` " +
        "sau `{ ok: false, error }`. Datele se trimit în UTF-8 JSON. Identificatorul comun cu 1C este câmpul `externalId` " +
        "(recomandat: UUID-ul obiectului din 1C). Vezi și documentul docs/INTEGRARE-1C.md.",
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ ApiKey: [] }, { Bearer: [] }],
    components: {
      securitySchemes: {
        ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        Bearer: { type: "http", scheme: "bearer" },
      },
      schemas: {
        Error: { type: "object", properties: { ok: { const: false }, error: str("Mesaj de eroare (în română)") } },
        ListMeta: {
          type: "object",
          properties: { page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" }, hasMore: { type: "boolean" } },
        },
        BatchResult: {
          type: "object",
          properties: {
            total: { type: "integer" },
            created: { type: "integer" },
            updated: { type: "integer" },
            errors: { type: "integer" },
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  index: { type: "integer", description: "Poziția elementului în cerere" },
                  status: { enum: ["created", "updated", "ok", "error"] },
                  id: str("ID-ul din CRM"),
                  externalId: nullable(str("ID-ul din 1C")),
                  error: str("Motivul erorii (doar pentru status=error)"),
                },
              },
            },
          },
        },
        StockLine: {
          type: "object",
          properties: {
            warehouseId: str("ID depozit CRM"),
            warehouseCode: nullable(str("Cod depozit")),
            warehouseExternalId: nullable(str("ID depozit în 1C")),
            warehouseName: nullable(str("Denumire depozit")),
            quantity: num("Cantitate"),
          },
        },
        Product: {
          type: "object",
          properties: {
            id: str("ID CRM"),
            externalId: nullable(str("ID 1C")),
            sku: nullable(str("Cod articol")),
            barcode: nullable(str("Cod de bare (EAN)")),
            name: str("Denumire"),
            description: nullable(str("Descriere")),
            categoryId: nullable(str("ID categorie CRM")),
            categoryName: nullable(str("Denumire categorie")),
            brand: nullable(str("Marcă")),
            packaging: nullable(str("Ambalaj (ex: Canistră 20 L)")),
            unit: { enum: ["bucata", "litri", "kg", "metru", "set", "pachet", "pereche"] },
            price: num("Preț cu amănuntul"),
            wholesalePrice: nullable(num("Preț angro")),
            costPrice: nullable(num("Preț de achiziție")),
            vatRate: nullable(num("Cota TVA (%); null = cota implicită")),
            minStock: nullable(num("Stoc minim")),
            stock: { type: "array", items: ref("StockLine") },
            totalStock: num("Stoc total"),
            active: bool("Activ"),
            updatedAt: str("Ultima modificare", { format: "date-time" }),
          },
        },
        ProductInput: {
          type: "object",
          description: "Potrivire (upsert): externalId → sku → barcode. Dacă nu se găsește, se creează un produs nou (name obligatoriu).",
          properties: {
            externalId: str("ID 1C (recomandat)"),
            sku: str("Cod articol"),
            barcode: str("Cod de bare"),
            name: str("Denumire"),
            description: str("Descriere"),
            categoryExternalId: str("ID categorie din 1C"),
            categoryName: str("Sau denumirea categoriei (se creează dacă nu există)"),
            brand: str("Marcă"),
            packaging: str("Ambalaj"),
            unit: { enum: ["bucata", "litri", "kg", "metru", "set", "pachet", "pereche"] },
            price: num("Preț cu amănuntul"),
            wholesalePrice: num("Preț angro"),
            costPrice: num("Preț de achiziție"),
            vatRate: num("Cota TVA %"),
            minStock: num("Stoc minim"),
            active: bool("Activ"),
            stock: {
              type: "array",
              description: "Opțional: cantități ABSOLUTE pe depozit (setează stocul)",
              items: { type: "object", properties: { warehouse: str("ID / cod / externalId depozit"), quantity: num("Cantitate") } },
            },
          },
        },
        Category: {
          type: "object",
          properties: { id: str("ID CRM"), externalId: nullable(str("ID 1C")), name: str("Denumire"), parentId: nullable(str("Categoria părinte")), active: bool("Activă") },
        },
        CategoryInput: {
          type: "object",
          required: ["name"],
          properties: { externalId: str("ID 1C"), name: str("Denumire"), parentExternalId: str("ID 1C al categoriei părinte"), active: bool("Activă") },
        },
        Warehouse: {
          type: "object",
          properties: {
            id: str("ID CRM"),
            externalId: nullable(str("ID 1C")),
            code: nullable(str("Cod")),
            name: str("Denumire"),
            type: { enum: ["warehouse", "store", "vehicle"] },
            address: nullable(str("Adresă")),
            isDefault: bool("Depozit implicit"),
            active: bool("Activ"),
          },
        },
        WarehouseInput: {
          type: "object",
          required: ["name"],
          properties: { externalId: str("ID 1C"), code: str("Cod"), name: str("Denumire"), address: str("Adresă"), type: { enum: ["warehouse", "store", "vehicle"] }, active: bool("Activ") },
        },
        Customer: {
          type: "object",
          properties: {
            id: str("ID CRM"),
            number: str("Cod client CRM (CL-00001)"),
            externalId: nullable(str("ID 1C")),
            type: { enum: ["individual", "company"] },
            name: str("Nume / denumire"),
            contactPerson: nullable(str("Persoană de contact")),
            phone: nullable(str("Telefon")),
            email: nullable(str("Email")),
            idno: nullable(str("IDNO / cod fiscal")),
            vatCode: nullable(str("Cod TVA")),
            iban: nullable(str("IBAN")),
            bank: nullable(str("Banca")),
            legalAddress: nullable(str("Adresa juridică")),
            city: nullable(str("Oraș")),
            address: nullable(str("Adresa de livrare")),
            segment: { enum: ["retail", "carwash", "detailing", "service", "dealer", "fleet", "other"] },
            priceType: { enum: ["retail", "wholesale"] },
            discount: num("Reducere implicită %"),
            paymentTermDays: num("Termen de plată (zile)"),
            stats: {
              type: "object",
              properties: { ordersCount: { type: "integer" }, totalSpent: num("Total cumpărături"), balance: num("Datorie curentă"), lastOrderAt: nullable(str("", { format: "date-time" })) },
            },
            updatedAt: str("Ultima modificare", { format: "date-time" }),
          },
        },
        CustomerInput: {
          type: "object",
          description: "Potrivire: externalId → IDNO → telefon → email. Clienți noi: name obligatoriu.",
          properties: {
            externalId: str("ID 1C"),
            type: { enum: ["individual", "company"] },
            name: str("Nume / denumire"),
            contactPerson: str("Persoană de contact"),
            phone: str("Telefon"),
            email: str("Email"),
            idno: str("IDNO"),
            vatCode: str("Cod TVA"),
            iban: str("IBAN"),
            bank: str("Banca"),
            legalAddress: str("Adresa juridică"),
            city: str("Oraș"),
            address: str("Adresa de livrare"),
            segment: { enum: ["retail", "carwash", "detailing", "service", "dealer", "fleet", "other"] },
            priceType: { enum: ["retail", "wholesale"] },
            discount: num("Reducere %"),
            paymentTermDays: num("Termen de plată (zile)"),
          },
        },
        OrderItem: {
          type: "object",
          properties: {
            productId: str("ID produs CRM"),
            productExternalId: nullable(str("ID produs 1C")),
            sku: nullable(str("Cod articol")),
            name: str("Denumire (la momentul comenzii)"),
            warehouseId: str("ID depozit CRM"),
            warehouseCode: nullable(str("Cod depozit")),
            warehouseExternalId: nullable(str("ID depozit 1C")),
            quantity: num("Cantitate"),
            unit: str("Unitate"),
            unitPrice: num("Preț unitar înainte de reducere"),
            discount: num("Reducere %"),
            lineTotal: num("Total linie după reducere"),
            vatRate: num("Cota TVA %"),
          },
        },
        Order: {
          type: "object",
          properties: {
            id: str("ID CRM"),
            number: str("Număr CRM (CMD-000123)"),
            status: { enum: ["new", "pending_approval", "processing", "ready", "invoicing", "completed", "rejected", "cancelled"] },
            statusLabel: str("Status în română"),
            channel: str("Canal de vânzare"),
            createdAt: str("", { format: "date-time" }),
            updatedAt: str("", { format: "date-time" }),
            currency: str("Moneda (MDL)"),
            customer: {
              type: "object",
              properties: { id: nullable(str("")), externalId: nullable(str("ID 1C")), name: nullable(str("")), phone: nullable(str("")), email: nullable(str("")), idno: nullable(str("")) },
            },
            items: { type: "array", items: ref("OrderItem") },
            subtotal: num("Suma liniilor"),
            deliveryCost: num("Cost livrare"),
            vatTotal: num("TVA"),
            total: num("Total de plată"),
            paymentMethod: str("cash | card | transfer | cod | online"),
            paymentStatus: { enum: ["unpaid", "partial", "paid"] },
            paidAmount: num("Suma achitată"),
            delivery: { type: "object" },
            external: { type: "object", properties: { source: nullable(str("woo | api | 1c")), id: nullable(str("")), number: nullable(str("")) } },
            export1c: {
              type: "object",
              properties: { exported: bool("A fost preluată în 1C"), exportedAt: nullable(str("", { format: "date-time" })), docNumber: nullable(str("Nr. document 1C")), docId: nullable(str("ID document 1C")) },
            },
          },
        },
        OrderInput: {
          type: "object",
          required: ["items"],
          properties: {
            externalId: str("ID-ul documentului din 1C (idempotență: aceeași valoare nu creează duplicate)"),
            externalNumber: str("Numărul documentului din 1C"),
            status: { enum: ["new", "processing", "completed"], default: "new", description: "processing/completed scad stocul" },
            channel: str("Canal (implicit 1c / api)"),
            customerId: str("ID client CRM"),
            customer: ref("CustomerInput"),
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["quantity"],
                properties: {
                  productId: str("ID produs CRM"),
                  productExternalId: str("sau ID 1C"),
                  sku: str("sau cod articol"),
                  barcode: str("sau cod de bare"),
                  warehouse: str("ID / cod / externalId depozit (implicit: depozitul principal)"),
                  quantity: num("Cantitate"),
                  price: num("Preț unitar (implicit: prețul din CRM)"),
                  discount: num("Reducere %"),
                },
              },
            },
            delivery: { type: "object", properties: { method: str("pickup | courier_chisinau | courier_moldova | own_transport"), cost: num(""), city: str(""), address: str("") } },
            paymentMethod: str("cash | card | transfer | cod | online"),
            payments: { type: "array", items: { type: "object", properties: { amount: num(""), method: str(""), reference: str("") } } },
            note: str("Observații"),
            responsibleEmail: str("Email-ul managerului responsabil"),
          },
        },
        SupplierInput: {
          type: "object",
          description: "Potrivire: externalId → IDNO → denumire.",
          properties: { externalId: str("ID 1C"), name: str("Denumire"), idno: str("IDNO"), phone: str(""), email: str(""), address: str(""), iban: str(""), contactPerson: str("") },
        },
        StockRow: {
          type: "object",
          properties: {
            productId: str(""),
            productExternalId: nullable(str("")),
            sku: nullable(str("")),
            name: str(""),
            warehouseId: str(""),
            warehouseCode: nullable(str("")),
            warehouseExternalId: nullable(str("")),
            quantity: num(""),
          },
        },
        StockInput: {
          type: "object",
          properties: {
            productExternalId: str("ID produs 1C"),
            sku: str("sau cod articol"),
            barcode: str("sau cod de bare"),
            productId: str("sau ID CRM"),
            warehouse: str("ID / cod / externalId / denumire depozit"),
            quantity: num("Cantitate (absolută la mode=set, diferență la mode=add)"),
          },
        },
        ArrivalInput: {
          type: "object",
          required: ["warehouse", "items"],
          properties: {
            externalId: str("ID document 1C (idempotență)"),
            warehouse: str("ID / cod / externalId depozit"),
            supplierId: str("ID furnizor CRM"),
            supplierExternalId: str("sau ID furnizor 1C"),
            supplier: str("sau doar numele furnizorului"),
            supplierInvoice: str("Nr. factură furnizor"),
            supplierInvoiceDate: str("", { format: "date" }),
            updateCostPrice: { type: "boolean", default: true },
            items: {
              type: "array",
              items: { type: "object", properties: { productExternalId: str(""), sku: str(""), productId: str(""), quantity: num(""), unitCost: num("Preț de achiziție") } },
            },
            note: str(""),
          },
        },
        Movement: {
          type: "object",
          properties: {
            id: str(""),
            productId: str(""),
            sku: nullable(str("")),
            productName: str(""),
            warehouseId: str(""),
            quantity: num("+ intrare / - ieșire"),
            balanceAfter: nullable(num("Sold după operațiune")),
            type: { enum: ["initial", "arrival", "sale", "sale_return", "transfer_out", "transfer_in", "writeoff", "inventory", "adjustment", "sync"] },
            ref: { type: "object", properties: { type: nullable(str("")), id: nullable(str("")), number: nullable(str("")) } },
            createdAt: str("", { format: "date-time" }),
          },
        },
      },
    },
    paths: {
      "/ping": { get: { summary: "Test conexiune și cheie API", responses: { 200: { description: "OK" }, ...errors } } },
      "/products": {
        get: { summary: "Lista produselor (cu stoc pe depozite)", parameters: [updatedSince, p("sku", "Filtru cod articol"), p("externalId", "Filtru ID 1C"), p("active", "1 = doar active"), ...paging], responses: { 200: listResponse("Product"), ...errors } },
        post: { summary: "Creare / actualizare produse (lot, max 1000)", requestBody: batchBody("ProductInput"), responses: { 200: oneResponse("BatchResult"), ...errors } },
      },
      "/products/{id}": {
        get: { summary: "Un produs (după ID CRM, externalId, SKU sau cod de bare)", parameters: [idPath("ID / externalId / SKU / barcode")], responses: { 200: oneResponse("Product"), ...errors } },
        delete: { summary: "Dezactivare produs", parameters: [idPath("ID / externalId / SKU")], responses: { 200: { description: "OK" }, ...errors } },
      },
      "/categories": {
        get: { summary: "Categorii", parameters: [updatedSince], responses: { 200: listResponse("Category"), ...errors } },
        post: { summary: "Creare / actualizare categorii", requestBody: batchBody("CategoryInput"), responses: { 200: oneResponse("BatchResult"), ...errors } },
      },
      "/warehouses": {
        get: { summary: "Depozite", responses: { 200: listResponse("Warehouse"), ...errors } },
        post: { summary: "Creare / actualizare depozite", requestBody: batchBody("WarehouseInput"), responses: { 200: oneResponse("BatchResult"), ...errors } },
      },
      "/customers": {
        get: { summary: "Clienți", parameters: [updatedSince, p("externalId", ""), p("idno", ""), p("q", "Căutare după nume"), ...paging], responses: { 200: listResponse("Customer"), ...errors } },
        post: { summary: "Creare / actualizare clienți", requestBody: batchBody("CustomerInput"), responses: { 200: oneResponse("BatchResult"), ...errors } },
      },
      "/customers/{id}": { get: { summary: "Un client (ID CRM / externalId / IDNO / cod)", parameters: [idPath("")], responses: { 200: oneResponse("Customer"), ...errors } } },
      "/suppliers": {
        get: { summary: "Furnizori", parameters: [updatedSince], responses: { 200: { description: "OK" }, ...errors } },
        post: { summary: "Creare / actualizare furnizori", requestBody: batchBody("SupplierInput"), responses: { 200: oneResponse("BatchResult"), ...errors } },
      },
      "/stock": {
        get: { summary: "Stocuri (produs × depozit)", parameters: [p("warehouse", "ID / cod / externalId depozit"), p("sku", ""), updatedSince], responses: { 200: listResponse("StockRow"), ...errors } },
        post: {
          summary: "Setare stocuri din 1C",
          description: "mode=set (implicit): cantitatea devine exact valoarea trimisă. mode=add: se adaugă (sau scade, cu valoare negativă). Fiecare modificare apare în registrul de stoc cu tipul „sync”.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { mode: { enum: ["set", "add"] }, note: str(""), items: { type: "array", items: ref("StockInput") } } } } },
          },
          responses: { 200: oneResponse("BatchResult"), ...errors },
        },
      },
      "/orders": {
        get: {
          summary: "Comenzi",
          description: "Pentru preluare în 1C folosiți `exported=0` (comenzile confirmate, încă nepreluate) sau `updatedSince`.",
          parameters: [updatedSince, p("createdSince", "", { type: "string", format: "date-time" }), p("status", "Listă separată prin virgulă"), p("exported", "0 = nepreluate în 1C, 1 = preluate"), p("channel", ""), ...paging],
          responses: { 200: listResponse("Order"), ...errors },
        },
        post: { summary: "Creare comandă (idempotent după externalId)", requestBody: { required: true, content: { "application/json": { schema: ref("OrderInput") } } }, responses: { 201: oneResponse("Order", "Creată"), 200: oneResponse("Order", "Există deja (meta.duplicate = true)"), ...errors } },
      },
      "/orders/{id}": {
        get: { summary: "O comandă (ID / număr CMD- / externalId)", parameters: [idPath("")], responses: { 200: oneResponse("Order"), ...errors } },
        patch: {
          summary: "Actualizare: status, confirmare export 1C, factură, AWB",
          parameters: [idPath("")],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { enum: ["processing", "ready", "invoicing", "completed", "cancelled"] },
                    reason: str("Motiv (la anulare)"),
                    export1c: { type: "object", properties: { docNumber: str(""), docId: str("") } },
                    invoice: { type: "object", properties: { number: str("Nr. factură fiscală"), date: str("", { format: "date" }) } },
                    delivery: { type: "object", properties: { trackingNumber: str("") } },
                  },
                },
              },
            },
          },
          responses: { 200: oneResponse("Order"), ...errors },
        },
      },
      "/orders/{id}/export": {
        post: { summary: "Confirmare: comanda a fost preluată în 1C", parameters: [idPath("")], requestBody: { content: { "application/json": { schema: { type: "object", properties: { docNumber: str("Nr. document 1C"), docId: str("UUID document 1C") } } } } }, responses: { 200: oneResponse("Order"), ...errors } },
      },
      "/orders/{id}/payments": {
        post: { summary: "Înregistrare plată (ex: încasare în 1C)", parameters: [idPath("")], requestBody: { content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: num(""), method: str("cash | card | transfer"), date: str("", { format: "date-time" }), reference: str("Nr. document") } } } } }, responses: { 200: oneResponse("Order"), ...errors } },
      },
      "/arrivals": {
        get: { summary: "Recepții de marfă", parameters: [p("since", "Create după (ISO)", { type: "string", format: "date-time" }), ...paging], responses: { 200: { description: "OK" }, ...errors } },
        post: { summary: "Recepție de marfă din 1C (crește stocul)", requestBody: { required: true, content: { "application/json": { schema: ref("ArrivalInput") } } }, responses: { 201: { description: "Creată" }, ...errors } },
      },
      "/movements": {
        get: {
          summary: "Registrul de stoc (toate mișcările), în ordine cronologică",
          description: "Paginare prin `since`: trimiteți `meta.nextSince` din răspunsul anterior.",
          parameters: [p("since", "", { type: "string", format: "date-time" }), p("type", "Tipuri separate prin virgulă"), p("warehouse", ""), p("product", "ID / SKU"), p("limit", "max 1000", { type: "integer" })],
          responses: { 200: listResponse("Movement"), ...errors },
        },
      },
      "/changes": {
        get: {
          summary: "Fluxul de modificări (CRM → 1C): tot ce s-a schimbat după cursor",
          description:
            "Fiecare element: { seq, entity, id, op: upsert|delete, at, data } — `data` este starea completă a obiectului. " +
            "Continuați cu `after = meta.cursor` cât timp `meta.hasMore`. Modificările trimise chiar de această cheie nu se întorc (fără ecou), decât cu `includeOwn=1`.",
          parameters: [
            p("after", "Cursorul de la ultimul schimb (0 = de la început)", { type: "integer", minimum: 0 }),
            p("limit", "Obiecte pe pagină (max 500)", { type: "integer", maximum: 500 }),
            p("entities", "Filtru: product,category,warehouse,customer,supplier,order,stock,arrival,transfer,writeoff,inventory"),
            p("includeOwn", "1 = include și modificările făcute de această cheie", { type: "string", enum: ["1"] }),
          ],
          responses: { 200: { description: "OK — { data: [...], meta: { after, cursor, hasMore, count } }" }, ...errors },
        },
      },
      "/changes/cursor": { get: { summary: "Cursorul curent (după încărcarea completă inițială)", responses: { 200: { description: "{ data: { cursor } }" }, ...errors } } },
      "/changes/ack": {
        post: {
          summary: "1C confirmă cursorul procesat (vizibil în CRM → Integrări → 1C)",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["cursor"], properties: { cursor: { type: "integer" } } } } } },
          responses: { 200: { description: "OK" }, ...errors },
        },
      },
      "/objects/{entity}/{id}": {
        get: { summary: "Starea completă a unui obiect (același format ca în fluxul de modificări)", parameters: [p("entity", "product, customer, order, stock, arrival, transfer, writeoff, inventory …", { type: "string" }, "path"), idPath("ID CRM")], responses: { 200: { description: "OK" }, ...errors } },
      },
      "/customers/{id}/prices": {
        get: { summary: "Prețurile individuale ale clientului", parameters: [idPath("ID CRM / externalId / IDNO / număr")], responses: { 200: { description: "OK" }, ...errors } },
        post: {
          summary: "Setează prețurile individuale ale clientului (din 1C)",
          parameters: [idPath("ID CRM / externalId / IDNO / număr")],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { mode: str("replace (implicit) | merge"), items: { type: "array", items: { type: "object", properties: { productExternalId: str(""), sku: str(""), productId: str(""), price: num("Preț final cu TVA") } } } } } } } },
          responses: { 200: { description: "OK" }, ...errors },
        },
      },
      "/transfers": {
        get: { summary: "Transferuri între depozite", parameters: [updatedSince, ...paging], responses: { 200: { description: "OK" }, ...errors } },
        post: { summary: "Transfer din 1C", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { externalId: str("UUID document 1C"), fromWarehouseCode: str(""), toWarehouseCode: str(""), items: { type: "array", items: { type: "object", properties: { productExternalId: str(""), sku: str(""), quantity: num("") } } } } } } } }, responses: { 201: { description: "Creat" }, ...errors } },
      },
      "/writeoffs": {
        get: { summary: "Casări", parameters: [updatedSince, ...paging], responses: { 200: { description: "OK" }, ...errors } },
        post: { summary: "Casare din 1C", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { externalId: str(""), warehouseCode: str(""), reasonCode: str("expired | damaged | defect | internal | sample | lost | other"), reason: str(""), items: { type: "array", items: { type: "object", properties: { productExternalId: str(""), sku: str(""), quantity: num("") } } } } } } } }, responses: { 201: { description: "Creată" }, ...errors } },
      },
      "/inventory": { get: { summary: "Inventarieri finalizate (stoc corectat)", parameters: [updatedSince, ...paging], responses: { 200: { description: "OK" }, ...errors } } },
    },
  };
}
