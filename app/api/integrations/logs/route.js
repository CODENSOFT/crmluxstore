import IntegrationLog from "@/models/IntegrationLog";
import { route, pagination } from "@/lib/api";

export const GET = route(
  async ({ query }) => {
    const f = {};
    if (query.get("source")) f.source = query.get("source");
    if (query.get("status")) f.status = query.get("status");
    const { limit, skip, page } = pagination(query, { defLimit: 50 });
    const [items, total] = await Promise.all([
      IntegrationLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      IntegrationLog.countDocuments(f),
    ]);
    return { items, total, page, limit };
  },
  { auth: "admin" }
);
