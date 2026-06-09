import connectDB from "@/lib/mongodb";
import Product, { UNITS } from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { buildComponents } from "@/lib/productComponents";

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

  // Produs compus din alte produse
  if (body.isComposite !== undefined) {
    update.isComposite = !!body.isComposite;
    update.components = update.isComposite
      ? await buildComponents(body.components)
      : [];
  }

  const product = await Product.findByIdAndUpdate(id, update, { new: true });
  if (!product) return fail("Produs inexistent", 404);

  // Editare stoc pe depozit: seteaza cantitatea pentru depozitul ales
  if (body.warehouse && body.quantity !== undefined && body.quantity !== "") {
    const qty = Number(body.quantity);
    if (!Number.isNaN(qty) && qty >= 0) {
      const entry = product.stock.find(
        (s) => String(s.warehouse) === String(body.warehouse)
      );
      if (entry) entry.quantity = qty;
      else product.stock.push({ warehouse: body.warehouse, quantity: qty });
      await product.save();
    }
  }
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
