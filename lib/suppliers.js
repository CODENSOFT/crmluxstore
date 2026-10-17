const FIELDS = ["name", "contactPerson", "phone", "email", "website", "address", "country", "idno", "iban", "paymentTermDays", "brands", "note", "active", "externalId"];

export function pickSupplier(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (typeof out.brands === "string") out.brands = out.brands.split(",").map((b) => b.trim()).filter(Boolean);
  for (const f of ["contactPerson", "phone", "email", "website", "address", "country", "idno", "iban", "note", "externalId"]) {
    if (out[f] !== undefined) out[f] = out[f] ? String(out[f]).trim() : null;
  }
  if (out.email) out.email = out.email.toLowerCase();
  if (out.name !== undefined) out.name = String(out.name || "").trim();
  if (out.paymentTermDays !== undefined) out.paymentTermDays = Math.max(0, parseInt(out.paymentTermDays, 10) || 0);
  if (out.brands !== undefined && !Array.isArray(out.brands)) out.brands = [];
  if (out.active !== undefined) out.active = !!out.active;
  return out;
}
