import Product from "@/models/Product";

// Gaseste cantitatea unui produs intr-un depozit
export function stockInWarehouse(product, warehouseId) {
  const entry = (product.stock || []).find(
    (s) => String(s.warehouse) === String(warehouseId)
  );
  return entry ? entry.quantity : 0;
}

// Adauga (delta > 0) sau scade (delta < 0) stoc pentru un produs intr-un depozit.
// Arunca eroare daca rezultatul ar fi negativ.
export async function adjustStock(productId, warehouseId, delta) {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Produsul nu a fost gasit");

  let entry = product.stock.find(
    (s) => String(s.warehouse) === String(warehouseId)
  );

  const current = entry ? entry.quantity : 0;
  const next = current + delta;
  if (next < 0) {
    throw new Error(
      `Stoc insuficient pentru "${product.name}". Disponibil: ${current}, necesar: ${-delta}`
    );
  }

  if (entry) {
    entry.quantity = next;
  } else {
    product.stock.push({ warehouse: warehouseId, quantity: next });
  }

  await product.save();
  return product;
}

// Aplica scaderea de stoc pentru toate liniile unei comenzi.
// Valideaza intai disponibilitatea (totul sau nimic) apoi aplica.
export async function applyOrderStock(items, sign = -1) {
  // Validare prealabila pentru scadere
  if (sign < 0) {
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product)
        throw new Error("Un produs din comanda nu mai exista");
      const available = stockInWarehouse(product, item.warehouse);
      if (available < item.quantity) {
        throw new Error(
          `Stoc insuficient pentru "${product.name}". Disponibil: ${available}, comandat: ${item.quantity}`
        );
      }
    }
  }
  // Aplicare
  for (const item of items) {
    await adjustStock(item.product, item.warehouse, sign * item.quantity);
  }
}
