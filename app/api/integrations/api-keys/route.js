import ApiKey from "@/models/ApiKey";
import { route, readJson, badRequest } from "@/lib/api";
import { generateApiKey } from "@/lib/apiKeys";
import { logAudit } from "@/lib/audit";

export const GET = route(
  async () => ApiKey.find().select("-hash").populate("createdBy", "name").sort({ createdAt: -1 }).lean(),
  { auth: "admin" }
);

// Cheia completa se afiseaza O SINGURA DATA, la creare
export const POST = route(
  async ({ req, user }) => {
    const { name, kind, scopes } = await readJson(req);
    if (!name?.trim()) throw badRequest("Dați un nume cheii (ex: „1C Contabilitate”)");
    const k = generateApiKey();
    const doc = await ApiKey.create({
      name: name.trim(),
      kind: ["1c", "site", "generic"].includes(kind) ? kind : "generic",
      prefix: k.prefix,
      hash: k.hash,
      scopes: Array.isArray(scopes) && scopes.length ? scopes.filter((s) => ["read", "write"].includes(s)) : ["read", "write"],
      createdBy: user.id,
    });
    await logAudit({ action: "apikey_created", category: "integration", entityName: doc.name, user });
    return { ...doc.toObject(), hash: undefined, key: k.raw };
  },
  { auth: "admin" }
);
