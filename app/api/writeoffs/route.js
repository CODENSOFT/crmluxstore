import WriteOff from "@/models/WriteOff";
import { route, readJson } from "@/lib/api";
import { createWriteoff } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => {
  const extra = query.get("reason") ? { reasonCode: query.get("reason") } : {};
  return listDocs(WriteOff, query, {
    populate: [["warehouse", "name"], ["createdBy", "name"], ["product", "name unit"]],
    extraFilter: extra,
  });
});

export const POST = route(async ({ req, user }) => createWriteoff(await readJson(req), user));
