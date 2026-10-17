import { route, readJson } from "@/lib/api";
import { createInventory } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => listDocs("inventory", query));

export const POST = route(async ({ req, user }) => createInventory(await readJson(req), user));
