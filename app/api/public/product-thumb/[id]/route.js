import { connectDB, db, isUuid } from "@/lib/db";
import { verifyThumb } from "@/lib/telegram/thumbs";

const SIZE = 160;

// Miniatura JPEG patrata (160 px) a primei fotografii — pentru lista cu poze din botul Telegram.
// Telegram preia imaginea de pe serverul sau, deci linkul e public dar semnat; rezultatul se pastreaza in CDN.
export async function GET(req, { params }) {
  const { id } = await params;
  if (!isUuid(id) || !verifyThumb(id, new URL(req.url).searchParams.get("s"))) return new Response("Link invalid", { status: 403 });
  await connectDB();
  const [p] = await db()`select photos ->> 0 as first, photo from products where id = ${id} and active`;
  const src = p?.first || p?.photo;
  if (!src) return new Response("Fără imagine", { status: 404 });
  if (/^https?:\/\//.test(src)) return Response.redirect(src, 302);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(src);
  if (!m) return new Response("Format invalid", { status: 415 });
  const original = Buffer.from(m[2], "base64");
  const cache = { "Cache-Control": "public, max-age=86400, s-maxage=604800" };
  try {
    const { default: sharp } = await import("sharp");
    const jpeg = await sharp(original).rotate().resize(SIZE, SIZE, { fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 72 }).toBuffer();
    return new Response(jpeg, { headers: { "Content-Type": "image/jpeg", ...cache } });
  } catch (e) {
    console.error("[product-thumb] miniatura nu s-a putut genera:", e.message);
    return new Response(original, { headers: { "Content-Type": m[1], ...cache } });
  }
}
