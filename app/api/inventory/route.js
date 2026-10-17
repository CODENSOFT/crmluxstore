import InventoryCount from "@/models/InventoryCount";
import { route, readJson } from "@/lib/api";
import { createInventory } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => {
  const res = await listDocs(InventoryCount, query, {
    populate: [["warehouse", "name"], ["createdBy", "name"], ["completedBy", "name"]],
  });
  res.items = res.items.map((d) => ({
    ...d,
    countedLines: d.items.filter((l) => l.counted !== null && l.counted !== undefined).length,
    items: undefined,
  }));
  return res;
});

export const POST = route(async ({ req, user }) => createInventory(await readJson(req), user));
