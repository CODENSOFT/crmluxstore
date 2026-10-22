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

  // toate verificarile intr-un singur drum pana la baza (conteaza la pornirea fiecarei instante)
  const [[{ admins, cats, whs }], settings] = await Promise.all([
    sql`select (select count(*)::int from users where role in ('owner', 'admin')) as admins,
               (select count(*)::int from categories) as cats,
               (select count(*)::int from warehouses) as whs`,
    getSettings({ fresh: true }),
  ]);
  // parola implicita de dezvoltare doar local; pe site contul se creeaza numai cu SEED_ADMIN_PASSWORD
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || (process.env.NODE_ENV === "production" ? null : "admin123");
  if (!admins && !seedPassword) {
    console.error("[seed] Lipseste SEED_ADMIN_PASSWORD: contul administratorului principal nu a fost creat.");
  } else if (!admins) {
    const email = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local").toLowerCase().trim();
    await sql`
      insert into users (name, email, password_hash, role)
      values (${process.env.SEED_ADMIN_NAME || "Administrator"}, ${email},
              ${await hashPassword(seedPassword)}, 'owner')
      on conflict do nothing`;
    console.log(`[seed] Cont administrator principal creat: ${email}`);
  }

  if (!cats) {
    const rows = DEFAULT_CATEGORIES.map((name, i) => ({ name, slug: slug(name), sort: i }));
    await sql`insert into categories ${sql(rows, "name", "slug", "sort")}`;
  }

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
