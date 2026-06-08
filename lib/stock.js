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

// Aplica scaderea/adaugarea de stoc pentru liniile unei comenzi.
// Agrega cantitatile per (produs, depozit) — astfel liniile duplicate sunt
// validate corect (suma), fara aplicare partiala. Totul-sau-nimic la scadere.
export async function applyOrderStock(items, sign = -1) {
  const agg = {};
  for (const item of items) {
    const key = `${String(item.product)}|${String(item.warehouse)}`;
    agg[key] = (agg[key] || 0) + Number(item.quantity);
  }
  const entries = Object.entries(agg).map(([key, qty]) => {
    const [product, warehouse] = key.split("|");
    return { product, warehouse, qty };
  });

  // Validare prealabila pentru scadere (pe cantitatea agregata)
  if (sign < 0) {
    for (const e of entries) {
      const product = await Product.findById(e.product);
      if (!product) throw new Error("Un produs din comanda nu mai exista");
      const available = stockInWarehouse(product, e.warehouse);
      if (available < e.qty) {
        throw new Error(
          `Stoc insuficient pentru "${product.name}". Disponibil: ${available}, comandat: ${e.qty}`
        );
      }
    }
  }
  // Aplicare
  for (const e of entries) {
    await adjustStock(e.product, e.warehouse, sign * e.qty);
  }
}
