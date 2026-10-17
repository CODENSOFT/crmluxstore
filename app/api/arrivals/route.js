import { route, readJson } from "@/lib/api";
import { createArrival } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => listDocs("arrivals", query));

export const POST = route(async ({ req, user }) => {
  const { doc } = await createArrival(await readJson(req), user);
  return doc;
});
