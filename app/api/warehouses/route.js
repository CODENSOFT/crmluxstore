import { db } from "@/lib/db";
import { route, readJson, badRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { updateSettings } from "@/lib/settings";

export const GET = route(async ({ query }) => {
  const sql = db();
  const all = query.get("all") === "1";
  if (query.get("stats") !== "1") {
    return sql`select * from warehouses where ${all ? sql`true` : sql`active`} order by is_default desc, lower(name)`;
  }
  return sql`
    select w.*, json_build_object(
      'positions', coalesce(st.positions, 0), 'units', coalesce(st.units, 0),
      'value', coalesce(st.value, 0), 'cost', coalesce(st.cost, 0)) as stats
    from warehouses w
    left join (
      select s.warehouse_id,
             count(*) filter (where s.quantity > 0)::int as positions,
             sum(s.quantity) as units,
             sum(s.quantity * coalesce(p.price, 0)) as value,
             sum(s.quantity * coalesce(p.cost_price, 0)) as cost
      from stock s join products p on p.id = s.product_id group by s.warehouse_id
    ) st on st.warehouse_id = w.id
    where ${all ? sql`true` : sql`w.active`}
    order by w.is_default desc, lower(w.name)`;
});

export const POST = route(
  async ({ req, user }) => {
    const body = await readJson(req);
    if (!body.name?.trim()) throw badRequest("Numele depozitului este obligatoriu");
    const sql = db();
    const [w] = await sql`insert into warehouses ${sql({
      name: body.name.trim(),
      code: body.code || null,
      type: ["warehouse", "store", "vehicle"].includes(body.type) ? body.type : "warehouse",
      address: body.address || null,
      note: body.note || null,
      syncToSite: body.syncToSite !== false,
      isDefault: !!body.isDefault,
    })} returning *`;
    if (w.isDefault) {
      await sql`update warehouses set is_default = false where id <> ${w._id}`;
      await updateSettings({ defaultWarehouse: w._id });
    }
    await logAudit({ action: "warehouse_created", category: "warehouse", entity: w, entityName: w.name, user });
    return w;
  },
  { auth: "admin" }
);
