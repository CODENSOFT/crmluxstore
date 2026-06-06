import connectDB from "@/lib/mongodb";
import Notification from "@/models/Notification";
import { ok, fail, requireUser } from "@/lib/api";

// Marcheaza o notificare drept citita
export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const n = await Notification.findOneAndUpdate(
    { _id: id, recipient: user.id },
    { $set: { read: true } },
    { new: true }
  );
  if (!n) return fail("Notificare inexistenta", 404);
  return ok(n);
}

export async function DELETE(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  await Notification.findOneAndDelete({ _id: id, recipient: user.id });
  return ok({ deleted: true });
}
