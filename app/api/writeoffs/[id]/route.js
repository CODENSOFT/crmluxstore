import WriteOff from "@/models/WriteOff";
import { route, notFound } from "@/lib/api";
import { docLines } from "@/lib/dto";

export const GET = route(async ({ params }) => {
  const d = await WriteOff.findById(params.id)
    .populate("warehouse", "name address")
    .populate("createdBy", "name")
    .populate("product", "name unit")
    .lean();
  if (!d) throw notFound("Documentul nu există");
  return { ...d, items: docLines(d) };
});
