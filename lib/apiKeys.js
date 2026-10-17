import crypto from "node:crypto";
import { db } from "./db";
import { HttpError } from "./api";

export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

export function generateApiKey() {
  const raw = "lux_" + crypto.randomBytes(24).toString("base64url");
  return { raw, prefix: raw.slice(0, 12), hash: sha256(raw) };
}

export function generateSecret(bytes = 24) {
  return crypto.randomBytes(bytes).toString("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Autentificare API extern. Cheia vine in antetul `X-API-Key` sau `Authorization: Bearer <cheie>`.
 * scope: "read" pentru GET, "write" pentru modificari.
 */
export async function authenticateApiKey(req, scope = "read") {
  const auth = req.headers.get("authorization") || "";
  const key = req.headers.get("x-api-key") || (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "");
  if (!key) throw new HttpError(401, "Lipsește cheia API (antet X-API-Key sau Authorization: Bearer)");

  const master = process.env.CRM_API_KEY;
  if (master && safeEqual(key, master)) {
    return { _id: null, name: "Cheie master (.env)", kind: "generic", scopes: ["read", "write"] };
  }

  const [doc] = await db()`select * from api_keys where hash = ${sha256(key)} and active`;
  if (!doc) throw new HttpError(401, "Cheie API invalidă sau revocată");
  if (!doc.scopes.includes(scope)) throw new HttpError(403, `Cheia „${doc.name}” nu are dreptul „${scope}”`);

  const now = Date.now();
  if (!doc.lastUsedAt || now - new Date(doc.lastUsedAt).getTime() > 60_000) {
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    db()`update api_keys set last_used_at = now(), last_used_ip = ${ip}, usage_count = usage_count + 1 where id = ${doc._id}`.catch(() => {});
  } else {
    db()`update api_keys set usage_count = usage_count + 1 where id = ${doc._id}`.catch(() => {});
  }
  return doc;
}
