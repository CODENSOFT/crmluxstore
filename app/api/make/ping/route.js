import { ok } from "@/lib/api";
import { requireApiKey } from "@/lib/api";

// Endpoint de test pentru conexiunea Make.com
export async function GET(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  return ok({ message: "Conexiune Make.com reusita", time: new Date() });
}
