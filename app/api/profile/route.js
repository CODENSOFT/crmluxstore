import User from "@/models/User";
import { hashPassword, verifyPassword, setSession } from "@/lib/auth";
import { route, readJson, badRequest, notFound } from "@/lib/api";

export const GET = route(async ({ user }) => {
  const me = await User.findById(user.id);
  if (!me) throw notFound("Utilizator inexistent");
  return me.toSafeJSON();
});

// Utilizatorul curent isi actualizeaza profilul / parola
export const PATCH = route(async ({ req, user }) => {
  const body = await readJson(req);
  const me = await User.findById(user.id);
  if (!me) throw notFound("Utilizator inexistent");

  if (body.name != null) {
    if (!String(body.name).trim()) throw badRequest("Numele nu poate fi gol");
    me.name = String(body.name).trim();
  }
  if (body.phone != null) me.phone = body.phone;
  if (body.email != null) {
    const email = String(body.email).toLowerCase().trim();
    if (email !== me.email) {
      if (await User.exists({ email, _id: { $ne: me._id } })) throw badRequest("Există deja un cont cu acest email");
      me.email = email;
    }
  }
  if (body.newPassword) {
    if (String(body.newPassword).length < 6) throw badRequest("Parola nouă trebuie să aibă minim 6 caractere");
    if (!(await verifyPassword(body.currentPassword || "", me.passwordHash)))
      throw badRequest("Parola actuală este incorectă");
    me.passwordHash = await hashPassword(body.newPassword);
  }
  await me.save();
  await setSession({ id: String(me._id), name: me.name, email: me.email, role: me.role });
  return me.toSafeJSON();
});
