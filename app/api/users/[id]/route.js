import { db, isUuid } from "@/lib/db";
import { USER_COLS } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { cleanPermissions } from "@/lib/permissions";

async function load(id) {
  if (!isUuid(id)) throw notFound("Utilizator inexistent");
  const [u] = await db()`select * from users where id = ${id}`;
  if (!u) throw notFound("Utilizator inexistent");
  return u;
}

export const PATCH = route(
  async ({ req, user, params }) => {
    const body = await readJson(req);
    const sql = db();
    const target = await load(params.id);
    const self = target._id === user.id;
    const patch = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.phone != null) patch.phone = body.phone || null;
    if (body.position != null) patch.position = body.position || null;
    if (body.role != null) {
      if (self && body.role !== "admin") throw badRequest("Nu vă puteți retrage singur drepturile de administrator");
      patch.role = body.role === "admin" ? "admin" : "manager";
    }
    if (body.permissions != null) patch.permissions = cleanPermissions(body.permissions);
    if (body.active != null) {
      if (self && !body.active) throw badRequest("Nu vă puteți dezactiva propriul cont");
      patch.active = !!body.active;
    }
    if (body.password) {
      if (String(body.password).length < 6) throw badRequest("Parola trebuie să aibă minim 6 caractere");
      patch.passwordHash = await hashPassword(body.password);
    }
    if (body.email != null) {
      const email = String(body.email).toLowerCase().trim();
      const [dup] = await sql`select id from users where lower(email) = ${email} and id <> ${target._id}`;
      if (dup) throw badRequest("Există deja un cont cu acest email");
      patch.email = email;
    }
    if (Object.keys(patch).length) await sql`update users set ${sql(patch, ...Object.keys(patch))} where id = ${target._id}`;
    const [fresh] = await sql`select ${sql.unsafe(USER_COLS)} from users where id = ${target._id}`;
    await logAudit({
      action: "user_edited",
      category: "user",
      entity: fresh,
      entityName: fresh.name,
      user,
      details: Object.keys(body).filter((k) => k !== "password").join(", ") + (body.password ? ", parolă" : ""),
    });
    return fresh;
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ user, params }) => {
    if (params.id === user.id) throw badRequest("Nu vă puteți șterge propriul cont");
    const target = await load(params.id);
    const sql = db();
    if (target.role === "admin") {
      const [{ n }] = await sql`select count(*)::int as n from users where role = 'admin' and active`;
      if (n <= 1) throw badRequest("Trebuie să rămână cel puțin un administrator activ");
    }
    await sql`delete from users where id = ${target._id}`;
    await logAudit({ action: "user_deleted", category: "user", entityName: target.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
