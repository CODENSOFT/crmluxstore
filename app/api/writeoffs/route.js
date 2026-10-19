import { db } from "@/lib/db";
import { route, readJson } from "@/lib/api";
import { createWriteoff } from "@/lib/stockDocs";
import { listDocs } from "@/lib/stockDocsQuery";

export const GET = route(async ({ query }) => {
  const sql = db();
  const extra = query.get("reason") ? [sql`d.reason_code = ${query.get("reason")}`] : [];
  return listDocs("writeoffs", query, extra);
});

export const POST = route(async ({ req, user }) => createWriteoff(await readJson(req), user), { perm: "stock.writeoff" });
