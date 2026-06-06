import connectDB from "@/lib/mongodb";
import Supplier from "@/models/Supplier";
import { ok, fail, requireUser } from "@/lib/api";

export async function PATCH(req, { params }) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  const body = await req.json();
  const s = await Supplier.findByIdAndUpdate(id, body, { new: true });
  if (!s) return fail("Furnizor inexistent", 404);
  return ok(s);
}

export async function DELETE(req, { params }) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { id } = await params;
  await Supplier.findByIdAndDelete(id);
  return ok({ deleted: true });
}
