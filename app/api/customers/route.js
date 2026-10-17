import { db, likeOf, where } from "@/lib/db";
import { route, readJson, pagination, normPhone } from "@/lib/api";
import { CUSTOMER_COLS, createCustomer, findCustomerMatch } from "@/lib/customers";
import { logAudit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { customerDTO } from "@/lib/dto";
import { csvResponse } from "@/lib/csv";
import { segmentLabel } from "@/lib/constants";

const SORTS = {
  name: "lower(c.name) asc",
  "-spent": "c.total_spent desc",
  "-balance": "c.balance desc",
  "-last": "c.last_order_at desc nulls last",
  "-createdAt": "c.created_at desc",
};

function filters(query) {
  const sql = db();
  const conds = [];
  const q = query.get("q")?.trim();
  if (q) {
    const l = likeOf(q);
    const pn = normPhone(q);
    conds.push(sql`(c.name ilike ${l} or c.contact_person ilike ${l} or c.email ilike ${l} or c.idno ilike ${l}
                    or c.number ilike ${l} or c.phone ilike ${l} ${pn && pn.length >= 4 ? sql`or c.phone_norm like ${likeOf(pn)}` : sql``})`);
  }
  if (query.get("segment")) conds.push(sql`c.segment = ${query.get("segment")}`);
  if (query.get("type")) conds.push(sql`c.type = ${query.get("type")}`);
  if (query.get("debt") === "1") conds.push(sql`c.balance > 0`);
  if (query.get("active") !== "all") conds.push(sql`c.active`);
  return where(conds);
}

// ?q=&segment=&type=&debt=1&sort=&page=&limit=   (?light=1 -> lista scurta pentru selectoare)
export const GET = route(async ({ query }) => {
  const sql = db();
  const w = filters(query);
  if (query.get("light") === "1") {
    return sql`
      select c.id, c.number, c.name, c.type, c.phone, c.email, c.idno, c.segment, c.price_type, c.discount, c.city, c.address, c.payment_term_days
      from customers c where ${w}
      order by c.last_order_at desc nulls last, lower(c.name) limit ${Math.min(100, Number(query.get("limit")) || 30)}`;
  }
  const order = sql.unsafe(SORTS[query.get("sort")] || SORTS["-createdAt"]);

  if (query.get("format") === "csv") {
    const list = await sql`select ${sql.unsafe(CUSTOMER_COLS)} from customers c where ${w} order by ${order}`;
    return csvResponse(
      list.map((c) => ({
        Cod: c.number || "",
        Nume: c.name,
        Tip: c.type === "company" ? "Persoană juridică" : "Persoană fizică",
        Segment: segmentLabel(c.segment),
        Telefon: c.phone || "",
        Email: c.email || "",
        IDNO: c.idno || "",
        Oraș: c.city || "",
        Adresă: c.address || "",
        "Reducere %": c.discount || 0,
        Comenzi: c.stats?.ordersCount || 0,
        "Total cumpărături": c.stats?.totalSpent || 0,
        Datorie: c.stats?.balance || 0,
      })),
      `clienti_${new Date().toISOString().slice(0, 10)}.csv`
    );
  }

  const { page, limit, skip } = pagination(query, { defLimit: 50 });
  const [items, [summary]] = await Promise.all([
    sql`
      select ${sql.unsafe(CUSTOMER_COLS)},
        (select json_build_object('_id', u.id, 'name', u.name) from users u where u.id = c.manager_id) as manager,
        count(*) over () as full_count
      from customers c where ${w} order by ${order}, c.id limit ${limit} offset ${skip}`,
    sql`select coalesce(sum(c.total_spent), 0) as spent, coalesce(sum(c.balance), 0) as debt,
               count(*) filter (where c.type = 'company')::int as b2b
        from customers c where ${w}`,
  ]);
  return { items: items.map(({ fullCount, ...c }) => c), total: items[0]?.fullCount || 0, page, limit, summary };
});

export const POST = route(async ({ req, user }) => {
  const body = await readJson(req);
  if (!body.force) {
    const dup = await findCustomerMatch({ idno: body.idno, phone: body.phone, email: body.email });
    if (dup) {
      return Response.json(
        { ok: false, error: `Există deja clientul „${dup.name}” cu aceleași date de contact`, duplicate: { _id: dup._id, name: dup.name } },
        { status: 409 }
      );
    }
  }
  const created = await createCustomer({ ...body, manager: body.manager || user.id });
  await logAudit({ action: "customer_created", category: "customer", entity: created, entityName: created.name, user });
  emit("customer.created", customerDTO(created));
  return created;
});
