import Transfer from "@/models/Transfer";
import { route, readJson } from "@/lib/api";
import { createTransfer } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) =>
  listDocs(Transfer, query, {
    populate: [["fromWarehouse", "name"], ["toWarehouse", "name"], ["createdBy", "name"], ["product", "name unit"]],
    warehouseFields: ["fromWarehouse", "toWarehouse"],
  })
);

export const POST = route(async ({ req, user }) => createTransfer(await readJson(req), user));
