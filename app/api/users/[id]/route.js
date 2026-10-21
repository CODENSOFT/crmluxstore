import { db, isUuid } from "@/lib/db";
import { USER_COLS } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { route, readJson, badRequest, notFound, forbidden } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { cleanPermissions, isAdminUser, isOwner } from "@/lib/permissions";

async function load(id) {
  if (!isUuid(id)) throw notFound("Utilizator inexistent");
  const [u] = await db()`select * from users where id = ${id}`;
  if (!u) throw notFound("Utilizator inexistent");
  return u;
}

// Administratorul principal gestioneaza pe oricine; administratorii — doar angajatii (si propriul cont)
function assertCanManage(actor, target) {
  if (isOwner(actor)) return;
  if (target._id === actor.id) return;
  if (isAdminUser(target)) throw forbidden("Doar administratorul principal poate modifica administratorii");
}

export const PATCH = route(
  async ({ req, user, params }) => {
    const body = await readJson(req);
    const sql = db();
    const target = await load(params.id);
    assertCanManage(user, target);
    const self = target._id === user.id;
    const patch = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.phone != null) patch.phone = body.phone || null;
    if (body.position != null) patch.position = body.position || null;
    if (body.lang != null) patch.lang = body.lang === "ru" ? "ru" : "ro";
    if (body.role != null && body.role !== target.role) {
      if (target.role === "owner") throw badRequest("Rolul administratorului principal nu se poate schimba");
      if (self) throw badRequest("Nu vă puteți schimba singur rolul");
      if (!isOwner(user)) throw forbidden("Doar administratorul principal poate schimba rolurile de administrator");
      patch.role = body.role === "admin" ? "admin" : "manager";
    }
    if (body.permissions != null) patch.permissions = cleanPermissions(body.permissions);
    if (body.active != null) {
      if (self && !body.active) throw badRequest("Nu vă puteți dezactiva propriul cont");
      if (target.role === "owner" && !body.active) throw badRequest("Administratorul principal nu poate fi dezactivat");
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
    if (target.role === "owner") throw badRequest("Administratorul principal nu poate fi șters");
    assertCanManage(user, target);
    await db()`delete from users where id = ${target._id}`;
    await logAudit({ action: "user_deleted", category: "user", entityName: target.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
