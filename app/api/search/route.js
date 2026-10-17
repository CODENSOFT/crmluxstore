import Product from "@/models/Product";
import Customer from "@/models/Customer";
import Order from "@/models/Order";
import { route, escapeRegex, normPhone } from "@/lib/api";
import { visibilityFilter } from "@/lib/orderService";

// Cautare globala (paleta de comenzi Ctrl+K)
export const GET = route(async ({ query, user }) => {
  const q = query.get("q")?.trim();
  if (!q || q.length < 2) return { products: [], customers: [], orders: [] };
  const rx = { $regex: escapeRegex(q), $options: "i" };
  const pn = normPhone(q);
  const custOr = [{ name: rx }, { contactPerson: rx }, { email: rx }, { idno: rx }, { number: rx }];
  if (pn && pn.length >= 4) custOr.push({ phoneNorm: { $regex: escapeRegex(pn) } });
  const [products, customers, orders] = await Promise.all([
    Product.find({ $or: [{ name: rx }, { sku: rx }, { barcode: rx }, { brand: rx }] })
      .select("name sku unit price stock active")
      .limit(6)
      .lean(),
    Customer.find({ $or: custOr }).select("name phone type number segment").limit(6).lean(),
    Order.find({ ...visibilityFilter(user), $or: [{ number: rx }, { customerName: rx }, { customerPhone: rx }, { externalNumber: rx }] })
      .select("number customerName total status createdAt")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),
  ]);
  return {
    products: products.map((p) => ({ ...p, totalStock: (p.stock || []).reduce((s, x) => s + (x.quantity || 0), 0), stock: undefined })),
    customers,
    orders,
  };
});
