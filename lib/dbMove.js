// Mutarea bazei de date pe alt server Supabase (ex: din SUA in Frankfurt, langa serverul site-ului).
// Ruleaza pe serverul site-ului: adresa bazei vechi (POSTGRES_URL) si a celei noi (conectata in Vercel
// cu un prefix, ex: FRA_POSTGRES_URL) sunt deja acolo — nimeni nu copiaza parole.
// Copierea e completa si se poate repeta: baza noua se goleste si se umple din nou, intr-o singura tranzactie.
import { connectionString, rawClient, applySchema } from "./db";

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const BATCH = 40; // randuri per pas (produsele pot avea mai multe fotografii in baza)

/** Numele variabilei cu adresa bazei noi: orice *POSTGRES_URL cu prefix (ex: FRA_POSTGRES_URL). */
export function targetKey() {
  return (
    Object.keys(process.env)
      // nu baza veche (POSTGRES_URL) si nu cea pe care ruleaza deja site-ul
      .filter((k) => k !== "POSTGRES_URL" && k.endsWith("POSTGRES_URL") && process.env[k] && process.env[k] !== connectionString())
      .sort()[0] || null
  );
}

// identitatea unei baze (server + utilizator + nume), fara parola — ca sa nu copiem baza peste ea insasi
function identity(url) {
  const u = new URL(url);
  return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

// primul drum deschide conexiunea (TLS, autentificare) — se masoara al doilea, cel real
async function ping(sql) {
  await sql`select 1`;
  const t = performance.now();
  await sql`select 1`;
  return Math.round((performance.now() - t) * 10) / 10;
}

async function tablesOf(sql) {
  const rows = await sql`select table_name from information_schema.tables
                         where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  return rows.map((r) => r.table_name);
}

async function counts(sql, tables) {
  if (!tables.length) return {};
  const parts = tables.map((t) => `select '${t}' as t, count(*)::int as n from ${q(t)}`).join(" union all ");
  const rows = await sql.unsafe(parts);
  return Object.fromEntries(rows.map((r) => [r.t, r.n]));
}

/** Starea: este conectata o baza noua? Cat de departe e fiecare baza de server? */
export async function moveStatus() {
  const key = targetKey();
  const status = { region: process.env.VERCEL_REGION || "local", targetKey: key, sourcePingMs: null, targetPingMs: null, same: false };
  const src = rawClient(connectionString());
  try {
    status.sourcePingMs = await ping(src);
    if (!key) return status;
    status.same = identity(connectionString()) === identity(process.env[key]);
    const dst = rawClient(process.env[key]);
    try {
      status.targetPingMs = await ping(dst);
      const tables = await tablesOf(dst);
      status.targetTables = tables.length;
      if (tables.includes("users")) status.targetCounts = await counts(dst, ["users", "products", "customers", "orders"].filter((t) => tables.includes(t)));
    } finally {
      await dst.end({ timeout: 2 });
    }
  } finally {
    await src.end({ timeout: 2 });
  }
  return status;
}

/** Copiaza toate datele din baza actuala in baza noua si verifica numarul de randuri pe fiecare tabel. */
export async function copyDatabase() {
  const key = targetKey();
  if (!key) throw new Error("Nu este conectată nicio bază nouă (variabilă de tip PREFIX_POSTGRES_URL în Vercel).");
  if (identity(connectionString()) === identity(process.env[key])) throw new Error("Baza nouă este aceeași cu cea actuală.");
  const started = Date.now();
  const src = rawClient(connectionString());
  const dst = rawClient(process.env[key]);
  try {
    await applySchema(dst);
    const srcTables = await tablesOf(src);
    const dstTables = new Set(await tablesOf(dst));
    const tables = srcTables.filter((t) => dstTables.has(t));
    const before = await counts(src, tables);
    let mode = "replica";

    await dst.begin(async (t) => {
      // fara declansatoare si verificari de chei straine cat timp copiem (ordinea tabelelor nu mai conteaza)
      try {
        await t.savepoint((s) => s`set local session_replication_role = replica`);
      } catch {
        mode = "triggers";
        for (const name of tables) await t.unsafe(`alter table ${q(name)} disable trigger user`);
      }
      await t.unsafe(`truncate ${tables.map(q).join(", ")}`);

      // fara modul „replica”: tabelele parinte inaintea celor care le refera
      let order = tables;
      if (mode === "triggers") {
        const deps = await t`select c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent
                             from pg_constraint c join pg_namespace n on n.oid = c.connamespace
                             where c.contype = 'f' and n.nspname = 'public'`;
        const clean = (x) => x.replace(/^public\./, "").replace(/"/g, "");
        const parents = new Map(tables.map((x) => [x, new Set()]));
        for (const d of deps) if (clean(d.child) !== clean(d.parent)) parents.get(clean(d.child))?.add(clean(d.parent));
        order = [];
        const seen = new Set();
        const visit = (x, stack = new Set()) => {
          if (seen.has(x) || stack.has(x)) return;
          stack.add(x);
          for (const p of parents.get(x) || []) visit(p, stack);
          seen.add(x);
          order.push(x);
        };
        tables.forEach((x) => visit(x));
      }

      for (const name of order) {
        for (let off = 0; off < before[name]; off += BATCH) {
          const [{ j }] = await src.unsafe(
            `select coalesce(json_agg(x), '[]')::text as j from (select * from ${q(name)} order by ctid limit ${BATCH} offset ${off}) x`
          );
          await t.unsafe(`insert into ${q(name)} select * from json_populate_recordset(null::${q(name)}, $1::text::json)`, [j]);
        }
      }

      // contoarele automate (bigserial) continua de unde au ramas
      const serials = await t`select table_name, column_name, pg_get_serial_sequence(quote_ident(table_name), column_name) as seq
                              from information_schema.columns
                              where table_schema = 'public' and column_default like 'nextval(%'`;
      for (const s of serials) {
        if (!s.seq) continue;
        await t.unsafe(`select setval('${s.seq}', coalesce((select max(${q(s.column_name)}) from ${q(s.table_name)}), 0) + 1, false)`);
      }

      if (mode === "triggers") for (const name of tables) await t.unsafe(`alter table ${q(name)} enable trigger user`);
    });

    const after = await counts(dst, tables);
    const report = tables.map((name) => ({ table: name, source: before[name], target: after[name], ok: before[name] === after[name] }));
    return { ok: report.every((r) => r.ok), mode, seconds: Math.round((Date.now() - started) / 100) / 10, tables: report };
  } finally {
    await Promise.all([src.end({ timeout: 2 }), dst.end({ timeout: 2 })]);
  }
}
