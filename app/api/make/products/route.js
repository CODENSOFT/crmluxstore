import connectDB from "@/lib/mongodb";
import Product, { UNITS } from "@/models/Product";
import { ok, fail, requireApiKey } from "@/lib/api";

// Make: citeste lista produselor (cu stoc total)
export async function GET(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const products = await Product.find().populate("stock.warehouse", "name");
  return ok(
    products.map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      price: p.price,
      totalStock: p.totalStock,
      stock: p.stock.map((s) => ({
        warehouse: s.warehouse?.name,
        warehouseId: String(s.warehouse?._id || s.warehouse),
        quantity: s.quantity,
      })),
    }))
  );
}

// Make: creeaza un produs nou
export async function POST(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const body = await req.json();
  if (!body.name) return fail("name este obligatoriu");
  if (body.unit && !UNITS.includes(body.unit))
    return fail(`unit invalid. Valori permise: ${UNITS.join(", ")}`);

  const product = await Product.create({
    name: body.name,
    description: body.description,
    sku: body.sku,
    unit: body.unit || "bucata",
    price: Number(body.price) || 0,
    photo: body.photo,
  });
  return ok({ id: String(product._id), name: product.name }, { status: 201 });
}
