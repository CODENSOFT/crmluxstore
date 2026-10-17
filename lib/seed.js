import { db } from "./db";
import { hashPassword } from "./auth";
import { DEFAULT_CATEGORIES } from "./constants";
import { getSettings, updateSettings } from "./settings";

let seeded = false;

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Prima pornire: cont admin, categoriile magazinului si un depozit implicit.
export async function ensureSeed() {
  if (seeded) return;
  seeded = true;
  const sql = db();

  const [{ n: admins }] = await sql`select count(*)::int as n from users where role = 'admin'`;
  if (!admins) {
    const email = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local").toLowerCase().trim();
    await sql`
      insert into users (name, email, password_hash, role)
      values (${process.env.SEED_ADMIN_NAME || "Administrator"}, ${email},
              ${await hashPassword(process.env.SEED_ADMIN_PASSWORD || "admin123")}, 'admin')
      on conflict do nothing`;
    console.log(`[seed] Cont admin creat: ${email}`);
  }

  const [{ n: cats }] = await sql`select count(*)::int as n from categories`;
  if (!cats) {
    const rows = DEFAULT_CATEGORIES.map((name, i) => ({ name, slug: slug(name), sort: i }));
    await sql`insert into categories ${sql(rows, "name", "slug", "sort")}`;
  }

  const [{ n: whs }] = await sql`select count(*)::int as n from warehouses`;
  const settings = await getSettings({ fresh: true });
  if (!whs) {
    const [w] = await sql`
      insert into warehouses (name, code, type, is_default)
      values ('Depozit principal', 'DEP-1', 'warehouse', true) returning id`;
    await updateSettings({ defaultWarehouse: w._id });
  } else if (!settings.defaultWarehouse) {
    const [w] = await sql`select id from warehouses order by is_default desc, created_at limit 1`;
    if (w) await updateSettings({ defaultWarehouse: w._id });
  }
}
