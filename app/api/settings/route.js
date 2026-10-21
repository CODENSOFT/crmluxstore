import { db, isUuid } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const COMPANY = ["companyName", "legalName", "idno", "vatCode", "iban", "bank", "bankCode", "address", "phone", "email", "website"];


function publicView(s) {
  const { woo, telegram, ...rest } = s;
  return rest;
}

export const GET = route(async () => publicView(await getSettings({ fresh: true })));

export const PUT = route(
  async ({ req, user }) => {
    const body = await readJson(req);
    const patch = {};
    for (const f of COMPANY) if (body[f] !== undefined) patch[f] = String(body[f] ?? "").trim();
    for (const f of ["currency", "invoiceTerms"]) if (body[f] !== undefined) patch[f] = String(body[f] ?? "");
    if (body.publicUrl !== undefined) patch.publicUrl = String(body.publicUrl || "").trim().replace(/\/+$/, "");
    for (const f of ["vatPayer", "pricesIncludeVat", "requireApproval"]) if (body[f] !== undefined) patch[f] = !!body[f];
    if (body.vatRate !== undefined) {
      const v = Number(body.vatRate);
      if (!(v >= 0 && v <= 100)) throw badRequest("Cota TVA invalidă");
      patch.vatRate = v;
    }
    if (body.lowStockThreshold !== undefined) patch.lowStockThreshold = Math.max(0, Number(body.lowStockThreshold) || 0);
    if (body.defaultWarehouse !== undefined) {
      const w = body.defaultWarehouse || null;
      if (w) {
        const [exists] = isUuid(String(w)) ? await db()`select id from warehouses where id = ${w}` : [];
        if (!exists) throw badRequest("Depozit inexistent");
      }
      patch.defaultWarehouse = w;
    }
    if (Array.isArray(body.deliveryMethods)) {
      const methods = body.deliveryMethods
        .filter((m) => m && String(m.label || "").trim())
        .map((m, i) => ({
          key: String(m.key || "").trim() || `custom_${i + 1}`,
          label: String(m.label).trim(),
          cost: Math.max(0, Number(m.cost) || 0),
          active: m.active !== false,
        }));
      if (!methods.length) throw badRequest("Păstrați cel puțin o metodă de livrare");
      patch.deliveryMethods = methods;
    }

    const s = await updateSettings(patch);
    await logAudit({ action: "settings_saved", category: "settings", user, details: Object.keys(body).join(", ") });
    return publicView(s);
  },
  { auth: "owner" }
);
