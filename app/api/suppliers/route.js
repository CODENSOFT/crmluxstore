import { db, likeOf } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { pickSupplier } from "@/lib/suppliers";

export const GET = route(async ({ query }) => {
  const sql = db();
  const conds = [];
  if (query.get("all") !== "1") conds.push(sql`s.active`);
  if (query.get("q")) conds.push(sql`s.name ilike ${likeOf(query.get("q"))}`);
  return sql`
    select s.*, json_build_object('arrivals', coalesce(a.n, 0), 'total', coalesce(a.total, 0), 'lastArrivalAt', a.last) as stats
    from suppliers s
    left join (select supplier_id, count(*)::int as n, sum(total) as total, max(created_at) as last from arrivals group by supplier_id) a
      on a.supplier_id = s.id
    where ${conds.length ? conds.reduce((acc, c) => sql`${acc} and ${c}`) : sql`true`}
    order by lower(s.name)`;
});

export const POST = route(async ({ req, user }) => {
  const body = pickSupplier(await readJson(req));
  if (!body.name) throw badRequest("Numele furnizorului este obligatoriu");
  const sql = db();
  const [created] = await sql`insert into suppliers ${sql(body)} returning *`;
  await logAudit({ action: "supplier_created", category: "supplier", entity: created, entityName: created.name, user });
  return created;
});
