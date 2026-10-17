import Notification from "@/models/Notification";
import { route, readJson, notFound } from "@/lib/api";

export const PATCH = route(async ({ req, params, user }) => {
  const { read = true } = await readJson(req);
  const n = await Notification.findOneAndUpdate(
    { _id: params.id, recipient: user.id },
    { $set: { read: !!read } },
    { returnDocument: "after" }
  );
  if (!n) throw notFound("Notificarea nu există");
  return n;
});

export const DELETE = route(async ({ params, user }) => {
  await Notification.findOneAndDelete({ _id: params.id, recipient: user.id });
  return { deleted: true };
});
