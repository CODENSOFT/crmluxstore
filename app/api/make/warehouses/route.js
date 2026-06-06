import connectDB from "@/lib/mongodb";
import Warehouse from "@/models/Warehouse";
import { ok, requireApiKey } from "@/lib/api";

// Make: lista depozitelor (pentru a obtine warehouseId)
export async function GET(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const list = await Warehouse.find();
  return ok(
    list.map((w) => ({ id: String(w._id), name: w.name, address: w.address }))
  );
}
