import StockMovement from "@/models/StockMovement";
import { route, pagination } from "@/lib/api";

export const GET = route(async ({ params, query }) => {
  const { limit, skip } = pagination(query, { defLimit: 50, maxLimit: 500 });
  const filter = { product: params.id };
  if (query.get("warehouse")) filter.warehouse = query.get("warehouse");
  const [items, total] = await Promise.all([
    StockMovement.find(filter).populate("warehouse", "name").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StockMovement.countDocuments(filter),
  ]);
  return { items, total };
});
