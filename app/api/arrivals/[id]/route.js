import { route, notFound } from "@/lib/api";
import { getDoc } from "@/lib/stockDocsQuery";

export const GET = route(async ({ params }) => {
  const d = await getDoc("arrivals", params.id);
  if (!d) throw notFound("Recepția nu există");
  return d;
});
