import crypto from "node:crypto";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { handleUpdate } from "@/lib/telegram/bot";

export const maxDuration = 60;

const same = (a, b) => {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Receptor pentru mesajele botului Telegram. Securitate: antetul X-Telegram-Bot-Api-Secret-Token
// trebuie sa corespunda secretului generat de CRM la conectarea botului.
export async function POST(req) {
  await connectDB();
  const s = await getSettings();
  if (!s.telegram?.enabled || !s.telegram?.webhookSecret) return Response.json({ ok: true, ignored: "bot dezactivat" });
  if (!same(req.headers.get("x-telegram-bot-api-secret-token"), s.telegram.webhookSecret)) {
    return Response.json({ ok: false, error: "Neautorizat" }, { status: 401 });
  }
  let update;
  try {
    update = await req.json();
  } catch {
    return Response.json({ ok: true });
  }
  await handleUpdate(update);
  // Raspundem mereu 200, altfel Telegram retrimite acelasi mesaj la nesfarsit
  return Response.json({ ok: true });
}
