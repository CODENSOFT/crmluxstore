import { connectDB, db, isUuid } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/authBypass";

// Serveste fotografia produsului (stocata ca data URL) ca imagine, cu cache lung. ?i=N = a N-a din galerie
export async function GET(req, { params }) {
  if (!authBypassEnabled() && !(await getCurrentUser())) return new Response("Neautentificat", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Fără imagine", { status: 404 });
  await connectDB();
  const i = Math.max(0, parseInt(new URL(req.url).searchParams.get("i") || "0", 10) || 0);
  const [p] = await db()`select photo, photos -> ${i}::int #>> '{}' as pick from products where id = ${id}`;
  const src = p?.pick || (i === 0 ? p?.photo : null);
  if (!src) return new Response("Fără imagine", { status: 404 });
  if (/^https?:\/\//.test(src)) return Response.redirect(src, 302);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(src);
  if (!m) return new Response("Format invalid", { status: 415 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
