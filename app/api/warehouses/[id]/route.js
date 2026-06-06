import connectDB from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import Product from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";

export async function PATCH(req, { params }) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const wh = await Warehouse.findByIdAndUpdate(id, body, { new: true });
  if (!wh) return fail("Depozit inexistent", 404);
  return ok(wh);
}

export async function DELETE(req, { params }) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;

  // Nu permitem stergerea daca exista stoc in acest depozit
  const withStock = await Product.findOne({
    stock: { $elemMatch: { warehouse: id, quantity: { $gt: 0 } } },
  });
  if (withStock) {
    return fail(
      "Depozitul contine produse pe stoc. Transferati sau anulati stocul intai."
    );
  }

  await Warehouse.findByIdAndDelete(id);
  return ok({ deleted: true });
}
