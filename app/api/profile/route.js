import { db } from "@/lib/db";
import { USER_COLS } from "@/lib/users";
import { hashPassword, verifyPassword, setSession, setLangCookie, forgetSessionUser } from "@/lib/auth";
import { route, readJson, badRequest, notFound } from "@/lib/api";

export const GET = route(async ({ user }) => {
  const [me] = await db()`select ${db().unsafe(USER_COLS)} from users where id = ${user.id}`;
  if (!me) throw notFound("Utilizator inexistent");
  return me;
});

// Utilizatorul curent isi actualizeaza profilul / parola
export const PATCH = route(async ({ req, user }) => {
  const body = await readJson(req);
  const sql = db();
  const [me] = await sql`select * from users where id = ${user.id}`;
  if (!me) throw notFound("Utilizator inexistent");
  const patch = {};
  if (body.name != null) {
    if (!String(body.name).trim()) throw badRequest("Numele nu poate fi gol");
    patch.name = String(body.name).trim();
  }
  if (body.phone != null) patch.phone = body.phone || null;
  if (body.lang != null) patch.lang = body.lang === "ru" ? "ru" : "ro";
  if (body.email != null) {
    const email = String(body.email).toLowerCase().trim();
    if (email !== me.email) {
      const [dup] = await sql`select id from users where lower(email) = ${email} and id <> ${me._id}`;
      if (dup) throw badRequest("Există deja un cont cu acest email");
      patch.email = email;
    }
  }
  if (body.newPassword) {
    if (String(body.newPassword).length < 6) throw badRequest("Parola nouă trebuie să aibă minim 6 caractere");
    if (!(await verifyPassword(body.currentPassword || "", me.passwordHash))) throw badRequest("Parola actuală este incorectă");
    patch.passwordHash = await hashPassword(body.newPassword);
  }
  if (Object.keys(patch).length) await sql`update users set ${sql(patch, ...Object.keys(patch))} where id = ${me._id}`;
  forgetSessionUser(me._id);
  const [fresh] = await sql`select ${sql.unsafe(USER_COLS)} from users where id = ${me._id}`;
  await setSession({ id: fresh._id, name: fresh.name, email: fresh.email, role: fresh.role });
  if (patch.lang) await setLangCookie(patch.lang);
  return fresh;
});
