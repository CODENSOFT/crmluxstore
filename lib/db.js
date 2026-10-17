// Conexiunea la Postgres (Supabase). Interogari SQL directe prin postgres.js —
// tranzactii reale, actualizari atomice de stoc, fara straturi intermediare.
import postgres from "postgres";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

const g = globalThis;

// snake_case (DB) <-> camelCase (JS); coloana `id` apare in JSON ca `_id` (contractul API existent)
const fromDb = (k) => (k === "id" ? "_id" : postgres.toCamel(k));
const toDb = (k) => (k === "_id" ? "id" : postgres.fromCamel(k));

function connectionString() {
  const url =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "Lipsește conexiunea la baza de date (POSTGRES_URL). Conectați baza Supabase la proiect în Vercel → Storage, sau setați POSTGRES_URL în .env.local."
    );
  }
  return url;
}

function createClient() {
  const u = new URL(connectionString());
  const sslmode = u.searchParams.get("sslmode");
  // parametri de URL pe care postgres.js i-ar trimite serverului ca setari necunoscute
  for (const k of ["sslmode", "supa", "pgbouncer", "connection_limit", "pool_timeout", "schema"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  return postgres(u.toString(), {
    ssl: local || sslmode === "disable" ? false : "require",
    prepare: false, // compatibil cu pooler-ul Supabase in mod tranzactie
    max: Number(process.env.PG_POOL_MAX) || 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    transform: { column: { from: fromDb, to: toDb }, undefined: null },
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x) => String(x), parse: (x) => Number(x) },
      int8: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
    },
  });
}

/** Clientul SQL (tagged template): db()`select ...` */
export function db() {
  if (!g.__luxSql) g.__luxSql = createClient();
  return g.__luxSql;
}

/** Tranzactie: totul sau nimic. */
export function tx(fn) {
  return db().begin(fn);
}

async function ensureSchema() {
  const sql = db();
  const current = async (q) => {
    const [{ ok }] = await q`select to_regclass('public.schema_meta') is not null as ok`;
    if (!ok) return null;
    const [row] = await q`select value from schema_meta where key = 'version'`;
    return row?.value || null;
  };
  if ((await current(sql)) === SCHEMA_VERSION) return;
  await sql.begin(async (t) => {
    await t`select pg_advisory_xact_lock(727274001)`;
    if ((await current(t)) === SCHEMA_VERSION) return;
    await t.unsafe(SCHEMA_SQL);
    await t`insert into schema_meta (key, value) values ('version', ${SCHEMA_VERSION})
            on conflict (key) do update set value = excluded.value`;
  });
}

/** Pregateste baza (schema + date initiale). Se executa o singura data per instanta. */
export function connectDB() {
  if (!g.__luxReady) {
    g.__luxReady = (async () => {
      await ensureSchema();
      const { ensureSeed } = await import("./seed");
      await ensureSeed();
    })().catch((e) => {
      g.__luxReady = null;
      throw e;
    });
  }
  return g.__luxReady;
}

export default connectDB;

/* ---------------- Utilitare SQL ---------------- */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === "string" && UUID_RE.test(s);

/** Id dintr-o valoare (string, obiect populat cu _id, null) */
export const idOf = (x) => (x == null || x === "" ? null : typeof x === "object" ? (x._id ?? x.id ?? null) : String(x));

/** Valoare pentru ILIKE '%...%' (escape % si _) */
export const likeOf = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Combina conditii SQL cu AND (fragmente postgres.js) */
export function where(conds) {
  const sql = db();
  const list = conds.filter(Boolean);
  if (!list.length) return sql`true`;
  return list.slice(1).reduce((acc, c) => sql`${acc} and ${c}`, list[0]);
}

/** Elimina cheile undefined (pentru UPDATE partial cu sql(obj)) */
export function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
