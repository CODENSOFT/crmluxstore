// Botul Telegram al magazinului: catalog pe categorii, fisa produsului cu foto, cos,
// verificarea stocului in timp real si plasarea comenzii direct in CRM (canal „Bot Telegram”).
import crypto from "node:crypto";
import { db, isUuid } from "../db";
import { getSettings } from "../settings";
import { UNIT_LABELS } from "../constants";
import { createOrder, systemActor } from "../orderService";
import { upsertCustomer, findCustomerMatch } from "../customers";
import { logIntegration } from "../integrationLog";
import { tg, tgUploadPhoto, esc, TelegramError } from "./api";
import { T, STATUS_TEXT, UNITS_RU, menuAction } from "./texts";

const PAGE = 8;
const NONE = "none"; // produse fara categorie

const fmtMoney = (n) => `${Number(n || 0).toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MDL`;
const trunc = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const qtyFmt = (n) => Number(n || 0).toLocaleString("ro-RO", { maximumFractionDigits: 3 });

/* ---------------- Stare conversatie ---------------- */

async function loadChat(chat, from) {
  const lang = String(from?.language_code || "").startsWith("ru") ? "ru" : "ro";
  const [row] = await db()`
    insert into telegram_chats (chat_id, username, first_name, last_name, lang)
    values (${chat.id}, ${from?.username || null}, ${from?.first_name || null}, ${from?.last_name || null}, ${lang})
    on conflict (chat_id) do update set
      username = excluded.username, first_name = excluded.first_name, last_name = excluded.last_name, updated_at = now()
    returning *`;
  return row;
}

async function saveChat(chatId, patch) {
  const sql = db();
  const data = { ...patch };
  if (data.state) data.state = sql.json(data.state);
  if (data.cart) data.cart = sql.json(data.cart);
  await sql`update telegram_chats set ${sql(data, ...Object.keys(data))}, updated_at = now() where chat_id = ${chatId}`;
}

/* ---------------- Date din CRM ---------------- */

const sellWarehouse = (s) => s.telegram?.warehouse || s.defaultWarehouse;

async function stockMap(productIds, warehouse) {
  if (!productIds.length || !isUuid(String(warehouse || ""))) return new Map();
  const rows = await db()`select product_id, quantity from stock where warehouse_id = ${warehouse} and product_id in ${db()(productIds)}`;
  return new Map(rows.map((r) => [String(r.productId), Math.max(0, r.quantity)]));
}

// Pretul pentru client: pret individual > angro (daca clientul e angro) > amanunt
async function priceMap(chat, productIds) {
  const sql = db();
  if (!productIds.length) return new Map();
  const products = await sql`select id, price, wholesale_price from products where id in ${sql(productIds)}`;
  let priceType = "retail";
  const special = new Map();
  if (isUuid(String(chat.customerId || ""))) {
    const [c] = await sql`select price_type from customers where id = ${chat.customerId}`;
    priceType = c?.priceType || "retail";
    const rows = await sql`select product_id, price from customer_prices where customer_id = ${chat.customerId} and product_id in ${sql(productIds)}`;
    for (const r of rows) special.set(String(r.productId), r.price);
  }
  return new Map(
    products.map((p) => [
      String(p._id),
      special.get(String(p._id)) ?? (priceType === "wholesale" && p.wholesalePrice > 0 ? p.wholesalePrice : p.price || 0),
    ])
  );
}

/* ---------------- Context si trimitere ---------------- */

