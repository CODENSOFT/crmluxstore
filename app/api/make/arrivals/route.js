import connectDB from "@/lib/mongodb";
import StockArrival from "@/models/StockArrival";
import Product from "@/models/Product";
import { ok, fail, requireApiKey } from "@/lib/api";
import { adjustStock } from "@/lib/stock";

// Make: inregistreaza receptie marfa si creste stocul automat
// Body: { productId | sku, warehouseId, quantity, supplier?, unitCost? }
export async function POST(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const body = await req.json();

  const product = body.productId
    ? await Product.findById(body.productId)
    : await Product.findOne({ sku: body.sku });
  if (!product) return fail("Produs negasit");
  if (!body.warehouseId) return fail("warehouseId este obligatoriu");
  const qty = Number(body.quantity);
  if (!qty || qty <= 0) return fail("quantity invalid");

  await adjustStock(product._id, body.warehouseId, +qty);

  const arrival = await StockArrival.create({
    product: product._id,
    productName: product.name,
    warehouse: body.warehouseId,
    quantity: qty,
    unitCost: body.unitCost ? Number(body.unitCost) : undefined,
    supplier: body.supplier,
    note: body.note || "Receptie din Make.com",
  });

  return ok({ id: String(arrival._id), product: product.name, quantity: qty }, {
    status: 201,
  });
}
