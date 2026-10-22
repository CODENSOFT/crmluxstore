// Conexiunea la Postgres (Supabase). Interogari SQL directe prin postgres.js —
// tranzactii reale, actualizari atomice de stoc, fara straturi intermediare.
import postgres from "postgres";
import { waitUntil } from "@vercel/functions";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

const g = globalThis;

// Conexiunile nefolosite se inchid dupa IDLE_SECONDS.
// Pe Vercel (Fluid Compute) serverul e pus pe pauza intre cereri; daca o conexiune ramane deschisa
// in pauza, la revenire poate fi „moarta” (inchisa de pooler / retea) si cererea urmatoare asteapta
// mult sau nu primeste date. De aceea, dupa fiecare cerere tinem instanta treaza pana se inchid
// conexiunile nefolosite (acelasi mecanism ca attachDatabasePool din @vercel/functions, care nu
// cunoaste clientul postgres.js). In afara Vercel (local, build) nu face nimic.
const IDLE_SECONDS = 10;
let idleTimer = null;
let idleResolve = null;
function holdUntilIdleClosed() {
  if (!process.env.VERCEL_REGION) return;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleResolve?.();
  }
  const done = new Promise((resolve) => {
    idleResolve = resolve;
  });
  idleTimer = setTimeout(() => {
    idleTimer = null;
    idleResolve?.();
  }, IDLE_SECONDS * 1000 + 500);
  try {
    waitUntil(done);
  } catch {
    /* in afara unei cereri */
  }
}

// snake_case (DB) <-> camelCase (JS); coloana `id` apare in JSON ca `_id` (contractul API existent)
const fromDb = (k) => (k === "id" ? "_id" : postgres.toCamel(k));
const toDb = (k) => (k === "_id" ? "id" : postgres.fromCamel(k));

export function connectionString() {
  // NOU_POSTGRES_URL = proiectul Supabase al proprietarului (Irlanda, eu-west-1), pe care s-au mutat datele
  // in octombrie 2026; POSTGRES_URL = baza veche, conectata prin integrarea Vercel (pastrata ca rezerva)
  const url =
    process.env.NOU_POSTGRES_URL ||
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

function createClient(url = connectionString(), { raw = false } = {}) {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  const pgbouncer = u.searchParams.get("pgbouncer") === "true";
  // parametri de URL pe care postgres.js i-ar trimite serverului ca setari necunoscute
  for (const k of ["sslmode", "supa", "pgbouncer", "connection_limit", "pool_timeout", "schema"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  // Pooler-ul Supabase (Supavisor): modul „Transaction” (port 6543) se BLOCHEAZA cand pe aceeasi conexiune
  // vin, una dupa alta, interogari cu si fara parametri (masurat: 2 din 3 incercari blocate pana la
  // statement_timeout; pe site: cereri oprite dupa 300 s). Panoul si rapoartele, care cer multe date deodata,
  // nu se mai incarcau. Modul „Session” (port 5432, acelasi server) nu are problema — il folosim mereu.
  const supabasePooler = u.hostname.endsWith(".pooler.supabase.com");
  if (supabasePooler && u.port === "6543") u.port = "5432";
  const transactionPooler = pgbouncer && !supabasePooler;
  return postgres(u.toString(), {
    ssl: local || sslmode === "disable" ? false : "require",
    // interogari pregatite (mai putine drumuri pana la baza); doar un pooler in mod tranzactie nu le suporta
    prepare: !transactionPooler,
    // in modul Session fiecare conexiune ocupa o conexiune reala la baza (limita mica pe planul gratuit)
    max: Number(process.env.PG_POOL_MAX) || (supabasePooler ? 4 : 5),
    idle_timeout: IDLE_SECONDS,
    max_lifetime: 60 * 30, // conexiunile se reinnoiesc periodic (pooler-ul poate inchide conexiuni foarte vechi)
    connect_timeout: 15,
    onnotice: () => {},
    // doar pentru analiza locala a vitezei: numara interogarile (PG_DEBUG=1)
    ...(process.env.PG_DEBUG ? { debug: () => (g.__luxQueries = (g.__luxQueries || 0) + 1) } : {}),
    ...(raw ? {} : { transform: { column: { from: fromDb, to: toDb }, undefined: null } }),
    types: {
      numeric: { to: 1700, from: [1700], serialize: (x) => String(x), parse: (x) => Number(x) },
      int8: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) },
    },
  });
}

/** Client separat, fara transformari de nume (pentru copierea bazei intre servere). Se inchide cu .end(). */
export function rawClient(url) {
  return createClient(url, { raw: true });
}

/** Clientul SQL (tagged template): db()`select ...` */
export function db() {
  if (!g.__luxSql) g.__luxSql = createClient();
  holdUntilIdleClosed();
  return g.__luxSql;
}

/** Tranzactie: totul sau nimic. */
export function tx(fn) {
  return db().begin(fn);
}

async function ensureSchema() {
  const sql = db();
  // o singura interogare in cazul obisnuit (schema la zi); tabela lipsa (42P01) = baza noua
  const current = async (q) => {
    try {
      const [row] = await q`select value from schema_meta where key = 'version'`;
      return row?.value || null;
    } catch (e) {
      if (e?.code === "42P01") return null;
      throw e;
    }
  };
  if ((await current(sql)) === SCHEMA_VERSION) return;
  await applySchema(sql);
}

/** Creeaza / actualizeaza tabelele pe o baza (folosit si la mutarea datelor pe alt server). */
export async function applySchema(sql) {
  await sql.begin(async (t) => {
    await t`select pg_advisory_xact_lock(727274001)`;
    const [{ ok }] = await t`select to_regclass('public.schema_meta') is not null as ok`;
    if (ok) {
      const [row] = await t`select value from schema_meta where key = 'version'`;
      if (row?.value === SCHEMA_VERSION) return;
    }
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
