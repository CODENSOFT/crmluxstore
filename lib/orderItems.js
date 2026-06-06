import Product from "@/models/Product";

// Construieste liniile unei comenzi din input brut, cu preturi din baza de date.
// Arunca eroare cu mesaj clar daca ceva e invalid.
export async function buildOrderItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Adaugati cel putin un produs in comanda");
  }
  const built = [];
  for (const it of rawItems) {
    if (!it.product || !it.warehouse) {
      throw new Error("Fiecare linie necesita produs si depozit");
    }
    const qty = Number(it.quantity);
    if (!qty || qty <= 0) throw new Error("Cantitatea trebuie sa fie pozitiva");

    const product = await Product.findById(it.product);
    if (!product) throw new Error("Produs inexistent in comanda");

    const unitPrice = product.price || 0;
    built.push({
      product: product._id,
      productName: product.name,
      warehouse: it.warehouse,
      quantity: qty,
      unit: product.unit,
      unitPrice,
      lineTotal: +(unitPrice * qty).toFixed(2),
    });
  }
  const total = +built.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
  return { items: built, total };
}
