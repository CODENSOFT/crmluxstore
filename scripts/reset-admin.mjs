// Reseteaza contul de admin la valorile de baza: admin@crm.local / admin123
// Rulare:  node --env-file=.env.local scripts/reset-admin.mjs
import postgres from "postgres";
import bcrypt from "bcryptjs";

const URL_ = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
if (!URL_) {
  console.error("Lipseste POSTGRES_URL (ruleaza cu --env-file=.env.local)");
  process.exit(1);
}

const u = new URL(URL_);
for (const k of ["sslmode", "supa", "pgbouncer", "connection_limit", "pool_timeout", "schema"]) u.searchParams.delete(k);
const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
const sql = postgres(u.toString(), { ssl: local ? false : "require", prepare: false, max: 1, onnotice: () => {} });

const EMAIL = (process.env.SEED_ADMIN_EMAIL || "admin@crm.local").toLowerCase().trim();
const NAME = process.env.SEED_ADMIN_NAME || "Administrator";
const PASS = process.env.SEED_ADMIN_PASSWORD || "admin123";

try {
  const passwordHash = await bcrypt.hash(PASS, 10);
  // Gaseste adminul: intai dupa emailul de baza, altfel cel mai vechi admin
  let [admin] = await sql`select id from users where email = ${EMAIL}`;
  if (!admin) [admin] = await sql`select id from users where role in ('owner', 'admin') order by role = 'owner' desc, created_at limit 1`;
  if (!admin) {
    await sql`insert into users (name, email, password_hash, role, active) values (${NAME}, ${EMAIL}, ${passwordHash}, 'owner', true)`;
    console.log(`Cont admin creat: ${EMAIL}`);
  } else {
    await sql`update users set name = ${NAME}, email = ${EMAIL}, password_hash = ${passwordHash}, role = (case when exists (select 1 from users where role = 'owner' and id <> ${admin.id}) then 'admin' else 'owner' end), active = true where id = ${admin.id}`;
    console.log(`Cont admin resetat: ${EMAIL}`);
  }
  console.log("GATA — schimbați parola după autentificare (Profil).");
} catch (e) {
  console.error(e.message.includes("does not exist") ? "Tabelele nu există încă — deschideți o dată aplicația (schema se creează automat)." : e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
