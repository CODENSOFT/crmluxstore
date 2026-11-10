// Mini App-ul botului (pagina /tg — lista de produse cu poze, deschisa din meniul „Catalog” si din butoanele botului).
// Fara cont CRM: Telegram semneaza datele clientului (initData) cu tokenul botului, iar noi verificam semnatura.
import crypto from "node:crypto";

const MAX_AGE = 24 * 3600; // secunde — dupa o zi lista trebuie redeschisa din bot

const same = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Clientul Telegram ({ id, first_name, username, language_code, … }) sau null daca semnatura nu e valida. */
export function verifyInitData(initData, token) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  // toate campurile primite, in ordine alfabetica, „cheie=valoare” pe randuri; clientii noi trimit si „signature”
  // (pentru verificarea fara token) — o acceptam in ambele variante
  const checkString = (skip) =>
    [...params.entries()]
      .filter(([k]) => !skip.includes(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  const valid = [["hash"], ["hash", "signature"]].some((skip) => same(crypto.createHmac("sha256", secret).update(checkString(skip)).digest("hex"), hash));
  if (!valid) return null;
  const age = Date.now() / 1000 - Number(params.get("auth_date"));
  if (!(age < MAX_AGE)) return null;
  try {
    const user = JSON.parse(params.get("user") || "null");
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// Butonul „Catalog” din meniul de jos deschide Mini App-ul direct, dar Telegram nu trimite atunci datele
// clientului (initData e gol pentru butoanele de tastatura). Adresa butonului poarta deci o cheie a chatului,
// semnata cu tokenul botului: „<chatId>.<semnatura>”. Fara token nu se poate fabrica pentru alt chat.
const chatSig = (chatId, token) => crypto.createHmac("sha256", `tgchat:${token}`).update(String(chatId)).digest("base64url").slice(0, 32);

export function chatKey(chatId, token) {
  return `${chatId}.${chatSig(chatId, token)}`;
}

/** { id } al chatului din cheia butonului de meniu, sau null daca semnatura nu e valida. */
export function verifyChatKey(key, token) {
  const m = /^(-?\d{1,20})\.([\w-]{32})$/.exec(String(key || ""));
  if (!m || !token) return null;
  return same(m[2], chatSig(m[1], token)) ? { id: Number(m[1]), keyOnly: true } : null;
}
