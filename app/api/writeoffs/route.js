import connectDB from "@/lib/mongodb";
import WriteOff from "@/models/WriteOff";
import Product from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";
import { adjustStock } from "@/lib/stock";
import { dispatchToMake } from "@/lib/make";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const list = await WriteOff.find()
    .populate("product", "name unit")
    .populate("warehouse", "name")
    .populate("createdBy", "name")
    .sort({ createdAt: -1 });
  return ok(list);
}

// Anulare / spisanie produs din stoc
export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { product, warehouse, quantity, reason } = await req.json();

  if (!product || !warehouse) return fail("Produs si depozit obligatorii");
  const qty = Number(quantity);
  if (!qty || qty <= 0) return fail("Cantitatea trebuie sa fie pozitiva");

  const prod = await Product.findById(product);
  if (!prod) return fail("Produs inexistent");

  try {
    await adjustStock(product, warehouse, -qty);
  } catch (e) {
    return fail(e.message);
  }

  const wo = await WriteOff.create({
    product,
    productName: prod.name,
    warehouse,
    quantity: qty,
    reason,
    createdBy: user.id,
  });

  const populated = await WriteOff.findById(wo._id)
    .populate("product", "name unit")
    .populate("warehouse", "name");
  await logAudit({
    action: "writeoff",
    category: "stock",
    entity: prod,
    entityName: prod.name,
    user,
    details: `-${qty} ${prod.unit} "${prod.name}" din ${populated.warehouse?.name || "depozit"}${reason ? ` · motiv: ${reason}` : ""}`,
  });
  await dispatchToMake("writeoff.created", populated.toJSON());
  return ok(populated, { status: 201 });
}
