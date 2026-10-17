import { db } from "@/lib/db";
import { USER_COLS } from "@/lib/users";
import { hashPassword } from "@/lib/auth";
import { route, readJson, badRequest } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { SALE_STAGE_KEYS } from "@/lib/orderStages";
import { startOfMonth } from "@/lib/time";

// Lista utilizatorilor (managerii o folosesc pentru alegerea responsabililor)
export const GET = route(async ({ user, query }) => {
  const sql = db();
  if (user.role !== "admin" || query.get("stats") !== "1") {
    return sql`select ${sql.unsafe(USER_COLS)} from users order by role, lower(name)`;
  }
  // Statistici pe luna curenta pentru fiecare utilizator (doar admin)
  const rows = await sql`
    select ${sql.unsafe(USER_COLS.split(", ").map((c) => `u.${c}`).join(", "))},
      json_build_object('orders', coalesce(m.orders, 0), 'revenue', coalesce(m.revenue, 0)) as month
    from users u
    left join (
      select responsible_id, count(*)::int as orders, sum(total) as revenue from orders
      where created_at >= ${startOfMonth(new Date())} and status in ${sql(SALE_STAGE_KEYS)}
      group by responsible_id
    ) m on m.responsible_id = u.id
    order by u.role, lower(u.name)`;
  return rows;
});

export const POST = route(
  async ({ req, user }) => {
    const { name, email, password, role, phone, position } = await readJson(req);
    if (!name || !email || !password) throw badRequest("Numele, emailul și parola sunt obligatorii");
    if (String(password).length < 6) throw badRequest("Parola trebuie să aibă minim 6 caractere");
    const sql = db();
    const mail = String(email).toLowerCase().trim();
    const [dup] = await sql`select id from users where lower(email) = ${mail}`;
    if (dup) throw badRequest("Există deja un utilizator cu acest email");
    const [created] = await sql`insert into users ${sql({
      name: String(name).trim(),
      email: mail,
      passwordHash: await hashPassword(password),
      role: role === "admin" ? "admin" : "manager",
      phone: phone || null,
      position: position || null,
    })} returning ${sql.unsafe(USER_COLS)}`;
    await logAudit({ action: "user_created", category: "user", entity: created, entityName: created.name, user });
    return created;
  },
  { auth: "admin" }
);
