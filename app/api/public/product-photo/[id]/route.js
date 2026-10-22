import crypto from "node:crypto";
import { connectDB, db, isUuid } from "@/lib/db";
import { verifyPhotoSignature } from "@/lib/woo";

// Fotografia produsului printr-un link semnat (folosit de site la publicarea produselor).
// Fara semnatura valida nu se serveste nimic.
export async function GET(req, { params }) {
  const { id } = await params;
  const u = new URL(req.url);
  const v = u.searchParams.get("v") || "";
  if (!isUuid(id) || !verifyPhotoSignature(id, v, u.searchParams.get("s"))) return new Response("Link invalid", { status: 403 });
  await connectDB();
  const [p] = await db()`select photo, photos from products where id = ${id}`;
  const all = p?.photos?.length ? p.photos : p?.photo ? [p.photo] : [];
  // fotografia ceruta = cea a carei amprenta corespunde versiunii din link
  const src = all.find((ph) => crypto.createHash("sha1").update(ph).digest("hex").slice(0, 16) === v);
  if (!all.length) return new Response("Fără imagine", { status: 404 });
  if (!src) return new Response("Imaginea s-a schimbat", { status: 410 });
  if (/^https?:\/\//.test(src)) return Response.redirect(src, 302);
  const m = /^data:([^;]+);base64,(.*)$/s.exec(src);
  if (!m) return new Response("Format invalid", { status: 415 });
  const ext = (m[1].split("/")[1] || "jpg").replace("jpeg", "jpg");
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Content-Disposition": `inline; filename="produs-${id.slice(0, 8)}.${ext}"`, "Cache-Control": "public, max-age=86400" },
  });
}
