import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { hashPassword, verifyPassword, setSession } from "@/lib/auth";
import { ok, fail, requireUser } from "@/lib/api";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const me = await User.findById(user.id);
  if (!me) return fail("Utilizator inexistent", 404);
  return ok(me.toSafeJSON());
}

// Utilizatorul curent isi actualizeaza propriul profil / parola
export async function PATCH(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const body = await req.json();

  const me = await User.findById(user.id);
  if (!me) return fail("Utilizator inexistent", 404);

  if (body.name != null) me.name = body.name;
  if (body.phone != null) me.phone = body.phone;

  if (body.email != null) {
    const email = body.email.toLowerCase().trim();
    if (email !== me.email) {
      const exists = await User.findOne({ email, _id: { $ne: me._id } });
      if (exists) return fail("Exista deja un cont cu acest email");
      me.email = email;
    }
  }

  // Schimbare parola — necesita parola actuala
  if (body.newPassword) {
    if (body.newPassword.length < 5)
      return fail("Parola noua trebuie sa aiba minim 5 caractere");
    const valid = await verifyPassword(
      body.currentPassword || "",
      me.passwordHash
    );
    if (!valid) return fail("Parola actuala este incorecta");
    me.passwordHash = await hashPassword(body.newPassword);
  }

  await me.save();

  // Reemitem sesiunea ca sa reflecte numele/emailul nou in interfata
  await setSession({
    id: String(me._id),
    name: me.name,
    email: me.email,
    role: me.role,
  });

  return ok(me.toSafeJSON());
}
