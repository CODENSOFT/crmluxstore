import connectDB from "@/lib/mongodb";
import Transfer from "@/models/Transfer";
import Product from "@/models/Product";
import { ok, fail, requireUser } from "@/lib/api";
import { adjustStock } from "@/lib/stock";
import { dispatchToMake } from "@/lib/make";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const list = await Transfer.find()
    .populate("product", "name unit")
    .populate("fromWarehouse", "name")
    .populate("toWarehouse", "name")
    .populate("createdBy", "name")
    .sort({ createdAt: -1 });
  return ok(list);
}

export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { product, fromWarehouse, toWarehouse, quantity, note } =
    await req.json();

  if (!product || !fromWarehouse || !toWarehouse)
    return fail("Produs si ambele depozite sunt obligatorii");
  if (String(fromWarehouse) === String(toWarehouse))
    return fail("Depozitul sursa si destinatie nu pot fi identice");
  const qty = Number(quantity);
  if (!qty || qty <= 0) return fail("Cantitatea trebuie sa fie pozitiva");

  const prod = await Product.findById(product);
  if (!prod) return fail("Produs inexistent");

  // Scade din sursa (valideaza stocul), adauga in destinatie
  try {
    await adjustStock(product, fromWarehouse, -qty);
  } catch (e) {
    return fail(e.message);
  }
  await adjustStock(product, toWarehouse, +qty);

  const transfer = await Transfer.create({
    product,
    productName: prod.name,
    fromWarehouse,
    toWarehouse,
    quantity: qty,
    note,
    createdBy: user.id,
  });

  const populated = await Transfer.findById(transfer._id)
    .populate("product", "name unit")
    .populate("fromWarehouse", "name")
    .populate("toWarehouse", "name");
  await logAudit({
    action: "transfer",
    category: "stock",
    entity: prod,
    entityName: prod.name,
    user,
    details: `${qty} ${prod.unit} "${prod.name}": ${populated.fromWarehouse?.name || "?"} -> ${populated.toWarehouse?.name || "?"}`,
  });
  await dispatchToMake("transfer.created", populated.toJSON());
  return ok(populated, { status: 201 });
}
