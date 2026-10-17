import StockArrival from "@/models/StockArrival";
import { route, readJson } from "@/lib/api";
import { createArrival } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) =>
  listDocs(StockArrival, query, {
    populate: [["warehouse", "name"], ["createdBy", "name"], ["product", "name unit"]],
  })
);

export const POST = route(async ({ req, user }) => {
  const { doc } = await createArrival(await readJson(req), user);
  return doc;
});
