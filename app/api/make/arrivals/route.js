import connectDB from "@/lib/mongodb";
import StockArrival from "@/models/StockArrival";
import Product from "@/models/Product";
import Warehouse from "@/models/Warehouse";
import { ok, fail, requireApiKey } from "@/lib/api";
import { adjustStock } from "@/lib/stock";

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Make: inregistreaza receptie marfa si creste stocul in depozit
// Body: { productId | sku, warehouseId, quantity, supplier?, unitCost? }
export async function POST(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const body = await req.json();

  // Gaseste produsul: dupa productId, altfel dupa sku (trim + case-insensitive)
  let product = null;
  if (body.productId) {
    product = await Product.findById(body.productId).catch(() => null);
  } else if (body.sku) {
    const sku = String(body.sku).trim();
    product = await Product.findOne({
      sku: { $regex: `^${escapeRegex(sku)}$`, $options: "i" },
    });
  } else {
    return fail("Trimiteti productId sau sku");
  }
  if (!product)
    return fail(`Produs negasit: ${body.productId || body.sku}`);

  // Depozitul trebuie sa existe
  if (!body.warehouseId) return fail("warehouseId este obligatoriu");
  const warehouse = await Warehouse.findById(body.warehouseId).catch(() => null);
  if (!warehouse) return fail(`Depozit negasit: ${body.warehouseId}`);

  const qty = Number(body.quantity);
  if (!qty || qty <= 0) return fail("quantity invalid (trebuie > 0)");

  // Creste stocul in depozit
  try {
    await adjustStock(product._id, warehouse._id, +qty);
  } catch (e) {
    return fail(e.message);
  }

  await StockArrival.create({
    product: product._id,
    productName: product.name,
    warehouse: warehouse._id,
    quantity: qty,
    unitCost: body.unitCost ? Number(body.unitCost) : undefined,
    supplier: body.supplier,
    note: body.note || "Receptie din Make.com",
  });

  // Returnam stocul actualizat ca sa poti verifica din Make
  const updated = await Product.findById(product._id);
  return ok(
    {
      product: product.name,
      sku: product.sku,
      added: qty,
      warehouse: warehouse.name,
      warehouseId: String(warehouse._id),
      totalStock: updated.totalStock,
      stock: updated.stock.map((s) => ({
        warehouseId: String(s.warehouse),
        quantity: s.quantity,
      })),
    },
    { status: 201 }
  );
}
