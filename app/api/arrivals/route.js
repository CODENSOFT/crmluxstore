import connectDB from "@/lib/mongodb";
import StockArrival from "@/models/StockArrival";
import Product from "@/models/Product";
import Supplier from "@/models/Supplier";
import { ok, fail, requireUser } from "@/lib/api";
import { adjustStock } from "@/lib/stock";
import { dispatchToMake } from "@/lib/make";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();
  const list = await StockArrival.find()
    .populate("product", "name unit")
    .populate("warehouse", "name")
    .populate("createdBy", "name")
    .sort({ createdAt: -1 });
  return ok(list);
}

// Receptie marfa: creste stocul produsului in depozitul indicat
export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { product, warehouse, quantity, unitCost, supplier, supplierId, note } =
    await req.json();

  if (!product || !warehouse) return fail("Produs si depozit obligatorii");
  const qty = Number(quantity);
  if (!qty || qty <= 0) return fail("Cantitatea trebuie sa fie pozitiva");

  const prod = await Product.findById(product);
  if (!prod) return fail("Produs inexistent");

  // Rezolva numele furnizorului din lista (daca s-a ales unul)
  let supplierName = supplier;
  if (supplierId) {
    const sup = await Supplier.findById(supplierId);
    if (sup) supplierName = sup.name;
  }

  await adjustStock(product, warehouse, +qty);

  const arrival = await StockArrival.create({
    product,
    productName: prod.name,
    warehouse,
    quantity: qty,
    unitCost: unitCost ? Number(unitCost) : undefined,
    supplier: supplierName,
    supplierId: supplierId || undefined,
    note,
    createdBy: user.id,
  });

  const populated = await StockArrival.findById(arrival._id)
    .populate("product", "name unit")
    .populate("warehouse", "name");
  await logAudit({
    action: "arrival",
    category: "stock",
    entity: prod,
    entityName: prod.name,
    user,
    details: `+${qty} ${prod.unit} "${prod.name}" la ${populated.warehouse?.name || "depozit"}${supplierName ? ` · furnizor: ${supplierName}` : ""}`,
  });
  await dispatchToMake("arrival.created", populated.toJSON());
  return ok(populated, { status: 201 });
}
