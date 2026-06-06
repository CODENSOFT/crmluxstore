import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { ok, fail, requireAdmin } from "@/lib/api";

export async function PATCH(req, { params }) {
  const { response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const update = {};
  if (body.name != null) update.name = body.name;
  if (body.phone != null) update.phone = body.phone;
  if (body.role != null) update.role = body.role === "admin" ? "admin" : "manager";
  if (body.active != null) update.active = !!body.active;
  if (body.password) update.passwordHash = await hashPassword(body.password);

  if (body.email != null) {
    const email = body.email.toLowerCase().trim();
    const exists = await User.findOne({ email, _id: { $ne: id } });
    if (exists) return fail("Exista deja un cont cu acest email");
    update.email = email;
  }

  const user = await User.findByIdAndUpdate(id, update, { new: true });
  if (!user) return fail("Utilizator inexistent", 404);
  return ok(user.toSafeJSON());
}

export async function DELETE(req, { params }) {
  const { user: admin, response } = await requireAdmin();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  if (String(id) === String(admin.id)) {
    return fail("Nu va puteti sterge propriul cont");
  }
  await User.findByIdAndDelete(id);
  return ok({ deleted: true });
}
