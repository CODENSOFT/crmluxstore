import connectDB from "@/lib/mongodb";
import Product, { UNITS } from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function GET(req, { params }) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const product = await Product.findById(id).populate(
    "stock.warehouse",
    "name"
  );
  if (!product) return fail("Produs inexistent", 404);
  return ok(product);
}

export async function PATCH(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const update = {};
  for (const f of ["name", "description", "photo", "sku", "price", "active"]) {
    if (body[f] !== undefined) update[f] = body[f];
  }
  if (body.unit !== undefined) {
    if (!UNITS.includes(body.unit)) return fail("Unitate invalida");
    update.unit = body.unit;
  }
  if (body.price !== undefined) update.price = Number(body.price) || 0;

  const product = await Product.findByIdAndUpdate(id, update, { new: true });
  if (!product) return fail("Produs inexistent", 404);
  await logAudit({
    action: "product_edited",
    category: "product",
    entity: product,
    entityName: product.name,
    user,
    details: `Modificat "${product.name}" (${Object.keys(update).join(", ")})`,
  });
  return ok(product);
}

export async function DELETE(req, { params }) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const product = await Product.findById(id);
  await Product.findByIdAndDelete(id);
  if (product) {
    await logAudit({
      action: "product_deleted",
      category: "product",
      entityName: product.name,
      user,
      details: `Sters produsul "${product.name}"`,
    });
  }
  return ok({ deleted: true });
}
