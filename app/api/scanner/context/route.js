import { route } from "@/lib/api";
import { ordersToPick, openInventories, SCAN_OPERATIONS } from "@/lib/scanner";

// Datele de care are nevoie pagina Scanare: operatiunile, comenzile de pregatit, inventarierile deschise
export const GET = route(async () => {
  const [orders, inventories] = await Promise.all([ordersToPick({ status: "processing", limit: 100 }), openInventories()]);
  return {
    operations: SCAN_OPERATIONS,
    orders: orders.map((o) => ({ _id: o._id, number: o.number, customerName: o.customerName, items: o.items.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, barcode: i.barcode, quantity: i.quantity, unit: i.unit })) })),
    inventories,
  };
});
