import Product from "@/models/Product";

// Construieste lista de componente a unui produs compus (alt produs + cantitate),
// rezolvand numele din baza de date. Ignora componentele invalide/inexistente.
export async function buildComponents(rawComponents) {
  if (!Array.isArray(rawComponents)) return [];
  const built = [];
  for (const c of rawComponents) {
    if (!c || !c.product) continue;
    const qty = Number(c.quantity) || 1;
    if (qty <= 0) continue;
    const p = await Product.findById(c.product).select("name");
    if (!p) continue;
    built.push({ product: p._id, productName: p.name, quantity: qty });
  }
  return built;
}