function makeCtx(settings, chat, message) {
  const token = settings.telegram.token;
  const lang = chat.lang === "ru" ? "ru" : "ro";
  const t = (key, vars) => T(lang, key, vars);
  const unit = (u) => (lang === "ru" ? UNITS_RU[u] || u : UNIT_LABELS[u] || u);
  const mainKeyboard = {
    keyboard: [
      [{ text: t("menu_catalog") }, { text: t("menu_cart") }],
      [{ text: t("menu_orders") }, { text: t("menu_contacts") }],
      [{ text: t("menu_lang") }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
  const send = (text, reply_markup) =>
    tg(token, "sendMessage", { chat_id: chat.chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(reply_markup && { reply_markup }) });
  // Inlocuieste mesajul cu butoane (editare daca e text; altfel sterge si trimite unul nou)
  const replace = async (text, reply_markup) => {
    if (message?.message_id && message.text !== undefined) {
      try {
        return await tg(token, "editMessageText", { chat_id: chat.chatId, message_id: message.message_id, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup });
      } catch (e) {
        if (/not modified/i.test(e.message)) return null;
      }
    } else if (message?.message_id) {
      await tg(token, "deleteMessage", { chat_id: chat.chatId, message_id: message.message_id }).catch(() => {});
    }
    return send(text, reply_markup);
  };
  return { settings, token, chat, lang, t, unit, send, replace, mainKeyboard, warehouse: sellWarehouse(settings) };
}

/* ---------------- Ecrane ---------------- */

async function showCategories(ctx, { fresh = false } = {}) {
  const rows = await db()`
    select c.id, c.name, count(p.id)::int as n
    from products p left join categories c on c.id = p.category_id
    where p.active
    group by c.id, c.name, c.sort
    order by c.sort nulls last, lower(c.name) nulls last`;
  if (!rows.length) return ctx.send(ctx.t("no_categories"), ctx.mainKeyboard);
  const buttons = rows.map((r) => ({ text: `${r._id ? trunc(r.name, 28) : ctx.lang === "ru" ? "Другие товары" : "Alte produse"} (${r.n})`, callback_data: `c:${r._id || NONE}:0` }));
  const kb = [];
  for (let i = 0; i < buttons.length; i += 2) kb.push(buttons.slice(i, i + 2));
  const markup = { inline_keyboard: kb };
  return fresh ? ctx.send(ctx.t("choose_category"), markup) : ctx.replace(ctx.t("choose_category"), markup);
}

async function showCategory(ctx, catId, page = 0) {
  const sql = db();
  const byCat = catId === NONE ? sql`p.category_id is null` : sql`p.category_id = ${catId}`;
  const [cat] = catId === NONE ? [{ name: ctx.lang === "ru" ? "Другие товары" : "Alte produse" }] : await sql`select name from categories where id = ${catId}`;
  const products = await sql`
    select p.id, p.name, p.unit, count(*) over () as full_count
    from products p where p.active and ${byCat}
    order by lower(p.name) limit ${PAGE} offset ${page * PAGE}`;
  if (!cat || !products.length) return ctx.replace(ctx.t("category_empty"), { inline_keyboard: [[{ text: ctx.t("back_categories"), callback_data: "cats" }]] });
  const total = products[0].fullCount;
  const ids = products.map((p) => p._id);
  const [stock, prices] = await Promise.all([stockMap(ids, ctx.warehouse), priceMap(ctx.chat, ids)]);
  const kb = products.map((p) => [
    { text: `${(stock.get(String(p._id)) || 0) > 0 ? "🟢" : "⚪️"} ${trunc(p.name, 34)} · ${fmtMoney(prices.get(String(p._id)))}`, callback_data: `p:${p._id}` },
  ]);
  const nav = [];
  if (page > 0) nav.push({ text: ctx.t("prev"), callback_data: `c:${catId}:${page - 1}` });
  if ((page + 1) * PAGE < total) nav.push({ text: ctx.t("next"), callback_data: `c:${catId}:${page + 1}` });
  if (nav.length) kb.push(nav);
  kb.push([{ text: ctx.t("back_categories"), callback_data: "cats" }]);
  const pages = Math.ceil(total / PAGE);
  return ctx.replace(`${ctx.t("category_products", { category: esc(cat.name), total })}${pages > 1 ? `\n${page + 1}/${pages}` : ""}`, { inline_keyboard: kb });
}

async function showProduct(ctx, productId, message) {
  const sql = db();
  const [p] = isUuid(productId)
    ? await sql`select id, name, description, unit, sku, packaging, category_id, photo, tg_photo from products where id = ${productId} and active`
    : [];
  if (!p) return ctx.send(ctx.t("category_empty"));
  const [stock, prices] = await Promise.all([stockMap([p._id], ctx.warehouse), priceMap(ctx.chat, [p._id])]);
  const qty = stock.get(String(p._id)) || 0;
  const desc = p.description ? `\n\n${esc(trunc(p.description.replace(/\s+\n/g, "\n").trim(), 650))}` : "";
  const caption = [
    `<b>${esc(p.name)}</b>${p.packaging ? ` · ${esc(p.packaging)}` : ""}${desc}`,
    "",
    ctx.t("price", { price: fmtMoney(prices.get(String(p._id))) }) + ` / ${ctx.unit(p.unit)}`,
    qty > 0 ? ctx.t("in_stock", { qty: qtyFmt(qty), unit: ctx.unit(p.unit) }) : ctx.t("out_of_stock"),
  ].join("\n");
  const kb = [];
  if (qty > 0) kb.push([{ text: ctx.t("add_to_cart"), callback_data: `a:${p._id}` }]);
  kb.push([{ text: ctx.t("back"), callback_data: `c:${p.categoryId || NONE}:0` }]);
  const reply_markup = { inline_keyboard: kb };

  // mesajul cu lista dispare; fisa produsului vine ca mesaj nou (cu fotografie)
  if (message?.message_id) await tg(ctx.token, "deleteMessage", { chat_id: ctx.chat.chatId, message_id: message.message_id }).catch(() => {});
  if (!p.photo) return ctx.send(caption, reply_markup);
  // versiunea fotografiei = amprenta continutului (updated_at se schimba la orice editare)
  const version = crypto.createHash("sha1").update(p.photo).digest("hex").slice(0, 16);
  const base = { chat_id: ctx.chat.chatId, caption, parse_mode: "HTML", reply_markup };
  try {
    if (p.tgPhoto?.v === version && p.tgPhoto.id) return await tg(ctx.token, "sendPhoto", { ...base, photo: p.tgPhoto.id });
    let res;
    if (/^https?:\/\//.test(p.photo)) res = await tg(ctx.token, "sendPhoto", { ...base, photo: p.photo });
    else {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(p.photo);
      if (!m) return ctx.send(caption, reply_markup);
      res = await tgUploadPhoto(ctx.token, base, { buffer: Buffer.from(m[2], "base64"), mime: m[1] });
    }
    const best = res?.photo?.[res.photo.length - 1];
    if (best?.file_id) await sql`update products set tg_photo = ${sql.json({ v: version, id: best.file_id })} where id = ${p._id}`;
    return res;
  } catch {
    return ctx.send(caption, reply_markup); // fotografia nu a putut fi trimisa — fisa fara foto
  }
}

async function askQty(ctx, productId) {
  const [p] = isUuid(productId) ? await db()`select id, name, unit from products where id = ${productId}` : [];
  if (!p) return;
  const stock = (await stockMap([p._id], ctx.warehouse)).get(String(p._id)) || 0;
  await saveChat(ctx.chat.chatId, { state: { step: "qty", product: p._id } });
  const opts = [1, 2, 3, 5, 10].map((n) => ({ text: String(n), callback_data: `q:${p._id}:${n}` }));
  return ctx.send(ctx.t("how_many", { unit: ctx.unit(p.unit), name: esc(p.name), qty: qtyFmt(stock) }), {
    inline_keyboard: [opts, [{ text: ctx.t("other_qty"), callback_data: `oq:${p._id}` }], [{ text: ctx.t("cancel"), callback_data: "x" }]],
  });
}

const cartQty = (cart, pid) => cart.filter((l) => String(l.product) === String(pid)).reduce((s, l) => s + l.qty, 0);

async function addQty(ctx, productId, wanted) {
  const [p] = isUuid(productId) ? await db()`select id, name, unit from products where id = ${productId} and active` : [];
  if (!p) return;
  const cart = ctx.chat.cart || [];
  const stock = (await stockMap([p._id], ctx.warehouse)).get(String(p._id)) || 0;
  const avail = Math.max(0, stock - cartQty(cart, p._id));
  const unit = ctx.unit(p.unit);
  const more = { inline_keyboard: [[{ text: ctx.t("view_cart"), callback_data: "cart" }, { text: ctx.t("continue_shopping"), callback_data: "cats" }]] };
  await saveChat(ctx.chat.chatId, { state: {} });
  if (avail <= 0) return ctx.send(ctx.t("not_available", { name: esc(p.name) }), more);
  if (wanted > avail) {
    // cantitatea propusa este mereu mai mica decat cea ceruta (cat este in stoc)
    const offer = Math.floor(avail) === avail ? avail : Math.floor(avail * 1000) / 1000;
    return ctx.send(ctx.t("only_available", { name: esc(p.name), qty: qtyFmt(offer), unit, wanted: qtyFmt(wanted) }), {
      inline_keyboard: [[{ text: ctx.t("order_available", { qty: qtyFmt(offer), unit }), callback_data: `q:${p._id}:${offer}` }], [{ text: ctx.t("cancel"), callback_data: "x" }]],
    });
  }
  const next = [...cart];
  const line = next.find((l) => String(l.product) === String(p._id));
  if (line) line.qty += wanted;
  else next.push({ product: p._id, qty: wanted });
  await saveChat(ctx.chat.chatId, { cart: next });
  ctx.chat.cart = next;
  const prices = await priceMap(ctx.chat, next.map((l) => l.product));
  const total = next.reduce((s, l) => s + l.qty * (prices.get(String(l.product)) || 0), 0);
  return ctx.send(ctx.t("added", { name: esc(p.name), qty: qtyFmt(wanted), count: next.length, total: fmtMoney(total) }), more);
}

async function cartLines(ctx) {
  const cart = ctx.chat.cart || [];
  if (!cart.length) return [];
  const ids = cart.map((l) => l.product);
  const [products, prices] = await Promise.all([
    db()`select id, name, unit from products where id in ${db()(ids)} and active`,
    priceMap(ctx.chat, ids),
  ]);
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return cart
    .map((l) => ({ ...l, p: byId.get(String(l.product)), price: prices.get(String(l.product)) || 0 }))
    .filter((l) => l.p);
}

async function showCart(ctx, { replace = false } = {}) {
  const lines = await cartLines(ctx);
  if (!lines.length) return (replace ? ctx.replace : ctx.send)(ctx.t("cart_empty"), { inline_keyboard: [[{ text: ctx.t("continue_shopping"), callback_data: "cats" }]] });
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const text = [
    ctx.t("cart_title"),
    "",
    ...lines.map((l) => `• ${esc(l.p.name)}\n   ${qtyFmt(l.qty)} ${ctx.unit(l.p.unit)} × ${fmtMoney(l.price)} = <b>${fmtMoney(l.qty * l.price)}</b>`),
    "",
    ctx.t("cart_total", { total: fmtMoney(total) }),
  ].join("\n");
  const kb = lines.map((l) => [{ text: `❌ ${trunc(l.p.name, 30)}`, callback_data: `rm:${l.product}` }]);
  kb.push([{ text: ctx.t("checkout"), callback_data: "co" }]);
  kb.push([{ text: ctx.t("clear_cart"), callback_data: "clr" }, { text: ctx.t("continue_shopping"), callback_data: "cats" }]);
  return (replace ? ctx.replace : ctx.send)(text, { inline_keyboard: kb });
}

// Reverifica stocul pentru tot cosul; scade cantitatile peste stoc. Intoarce liniile modificate.
async function revalidateCart(ctx) {
  const cart = ctx.chat.cart || [];
  const lines = await cartLines(ctx);
  const stock = await stockMap(lines.map((l) => l.product), ctx.warehouse);
  const changes = [];
  const next = [];
  for (const l of lines) {
    const avail = stock.get(String(l.product)) || 0;
    if (l.qty > avail) {
      changes.push(`• ${esc(l.p.name)}: ${qtyFmt(l.qty)} → ${qtyFmt(avail)}`);
      if (avail > 0) next.push({ product: l.product, qty: avail });
    } else next.push({ product: l.product, qty: l.qty });
  }
  if (changes.length || next.length !== cart.length) {
    await saveChat(ctx.chat.chatId, { cart: next });
    ctx.chat.cart = next;
  }
  return changes;
}

async function startCheckout(ctx) {
  if (!(ctx.chat.cart || []).length) return ctx.send(ctx.t("cart_empty"), ctx.mainKeyboard);
  const changes = await revalidateCart(ctx);
  if (changes.length) {
    await ctx.send(ctx.t("stock_changed", { lines: changes.join("\n") }));
    return showCart(ctx);
  }
  if (!ctx.chat.phone) {
    await saveChat(ctx.chat.chatId, { state: { step: "phone" } });
    return ctx.send(ctx.t("ask_phone"), {
      keyboard: [[{ text: ctx.t("send_phone"), request_contact: true }], [{ text: ctx.t("cancel") }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
  }
  return askDelivery(ctx);
}

function deliveryMethods(ctx) {
  return (ctx.settings.deliveryMethods || []).filter((m) => m.active !== false);
}

async function askDelivery(ctx) {
  await saveChat(ctx.chat.chatId, { state: { ...(ctx.chat.state || {}), step: "delivery" } });
  const kb = deliveryMethods(ctx).map((m) => [{ text: `${m.label}${m.cost ? ` — ${fmtMoney(m.cost)}` : ""}`, callback_data: `d:${m.key}` }]);
  kb.push([{ text: ctx.t("cancel"), callback_data: "x" }]);
  return ctx.send(ctx.t("ask_delivery"), { inline_keyboard: kb });
}

async function showConfirm(ctx) {
  const st = ctx.chat.state || {};
  const lines = await cartLines(ctx);
  if (!lines.length) return ctx.send(ctx.t("cart_empty"), ctx.mainKeyboard);
  const method = deliveryMethods(ctx).find((m) => m.key === st.delivery) || deliveryMethods(ctx)[0];
  const items = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = items + (method?.cost || 0);
  const text = [
    ctx.t("confirm_title"),
    "",
    ...lines.map((l) => `• ${esc(l.p.name)} — ${qtyFmt(l.qty)} ${ctx.unit(l.p.unit)} × ${fmtMoney(l.price)}`),
    "",
    ctx.t("confirm_delivery", { method: `${esc(method?.label || "—")}${method?.cost ? ` (${fmtMoney(method.cost)})` : ""}` }),
    st.address && method?.key !== "pickup" ? ctx.t("confirm_address", { address: esc(st.address) }) : null,
    ctx.t("confirm_phone", { phone: esc(ctx.chat.phone) }),
    "",
    ctx.t("confirm_total", { total: fmtMoney(total) }),
  ]
    .filter((x) => x !== null)
    .join("\n");
  await saveChat(ctx.chat.chatId, { state: { ...st, step: "confirm" } });
  return ctx.send(text, {
    inline_keyboard: [[{ text: ctx.t("confirm_btn"), callback_data: "ok" }], [{ text: ctx.t("edit_cart"), callback_data: "cart" }, { text: ctx.t("cancel"), callback_data: "x" }]],
  });
}

async function placeOrder(ctx) {
  const st = ctx.chat.state || {};
  if (st.step !== "confirm") return showCart(ctx);
  const changes = await revalidateCart(ctx);
  if (changes.length) {
    await ctx.send(ctx.t("stock_changed", { lines: changes.join("\n") }));
    return showCart(ctx);
  }
  const lines = await cartLines(ctx);
  if (!lines.length) return ctx.send(ctx.t("cart_empty"), ctx.mainKeyboard);
  const name = [ctx.chat.firstName, ctx.chat.lastName].filter(Boolean).join(" ") || (ctx.chat.username ? `@${ctx.chat.username}` : "Client Telegram");
  const method = deliveryMethods(ctx).find((m) => m.key === st.delivery) || deliveryMethods(ctx)[0];
  try {
    const { customer } = await upsertCustomer({
      name,
      phone: ctx.chat.phone,
      address: method?.key !== "pickup" ? st.address : undefined,
      source: "telegram",
    });
    const order = await createOrder(
      {
        items: lines.map((l) => ({ product: l.product, warehouse: ctx.warehouse, quantity: l.qty })),
        customer: customer._id,
        customerName: name,
        customerPhone: ctx.chat.phone,
        channel: "telegram",
        delivery: { method: method?.key || "pickup", address: method?.key !== "pickup" ? st.address : undefined, phone: ctx.chat.phone },
        note: [`Comandă din botul Telegram${ctx.chat.username ? ` (@${ctx.chat.username})` : ""}`, ctx.lang === "ru" ? "Limba clientului: rusă" : null].filter(Boolean).join(" · "),
        externalSource: "telegram",
        externalId: `${ctx.chat.chatId}-${Date.now()}`,
        telegramChatId: ctx.chat.chatId,
        warehouse: ctx.warehouse,
      },
      await systemActor("Bot Telegram"),
      { initialStatus: "new", incoming: "Telegram" }
    );
    await saveChat(ctx.chat.chatId, { cart: [], state: { address: st.address }, customerId: customer._id, ordersCount: (ctx.chat.ordersCount || 0) + 1 });
    await logIntegration({ source: "telegram", direction: "in", action: "order.created", ref: order.number, message: `Comandă din bot: ${name} · ${ctx.chat.phone}` });
    return ctx.send(ctx.t("order_created", { number: order.number, total: fmtMoney(order.total) }), ctx.mainKeyboard);
  } catch (e) {
    await logIntegration({ source: "telegram", direction: "in", action: "order.created", status: "error", message: e.message });
    return ctx.send(ctx.t("order_failed"), ctx.mainKeyboard);
  }
}

async function showMyOrders(ctx) {
  const rows = await db()`select number, status, total, created_at from orders where telegram_chat_id = ${ctx.chat.chatId} order by created_at desc limit 5`;
  if (!rows.length) return ctx.send(ctx.t("my_orders_empty"), ctx.mainKeyboard);
  const st = STATUS_TEXT[ctx.lang] || STATUS_TEXT.ro;
  const text = [
    ctx.t("my_orders_title"),
    "",
    ...rows.map((o) => `• <b>${o.number}</b> · ${new Date(o.createdAt).toLocaleDateString("ro-RO")} · ${fmtMoney(o.total)}\n   ${st[o.status] || o.status}`),
  ].join("\n");
  return ctx.send(text, ctx.mainKeyboard);
}

async function showContacts(ctx) {
  const s = ctx.settings;
  const text = ctx.t("contacts", {
    shop: esc(s.companyName || "Lux Store"),
    phone: s.phone ? `☎️ ${esc(s.phone)}` : "",
    address: s.address ? `📍 ${esc(s.address)}` : "",
    website: s.website ? `🌐 ${esc(s.website)}` : "",
  });
  return ctx.send(`${text}${s.telegram?.contactText ? `\n\n${esc(s.telegram.contactText)}` : ""}`.replace(/\n{3,}/g, "\n\n"), ctx.mainKeyboard);
}

async function searchProducts(ctx, q) {
  const l = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db()`
    select id, name from products where active and (name ilike ${l} or sku ilike ${l} or brand ilike ${l})
    order by lower(name) limit ${PAGE}`;
  if (!rows.length) return null;
  const prices = await priceMap(ctx.chat, rows.map((r) => r._id));
  return ctx.send(`🔎 ${esc(q)}`, {
    inline_keyboard: rows.map((p) => [{ text: `${trunc(p.name, 36)} · ${fmtMoney(prices.get(String(p._id)))}`, callback_data: `p:${p._id}` }]),
  });
}

/* ---------------- Punctul de intrare ---------------- */

const normPhone = (s) => {
  const d = String(s || "").replace(/[^\d+]/g, "");
  return d.replace(/\D/g, "").length >= 8 ? d : null;
};

async function onMessage(ctx, msg) {
  const text = (msg.text || "").trim();
  const st = ctx.chat.state || {};

  if (msg.contact || (st.step === "phone" && text && text !== ctx.t("cancel"))) {
    const phone = normPhone(msg.contact?.phone_number || text);
    if (!phone) return ctx.send(ctx.t("bad_phone"));
    const match = await findCustomerMatch({ phone }).catch(() => null);
    await saveChat(ctx.chat.chatId, { phone, ...(match && { customerId: match._id }) });
    ctx.chat.phone = phone;
    if (match) ctx.chat.customerId = match._id;
    await ctx.send("👍", ctx.mainKeyboard);
    return askDelivery(ctx);
  }

  if (text.startsWith("/start")) {
    await saveChat(ctx.chat.chatId, { state: {} });
    const name = esc(msg.from?.first_name || "");
    await ctx.send(ctx.t("welcome", { name, shop: esc(ctx.settings.companyName || "Lux Store") }), ctx.mainKeyboard);
    return showCategories(ctx, { fresh: true });
  }
  if (text === "/lang") return switchLang(ctx);

  const action = menuAction(text);
  if (action || text === ctx.t("cancel")) await saveChat(ctx.chat.chatId, { state: { address: st.address } });
  if (action === "menu_catalog") return showCategories(ctx, { fresh: true });
  if (action === "menu_cart") return showCart(ctx);
  if (action === "menu_orders") return showMyOrders(ctx);
  if (action === "menu_contacts") return showContacts(ctx);
  if (action === "menu_lang") return switchLang(ctx);
  if (text === ctx.t("cancel")) return ctx.send("👌", ctx.mainKeyboard);

  if (st.step === "qty" && st.product) {
    const n = Number(text.replace(",", "."));
    if (!(n > 0) || n > 100000) return ctx.send(ctx.t("bad_qty"));
    return addQty(ctx, st.product, n);
  }
  if (st.step === "address" && text) {
    await saveChat(ctx.chat.chatId, { state: { ...st, address: text.slice(0, 300) } });
    ctx.chat.state = { ...st, address: text.slice(0, 300) };
    return showConfirm(ctx);
  }
  if (text.length >= 2) {
    const found = await searchProducts(ctx, text.slice(0, 60));
    if (found) return found;
  }
  return ctx.send(ctx.t("unknown"), ctx.mainKeyboard);
}

async function switchLang(ctx) {
  const lang = ctx.lang === "ru" ? "ro" : "ru";
  await saveChat(ctx.chat.chatId, { lang });
  const next = makeCtx(ctx.settings, { ...ctx.chat, lang });
  return next.send(next.t("lang_set"), next.mainKeyboard);
}

async function onCallback(ctx, cb) {
  const data = cb.data || "";
  const msg = cb.message;
  const [kind, a, b] = data.split(":");
  await tg(ctx.token, "answerCallbackQuery", { callback_query_id: cb.id }).catch(() => {});
  switch (kind) {
    case "cats":
      return showCategories(ctx);
    case "c":
      return showCategory(ctx, isUuid(a) ? a : NONE, Math.max(0, Number(b) || 0));
    case "p":
      return showProduct(ctx, a, msg?.text !== undefined ? msg : null);
    case "a":
      return askQty(ctx, a);
    case "oq":
      await saveChat(ctx.chat.chatId, { state: { step: "qty", product: a } });
      return ctx.send(ctx.t("type_qty"));
    case "q":
      return addQty(ctx, a, Number(b));
    case "cart":
      return showCart(ctx, { replace: msg?.text !== undefined });
    case "rm": {
      const next = (ctx.chat.cart || []).filter((l) => String(l.product) !== a);
      await saveChat(ctx.chat.chatId, { cart: next });
      ctx.chat.cart = next;
      return showCart(ctx, { replace: true });
    }
    case "clr":
      await saveChat(ctx.chat.chatId, { cart: [], state: {} });
      ctx.chat.cart = [];
      return ctx.replace(ctx.t("cart_cleared"), { inline_keyboard: [[{ text: ctx.t("continue_shopping"), callback_data: "cats" }]] });
    case "co":
      return startCheckout(ctx);
    case "d": {
      const m = deliveryMethods(ctx).find((x) => x.key === a);
      if (!m) return askDelivery(ctx);
      const state = { ...(ctx.chat.state || {}), delivery: m.key };
      ctx.chat.state = state;
      if (m.key !== "pickup") {
        await saveChat(ctx.chat.chatId, { state: { ...state, step: "address" } });
        return ctx.send(`${ctx.t("ask_address")}${state.address ? `\n\n<i>${esc(state.address)}</i>` : ""}`, state.address ? { inline_keyboard: [[{ text: "✅ " + trunc(state.address, 40), callback_data: "sameaddr" }]] } : undefined);
      }
      await saveChat(ctx.chat.chatId, { state });
      return showConfirm(ctx);
    }
    case "sameaddr":
      return showConfirm(ctx);
    case "ok":
      return placeOrder(ctx);
    case "x":
      await saveChat(ctx.chat.chatId, { state: { address: ctx.chat.state?.address } });
      if (msg) await tg(ctx.token, "deleteMessage", { chat_id: ctx.chat.chatId, message_id: msg.message_id }).catch(() => {});
      return null;
    default:
      return null;
  }
}

/** Proceseaza un update primit de la Telegram (webhook). */
export async function handleUpdate(update) {
  const settings = await getSettings();
  if (!settings.telegram?.enabled || !settings.telegram?.token) return;
  const msg = update.message;
  const cb = update.callback_query;
  const chatObj = msg?.chat || cb?.message?.chat;
  if (!chatObj || chatObj.type !== "private") return; // botul lucreaza doar in conversatii private
  const chat = await loadChat(chatObj, msg?.from || cb?.from);
  const ctx = makeCtx(settings, chat, cb?.message);
  try {
    if (cb) await onCallback(ctx, cb);
    else if (msg) await onMessage(makeCtx(settings, chat, null), msg);
  } catch (e) {
    await logIntegration({ source: "telegram", direction: "in", action: "update", status: "error", message: e.message }).catch(() => {});
    if (!(e instanceof TelegramError)) await ctx.send(ctx.t("order_failed")).catch(() => {});
  }
}

/** Anunta clientul din Telegram cand comanda lui isi schimba statusul. */
export async function notifyTelegramOrderStatus(order) {
  const settings = await getSettings();
  if (!settings.telegram?.enabled || !settings.telegram?.token || !order.telegramChatId) return;
  const [chat] = await db()`select lang from telegram_chats where chat_id = ${order.telegramChatId}`;
  const lang = chat?.lang === "ru" ? "ru" : "ro";
  const status = (STATUS_TEXT[lang] || STATUS_TEXT.ro)[order.status];
  if (!status || order.status === "new") return;
  await tg(settings.telegram.token, "sendMessage", {
    chat_id: order.telegramChatId,
    text: T(lang, "status_update", { number: order.number, status }),
    parse_mode: "HTML",
  });
}
