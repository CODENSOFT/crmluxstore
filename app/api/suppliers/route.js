import connectDB from "@/lib/mongodb";
import Supplier from "@/models/Supplier";
import StockArrival from "@/models/StockArrival";
import { ok, fail, requireUser } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { response } = await requireUser();
  if (response) return response;
  await connectDB();

  const [suppliers, agg] = await Promise.all([
    Supplier.find().sort({ createdAt: -1 }),
    StockArrival.aggregate([
      { $match: { supplierId: { $ne: null } } },
      {
        $group: {
          _id: "$supplierId",
          arrivals: { $sum: 1 },
          totalQty: { $sum: "$quantity" },
          totalCost: {
            $sum: {
              $multiply: ["$quantity", { $ifNull: ["$unitCost", 0] }],
            },
          },
        },
      },
    ]),
  ]);

  const stats = Object.fromEntries(agg.map((a) => [String(a._id), a]));
  return ok(
    suppliers.map((s) => {
      const st = stats[String(s._id)] || {};
      return {
        ...s.toObject(),
        arrivals: st.arrivals || 0,
        totalQty: st.totalQty || 0,
        totalCost: +(st.totalCost || 0).toFixed(2),
      };
    })
  );
}

export async function POST(req) {
  const { user, response } = await requireUser();
  if (response) return response;
  await connectDB();
  const { name, phone, email, address, note } = await req.json();
  if (!name) return fail("Numele furnizorului este obligatoriu");
  const created = await Supplier.create({ name, phone, email, address, note });
  await logAudit({
    action: "supplier_created",
    category: "supplier",
    entity: created,
    entityName: created.name,
    user,
    details: `Furnizor "${created.name}"`,
  });
  return ok(created, { status: 201 });
}
