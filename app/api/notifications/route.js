import Notification from "@/models/Notification";
import { route } from "@/lib/api";

// ?read=0 (curente) | ?read=1 (istoric) | ?countOnly=1 (clopotel) | ?limit=
export const GET = route(async ({ user, query }) => {
  const unread = await Notification.countDocuments({ recipient: user.id, read: false });
  if (query.get("countOnly") === "1") return { items: [], unread };
  const filter = { recipient: user.id };
  if (query.get("read") === "0") filter.read = false;
  if (query.get("read") === "1") filter.read = true;
  if (query.get("type")) filter.type = query.get("type");
  const items = await Notification.find(filter)
    .populate({ path: "order", select: "status number" })
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Number(query.get("limit")) || 100))
    .lean();
  return { items, unread };
});

// Marcheaza toate ca citite
export const POST = route(async ({ user }) => {
  await Notification.updateMany({ recipient: user.id, read: false }, { $set: { read: true } });
  return { done: true };
});

// Sterge notificarile citite
export const DELETE = route(async ({ user }) => {
  const r = await Notification.deleteMany({ recipient: user.id, read: true });
  return { deleted: r.deletedCount };
});
