import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/settings";
import { generateSecret } from "@/lib/apiKeys";
import { publicBaseUrl } from "@/lib/publicUrl";
import { tg } from "@/lib/telegram/api";
import { logIntegration } from "@/lib/integrationLog";

const mask = (v) => (v ? `${v.slice(0, 6)}••••••${v.slice(-4)}` : "");

async function view(s, req) {
  const t = s.telegram || {};
  const [stats] = await db()`
    select (select count(*)::int from telegram_chats) as chats,
           (select count(*)::int from orders where channel = 'telegram') as orders,
           (select count(*)::int from orders where channel = 'telegram' and created_at >= now() - interval '30 days') as orders30`;
  return {
    enabled: !!t.enabled,
    hasToken: !!t.token,
    token: mask(t.token),
    botUsername: t.botUsername || "",
    botName: t.botName || "",
    warehouse: t.warehouse || null,
    contactText: t.contactText || "",
    connectedAt: t.connectedAt || null,
    webhookUrl: `${publicBaseUrl(s, req)}/api/telegram/webhook`,
    stats,
  };
}

export const GET = route(async ({ req }) => view(await getSettings({ fresh: true }), req), { auth: "owner" });

// { token?, warehouse?, contactText?, action?: "connect" | "disconnect" }
export const PUT = route(
  async ({ req }) => {
    const b = await readJson(req);
    const s = await getSettings({ fresh: true });
    const patch = {};
    if (b.token && !b.token.includes("•")) {
      const token = b.token.trim();
      if (!/^\d+:[\w-]{30,}$/.test(token)) throw badRequest("Tokenul nu pare corect. Copiați-l exact din mesajul de la @BotFather (ex: 123456789:AA…)");
      patch.token = token;
    }
    if (b.warehouse !== undefined) {
      if (b.warehouse) {
        const [w] = isUuid(String(b.warehouse)) ? await db()`select id from warehouses where id = ${b.warehouse}` : [];
        if (!w) throw badRequest("Depozit inexistent");
      }
      patch.warehouse = b.warehouse || null;
    }
    if (b.contactText !== undefined) patch.contactText = String(b.contactText || "").slice(0, 500);

    const token = patch.token || s.telegram.token;
    if (b.action === "connect") {
      if (!token) throw badRequest("Introduceți tokenul botului primit de la @BotFather");
      const url = `${publicBaseUrl(s, req)}/api/telegram/webhook`;
      if (/localhost|127\.0\.0\.1/.test(url) && !process.env.TELEGRAM_API_URL) throw badRequest("Botul se poate conecta doar de pe adresa publică a CRM-ului (nu localhost)");
      let me;
      try {
        me = await tg(token, "getMe");
      } catch (e) {
        throw badRequest(`Telegram nu acceptă tokenul: ${e.message}`);
      }
      const secret = generateSecret(24).replace(/[^A-Za-z0-9_-]/g, "");
      await tg(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
      await tg(token, "setMyCommands", {
        commands: [
          { command: "start", description: "Catalog / Каталог" },
          { command: "lang", description: "Română / Русский" },
        ],
      }).catch(() => {});
      Object.assign(patch, { enabled: true, webhookSecret: secret, botUsername: me.username, botName: me.first_name, connectedAt: new Date().toISOString() });
      await logIntegration({ source: "telegram", direction: "out", action: "bot.connect", message: `@${me.username} conectat` });
    }
    if (b.action === "disconnect") {
      if (token) await tg(token, "deleteWebhook", {}).catch(() => {});
      Object.assign(patch, { enabled: false, webhookSecret: "" });
      await logIntegration({ source: "telegram", direction: "out", action: "bot.disconnect", message: "Bot deconectat" });
    }
    const next = await updateSettings({ telegram: patch });
    return view(next, req);
  },
  { auth: "owner" }
);
