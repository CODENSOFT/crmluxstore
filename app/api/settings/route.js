import { route, readJson, badRequest } from "@/lib/api";
import { getSettingsDoc, invalidateSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

const COMPANY = ["companyName", "legalName", "idno", "vatCode", "iban", "bank", "bankCode", "address", "phone", "email", "website"];
const SALES = ["currency", "vatPayer", "vatRate", "pricesIncludeVat", "requireApproval", "lowStockThreshold", "invoiceTerms", "publicUrl"];

function publicView(s) {
  const o = s.toObject();
  delete o.woo;
  return o;
}

export const GET = route(async () => publicView(await getSettingsDoc()));

export const PUT = route(
  async ({ req, user }) => {
    const body = await readJson(req);
    const s = await getSettingsDoc();
    for (const f of [...COMPANY, ...SALES]) if (body[f] !== undefined) s[f] = body[f];
    if (body.vatRate !== undefined) {
      const v = Number(body.vatRate);
      if (!(v >= 0 && v <= 100)) throw badRequest("Cota TVA invalidă");
      s.vatRate = v;
    }
    if (body.lowStockThreshold !== undefined) s.lowStockThreshold = Math.max(0, Number(body.lowStockThreshold) || 0);
    if (body.defaultWarehouse !== undefined) s.defaultWarehouse = body.defaultWarehouse || undefined;
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
      s.deliveryMethods = methods;
    }
    await s.save();
    invalidateSettings();
    await logAudit({ action: "settings_saved", category: "settings", user, details: Object.keys(body).join(", ") });
    return publicView(s);
  },
  { auth: "admin" }
);
