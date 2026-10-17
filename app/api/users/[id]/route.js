import User from "@/models/User";
import { hashPassword } from "@/lib/auth";
import { route, readJson, badRequest, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const PATCH = route(
  async ({ req, user, params }) => {
    const body = await readJson(req);
    const target = await User.findById(params.id);
    if (!target) throw notFound("Utilizator inexistent");
    const self = String(target._id) === String(user.id);

    if (body.name != null) target.name = String(body.name).trim();
    if (body.phone != null) target.phone = body.phone;
    if (body.position != null) target.position = body.position;
    if (body.role != null) {
      if (self && body.role !== "admin") throw badRequest("Nu vă puteți retrage singur drepturile de administrator");
      target.role = body.role === "admin" ? "admin" : "manager";
    }
    if (body.active != null) {
      if (self && !body.active) throw badRequest("Nu vă puteți dezactiva propriul cont");
      target.active = !!body.active;
    }
    if (body.password) {
      if (String(body.password).length < 6) throw badRequest("Parola trebuie să aibă minim 6 caractere");
      target.passwordHash = await hashPassword(body.password);
    }
    if (body.email != null) {
      const email = String(body.email).toLowerCase().trim();
      if (await User.exists({ email, _id: { $ne: target._id } })) throw badRequest("Există deja un cont cu acest email");
      target.email = email;
    }
    await target.save();
    await logAudit({ action: "user_edited", category: "user", entity: target, entityName: target.name, user, details: Object.keys(body).filter((k) => k !== "password").join(", ") + (body.password ? ", parolă" : "") });
    return target.toSafeJSON();
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ user, params }) => {
    if (String(params.id) === String(user.id)) throw badRequest("Nu vă puteți șterge propriul cont");
    const target = await User.findById(params.id);
    if (!target) throw notFound("Utilizator inexistent");
    if (target.role === "admin" && (await User.countDocuments({ role: "admin", active: true })) <= 1)
      throw badRequest("Trebuie să rămână cel puțin un administrator activ");
    await target.deleteOne();
    await logAudit({ action: "user_deleted", category: "user", entityName: target.name, user });
    return { deleted: true };
  },
  { auth: "admin" }
);
