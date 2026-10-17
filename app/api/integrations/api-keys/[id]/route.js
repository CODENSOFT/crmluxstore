import ApiKey from "@/models/ApiKey";
import { route, readJson, notFound } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const PATCH = route(
  async ({ req, params, user }) => {
    const b = await readJson(req);
    const k = await ApiKey.findById(params.id);
    if (!k) throw notFound("Cheia nu există");
    if (b.name !== undefined) k.name = b.name;
    if (b.active !== undefined) k.active = !!b.active;
    if (Array.isArray(b.scopes)) k.scopes = b.scopes.filter((s) => ["read", "write"].includes(s));
    await k.save();
    if (b.active === false) await logAudit({ action: "apikey_revoked", category: "integration", entityName: k.name, user });
    return { ...k.toObject(), hash: undefined };
  },
  { auth: "admin" }
);

export const DELETE = route(
  async ({ params, user }) => {
    const k = await ApiKey.findByIdAndDelete(params.id);
    if (k) await logAudit({ action: "apikey_revoked", category: "integration", entityName: k.name, user, details: "Ștearsă" });
    return { deleted: true };
  },
  { auth: "admin" }
);
