const FIELDS = ["name", "contactPerson", "phone", "email", "website", "address", "country", "idno", "iban", "paymentTermDays", "brands", "note", "active", "externalId"];

export function pickSupplier(body) {
  const out = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (typeof out.brands === "string") out.brands = out.brands.split(",").map((b) => b.trim()).filter(Boolean);
  if (out.email === "") out.email = undefined;
  if (out.name !== undefined) out.name = String(out.name).trim();
  return out;
}
