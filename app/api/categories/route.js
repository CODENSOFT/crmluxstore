import { db } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";

export const GET = route(async () => {
  return db()`
    select c.*, (select count(*)::int from products p where p.category_id = c.id and p.active) as product_count
    from categories c order by c.sort, lower(c.name)`;
});

export const POST = route(
  async ({ req }) => {
    const { name, parent, color } = await readJson(req);
    if (!name?.trim()) throw badRequest("Denumirea categoriei este obligatorie");
    const sql = db();
    const [{ max }] = await sql`select coalesce(max(sort), 0) as max from categories`;
    const [c] = await sql`insert into categories ${sql({ name: name.trim(), parentId: parent || null, color: color || null, sort: max + 1 })} returning *`;
    return c;
  },
  { perm: "products.manage" }
);
