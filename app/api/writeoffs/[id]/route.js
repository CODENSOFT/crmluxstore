import { route, notFound } from "@/lib/api";
import { getDoc } from "@/lib/stockDocsQuery";

export const GET = route(async ({ params }) => {
  const d = await getDoc("writeoffs", params.id);
  if (!d) throw notFound("Documentul nu există");
  return d;
});
