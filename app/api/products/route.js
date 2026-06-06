import connectDB from "@/lib/mongodb";
import Product, { UNITS } from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";
import { dispatchToMake } from "@/lib/make";
import { logAudit } from "@/lib/audit";

export async function GET(req) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const filter = {};
  if (q) filter.name = { $regex: q, $options: "i" };
  const list = await Product.find(filter)
    .populate("stock.warehouse", "name")
    .sort({ createdAt: -1 });
  return ok(list);
}

export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const body = await req.json();
  const { name, description, photo, sku, unit, price, warehouse, quantity } =
    body;

  if (!name) return fail("Denumirea produsului este obligatorie");
  if (unit && !UNITS.includes(unit)) return fail("Unitate de masura invalida");

  const stock = [];
  // Daca s-a indicat depozit + cantitate initiala, cream stocul de start
  if (warehouse && Number(quantity) > 0) {
    stock.push({ warehouse, quantity: Number(quantity) });
  }

  const created = await Product.create({
    name,
    description,
    photo,
    sku,
    unit: unit || "bucata",
    price: Number(price) || 0,
    stock,
  });

  await logAudit({
    action: "product_created",
    category: "product",
    entity: created,
    entityName: created.name,
    user,
    details: `Produs "${created.name}" · ${created.unit} · pret ${created.price}${stock.length ? ` · stoc initial ${stock[0].quantity}` : ""}`,
  });
  await dispatchToMake("product.created", created.toJSON());
  return ok(created, { status: 201 });
}
