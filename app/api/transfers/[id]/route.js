import Transfer from "@/models/Transfer";
import { route, notFound } from "@/lib/api";
import { docLines } from "@/lib/dto";

export const GET = route(async ({ params }) => {
  const d = await Transfer.findById(params.id)
    .populate("fromWarehouse", "name address")
    .populate("toWarehouse", "name address")
    .populate("createdBy", "name")
    .populate("product", "name unit")
    .lean();
  if (!d) throw notFound("Transferul nu există");
  return { ...d, items: docLines(d) };
});
