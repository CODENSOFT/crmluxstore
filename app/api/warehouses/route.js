import connectDB from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import { ok, fail, requireUser } from "@/lib/api";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const list = await Warehouse.find().sort({ createdAt: -1 });
  return ok(list);
}

export async function POST(req) {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { name, address, note } = await req.json();
  if (!name) return fail("Numele depozitului este obligatoriu");
  const created = await Warehouse.create({ name, address, note });
  return ok(created, { status: 201 });
}
