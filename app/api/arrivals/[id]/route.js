import StockArrival from "@/models/StockArrival";
import { route, notFound } from "@/lib/api";
import { docLines } from "@/lib/dto";

export const GET = route(async ({ params }) => {
  const d = await StockArrival.findById(params.id)
    .populate("warehouse", "name address")
    .populate("supplierId", "name idno phone")
    .populate("createdBy", "name")
    .populate("product", "name unit")
    .lean();
  if (!d) throw notFound("Recepția nu există");
  return { ...d, items: docLines(d) };
});
