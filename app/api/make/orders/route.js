import connectDB from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { ok, fail, requireApiKey } from "@/lib/api";
import { dispatchToMake } from "@/lib/make";
import { notifyAdminsForApproval } from "@/lib/notify";

// Make: citeste comenzile
export async function GET(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const filter = status ? { status } : {};
  const orders = await Order.find(filter)
    .populate("responsible", "name email")
    .sort({ createdAt: -1 })
    .limit(200);
  return ok(orders);
}

// Make: creeaza o comanda (ex: dintr-un formular web). Ramane "pending" pentru aprobare.
// Format items: [{ productId | sku, warehouseId, quantity }]
export async function POST(req) {
  const auth = requireApiKey(req);
  if (auth) return auth;
  await connectDB();
  const body = await req.json();

  if (!Array.isArray(body.items) || body.items.length === 0)
    return fail("items este obligatoriu");

  const admin = await User.findOne({ role: "admin" });
  if (!admin) return fail("Niciun admin configurat");

  let responsible = admin._id;
  if (body.responsibleEmail) {
    const r = await User.findOne({
      email: body.responsibleEmail.toLowerCase(),
    });
    if (r) responsible = r._id;
  }

  const builtItems = [];
  for (const it of body.items) {
    const product = it.productId
      ? await Product.findById(it.productId)
      : await Product.findOne({ sku: it.sku });
    if (!product)
      return fail(`Produs negasit: ${it.productId || it.sku}`);
    if (!it.warehouseId) return fail("warehouseId lipseste pe o linie");
    const qty = Number(it.quantity);
    if (!qty || qty <= 0) return fail("quantity invalid");
    const unitPrice = product.price || 0;
    builtItems.push({
      product: product._id,
      productName: product.name,
      warehouse: it.warehouseId,
      quantity: qty,
      unit: product.unit,
      unitPrice,
      lineTotal: +(unitPrice * qty).toFixed(2),
    });
  }

  const total = +builtItems.reduce((s, i) => s + i.lineTotal, 0).toFixed(2);
  const count = await Order.countDocuments();

  const order = await Order.create({
    number: `CMD-${String(count + 1).padStart(6, "0")}`,
    items: builtItems,
    total,
    status: "new",
    responsible,
    createdBy: admin._id,
    customerName: body.customerName,
    note: body.note || "Comanda primita din Make.com",
    stockApplied: false,
  });

  // Notificam adminii despre comanda noua sosita din exterior
  const populated = await Order.findById(order._id)
    .populate("responsible", "name")
    .populate("createdBy", "name")
    .populate("items.warehouse", "name");
  await notifyAdminsForApproval(populated, "order_new");

  await dispatchToMake("order.created", order.toJSON());
  return ok({ id: String(order._id), number: order.number, total }, {
    status: 201,
  });
}
