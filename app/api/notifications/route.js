import connectDB from "@/lib/mongodb";
import Notification from "@/models/Notification";
import Order from "@/models/Order";
import { ok, requireUser } from "@/lib/api";

// Lista notificarilor utilizatorului curent + numar necitite.
// ?read=0 -> doar necitite (Curente); ?read=1 -> doar citite (Istoric);
// ?countOnly=1 -> doar numarul de necitite (pentru clopotel).
export async function GET(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();

  const { searchParams } = new URL(req.url);
  const unread = await Notification.countDocuments({
    recipient: user.id,
    read: false,
  });

  if (searchParams.get("countOnly") === "1") {
    return ok({ items: [], unread });
  }

  const filter = { recipient: user.id };
  const readParam = searchParams.get("read");
  if (readParam === "0") filter.read = false;
  if (readParam === "1") filter.read = true;

  const items = await Notification.find(filter)
    .populate({ path: "order", select: "status number" })
    .sort({ createdAt: -1 })
    .limit(100);

  return ok({ items, unread });
}

// Marcheaza toate ca citite
export async function POST() {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  await Notification.updateMany(
    { recipient: user.id, read: false },
    { $set: { read: true } }
  );
  return ok({ done: true });
}
