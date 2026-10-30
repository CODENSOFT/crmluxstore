// Miniaturile produselor pentru lista cu poze din Telegram (cautarea inline).
// Linkul e semnat, ca serverul sa nu serveasca la cerere orice id; ?t= schimba linkul cand se schimba produsul.
import crypto from "node:crypto";

const sign = (id) => crypto.createHmac("sha256", process.env.JWT_SECRET || "lux").update(`thumb:${id}`).digest("hex").slice(0, 24);

export const thumbUrl = (base, id, version) => `${base}/api/public/product-thumb/${id}?t=${encodeURIComponent(version ?? "")}&s=${sign(id)}`;

export function verifyThumb(id, signature) {
  const a = Buffer.from(String(signature || ""));
  const b = Buffer.from(sign(id));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
