import { route, readJson } from "@/lib/api";
import { createTransfer } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => listDocs("transfers", query));

export const POST = route(async ({ req, user }) => createTransfer(await readJson(req), user), { perm: "stock.transfer" });
