import { connectDB, db, isUuid } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { authBypassEnabled } from "@/lib/authBypass";

// Serveste fotografia produsului (stocata ca data URL) ca imagine, cu cache lung
export async function GET(req, { params }) {
  if (!authBypassEnabled() && !(await getCurrentUser())) return new Response("Neautentificat", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Fără imagine", { status: 404 });
  await connectDB();
  const [p] = await db()`select photo from products where id = ${id}`;
  if (!p?.photo) return new Response("Fără imagine", { status: 404 });
  if (/^https?:\/\//.test(p.photo)) return Response.redirect(p.photo, 302);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(p.photo);
  if (!m) return new Response("Format invalid", { status: 415 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
