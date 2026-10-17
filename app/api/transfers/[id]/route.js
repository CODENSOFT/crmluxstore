import { route, notFound } from "@/lib/api";
import { getDoc } from "@/lib/stockDocsQuery";

export const GET = route(async ({ params }) => {
  const d = await getDoc("transfers", params.id);
  if (!d) throw notFound("Transferul nu există");
  return d;
});
