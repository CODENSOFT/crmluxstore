import { route, readJson, assert, HttpError } from "@/lib/api";
import { isUuid } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { verifyInitData, verifyChatKey } from "@/lib/telegram/webapp";
import { webAppCatalog, webAppPick } from "@/lib/telegram/bot";

// Mini App-ul botului (pagina /tg): lista de produse cu poze si alegerea unui produs.
// Fara cont CRM — clientul este cel semnat de Telegram in antetul X-Telegram-Init-Data; deschisa din
// meniul de jos al botului (unde Telegram nu trimite aceste date) — cheia chatului din X-Telegram-Chat-Key.
async function telegramClient(req) {
  const settings = await getSettings();
  const t = settings.telegram || {};
  if (!t.enabled || !t.token) throw new HttpError(404, "Botul Telegram nu este activ");
  const user = verifyInitData(req.headers.get("x-telegram-init-data"), t.token) || verifyChatKey(req.headers.get("x-telegram-chat-key"), t.token);
  if (!user) throw new HttpError(401, "Deschideți lista din botul Telegram");
  return { settings, user };
}

export const GET = route(
  async ({ req, query }) => {
    const { settings, user } = await telegramClient(req);
    return webAppCatalog(settings, user, { category: query.get("c") || "", q: (query.get("q") || "").trim().slice(0, 80) });
  },
  { auth: false }
);

export const POST = route(
  async ({ req }) => {
    const { settings, user } = await telegramClient(req);
    const { product } = await readJson(req);
    assert(isUuid(String(product || "")), "Produs invalid");
    await webAppPick(settings, user, product);
    return { sent: true };
  },
  { auth: false }
);
