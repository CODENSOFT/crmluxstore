"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser, can } from "@/app/_components/user";
import { money, moneyShort, num, pct, formatDate, ymd } from "@/lib/format";
import { CHANNELS, segmentLabel, UNIT_LABELS } from "@/lib/constants";
import { Card, CardHeader, PageHeader, Tabs, Select, Input, Stat, Segmented, Badge, Skeleton, EmptyState, cx } from "@/app/_components/ui";
import { DataTable } from "@/app/_components/table";
import { ColumnChart, BarList } from "@/app/_components/charts";
import { DownloadSimple, Coins, Receipt, Tag, ChartLineUp, Wallet, UsersThree, Warning, Stack, Package } from "@/app/_components/icons";

function presetRange(p) {
  const now = new Date();
  const [y, m] = ymd(now).split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (p) {
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: ymd(now) };
    case "prev": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case "30":
      return { from: ymd(new Date(now.getTime() - 29 * 86400000)), to: ymd(now) };
    case "90":
      return { from: ymd(new Date(now.getTime() - 89 * 86400000)), to: ymd(now) };
    case "year":
      return { from: `${y}-01-01`, to: ymd(now) };
    default:
      return null;
  }
}

function Export({ href }) {
  return (
    <a href={href} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line-strong hover:bg-surface-2">
      <DownloadSimple size={16} weight="bold" /> Export Excel
    </a>
  );
}

function Sales({ params }) {
  const { data: d, loading } = useApi(`/api/reports/sales${qs(params)}`);
  const s = d?.summary;
  const chart = useMemo(() => (d?.series || []).map((x) => ({ label: params.group === "day" ? formatDate(x.key + "T12:00:00").slice(0, 5) : x.key, tooltipLabel: x.key, value: x.revenue, sub: `${x.orders} comenzi · marjă ${moneyShort(x.margin)}` })), [d, params.group]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Vânzări" icon={Coins} loading={loading && !d} value={moneyShort(s?.revenue)} sub={s ? `${s.orders} comenzi · ${s.customers} clienți` : null} />
        <Stat label="Marjă brută" icon={ChartLineUp} loading={loading && !d} value={moneyShort(s?.margin)} sub={s ? `${pct(s.marginPct)} din valoarea produselor` : null} />
        <Stat label="Bon mediu" icon={Tag} loading={loading && !d} value={moneyShort(s?.avg)} />
        <Stat label="Încasat" icon={Wallet} loading={loading && !d} value={moneyShort(s?.paid)} sub={s ? `TVA ${moneyShort(s.vat)} · livrări ${moneyShort(s.delivery)}` : null} />
      </div>
      <Card>
        <CardHeader title="Evoluția vânzărilor" description="Valoarea comenzilor confirmate (fără anulate / respinse)" />
        <div className="px-3 pb-3">{d ? chart.length ? <ColumnChart data={chart} height={240} format={(v) => money(v)} /> : <EmptyState compact title="Fără vânzări în perioadă" /> : <Skeleton className="mx-2 h-60" />}</div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pe categorii" description="Valoarea produselor vândute" />
          <div className="px-5 pb-5">
            <BarList items={(d?.byCategory || []).map((c) => ({ key: c.key, label: c.label, value: c.revenue, sub: `marjă ${moneyShort(c.margin)}` }))} format={(v) => moneyShort(v)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Pe canale de vânzare" />
          <div className="px-5 pb-5">
            <BarList items={(d?.byChannel || []).map((c) => ({ key: c.key, label: c.label, value: c.revenue, sub: `${c.orders} cmd.` }))} format={(v) => moneyShort(v)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Pe manageri" />
          <div className="px-5 pb-5">
            <BarList items={(d?.byManager || []).map((c) => ({ key: c.key, label: c.label, value: c.revenue, sub: `${c.orders} cmd.` }))} format={(v) => moneyShort(v)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Pe metode de plată" />
          <div className="px-5 pb-5">
            <BarList items={(d?.byPayment || []).map((c) => ({ key: c.key, label: c.label, value: c.revenue, sub: `${c.orders} cmd.` }))} format={(v) => moneyShort(v)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Products({ params }) {
  const { data: d, loading, error } = useApi(`/api/reports/products${qs(params)}`);
  const columns = [
    { key: "abc", header: "ABC", render: (r) => <Badge tone={r.abc === "A" ? "ok" : r.abc === "B" ? "accent" : "neutral"}>{r.abc}</Badge> },
    { key: "name", header: "Produs", render: (r) => <Link href={`/produse/${r._id}`} className="block min-w-[200px] font-medium text-fg hover:text-accent">{r.name}<div className="text-[12px] font-normal text-fg-3">{r.sku}</div></Link> },
    { key: "qty", header: "Cantitate", align: "right", render: (r) => <span className="tnum">{num(r.qty)} {UNIT_LABELS[r.unit]}</span> },
    { key: "orders", header: "Comenzi", align: "right", render: (r) => <span className="tnum">{r.orders}</span> },
    { key: "revenue", header: "Vânzări", align: "right", render: (r) => <span className="tnum font-medium text-fg">{money(r.revenue)}</span> },
    { key: "margin", header: "Marjă brută", align: "right", render: (r) => <span className={cx("tnum", r.margin < 0 ? "text-bad" : "text-fg-2")}>{money(r.margin)}</span> },
  ];
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardHeader title="Clasament produse" description="Clasa A = produsele care aduc 80% din vânzări. Țineți-le mereu pe stoc." icon={Package} />
        <DataTable columns={columns} rows={d?.items} loading={loading} error={error} dense empty={<EmptyState compact title="Fără vânzări în perioadă" />} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Stoc fără mișcare" description="Produse cu stoc, dar fără nicio vânzare în perioada aleasă — bani blocați în depozit" icon={Warning} />
        {d?.dead?.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {d.dead.map((p) => (
              <li key={p._id}>
                <Link href={`/produse/${p._id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] hover:bg-surface-2/70">
                  <span className="min-w-0 truncate text-fg">{p.name}</span>
                  <span className="tnum shrink-0 text-fg-3">{num(p.total)} {UNIT_LABELS[p.unit]} · <span className="font-medium text-fg">{money(p.value)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-fg-3">Toate produsele cu stoc s-au vândut în perioadă.</p>
        )}
      </Card>
    </div>
  );
}

function Customers({ params }) {
  const { data: d, loading, error } = useApi(`/api/reports/customers${qs(params)}`);
  const columns = [
    { key: "name", header: "Client", render: (r) => <Link href={`/clienti/${r._id}`} className="block min-w-[180px] font-medium text-fg hover:text-accent">{r.name}<div className="text-[12px] font-normal text-fg-3">{segmentLabel(r.segment)}{r.phone ? ` · ${r.phone}` : ""}</div></Link> },
    { key: "orders", header: "Comenzi", align: "right", render: (r) => <span className="tnum">{r.orders}</span> },
    { key: "avg", header: "Bon mediu", align: "right", render: (r) => <span className="tnum">{money(r.avg)}</span> },
    { key: "revenue", header: "Vânzări", align: "right", render: (r) => <span className="tnum font-medium text-fg">{money(r.revenue)}</span> },
    { key: "balance", header: "Datorie", align: "right", render: (r) => (r.balance > 0 ? <span className="tnum text-bad">{money(r.balance)}</span> : <span className="text-fg-4">—</span>) },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader title="Clienți după valoare" icon={UsersThree} />
          <DataTable columns={columns} rows={d?.items} loading={loading} error={error} dense empty={<EmptyState compact title="Fără vânzări către clienți înregistrați" />} />
        </Card>
        <div className="space-y-4">
          <Stat label="Clienți noi în perioadă" icon={UsersThree} value={d ? d.newCustomers : "…"} />
          <Card>
            <CardHeader title="Pe segmente" />
            <div className="px-5 pb-5">
              <BarList items={(d?.bySegment || []).map((s) => ({ key: s.key, label: s.label, value: s.revenue, sub: `${s.customers} clienți` }))} format={(v) => moneyShort(v)} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Debts() {
  const { data: d, loading, error } = useApi(`/api/reports/debts`);
  const columns = [
    { key: "name", header: "Client", render: (r) => (r.customer ? <Link href={`/clienti/${r.customer}`} className="font-medium text-fg hover:text-accent">{r.name}</Link> : <span className="text-fg">{r.name}</span>) },
    { key: "phone", header: "Telefon", render: (r) => (r.phone ? <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="text-fg-2 hover:text-accent">{r.phone}</a> : "—") },
    { key: "orders", header: "Comenzi", align: "right", render: (r) => <span className="tnum">{r.orders}</span> },
    { key: "overdue", header: "Restanță", align: "right", render: (r) => (r.overdue > 0 ? <span className="tnum font-medium text-bad">{money(r.overdue)}</span> : <span className="text-fg-4">—</span>) },
    { key: "balance", header: "Total de încasat", align: "right", render: (r) => <span className="tnum font-semibold text-fg">{money(r.balance)}</span> },
  ];
  const orderCols = [
    { key: "number", header: "Comanda", render: (o) => <Link href={`/comenzi/${o._id}`} className="font-medium text-accent hover:underline">{o.number}</Link> },
    { key: "customer", header: "Client", render: (o) => o.customerName || "—" },
    { key: "date", header: "Data", render: (o) => formatDate(o.createdAt) },
    { key: "due", header: "Scadență", render: (o) => (o.dueDate ? <span className={o.overdueDays > 0 ? "font-medium text-bad" : ""}>{formatDate(o.dueDate)}{o.overdueDays > 0 ? ` (+${o.overdueDays} zile)` : ""}</span> : "—") },
    { key: "total", header: "Total", align: "right", render: (o) => <span className="tnum">{money(o.total)}</span> },
    { key: "bal", header: "Rest", align: "right", render: (o) => <span className="tnum font-semibold text-fg">{money(o.balance)}</span> },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total de încasat" icon={Wallet} value={moneyShort(d?.summary.total)} loading={loading && !d} />
        <Stat label="Cu termen depășit" icon={Warning} tone={d?.summary.overdue > 0 ? "bad" : undefined} value={moneyShort(d?.summary.overdue)} loading={loading && !d} />
        <Stat label="Comenzi neachitate" icon={Receipt} value={d?.summary.orders ?? "…"} />
        <Stat label="Clienți datori" icon={UsersThree} value={d?.summary.customers ?? "…"} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Pe clienți" />
        <DataTable columns={columns} rows={d?.customers} keyField="key" loading={loading} error={error} dense empty={<EmptyState compact title="Nicio datorie" description="Toate comenzile confirmate sunt achitate." />} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader title="Pe comenzi" description="Ordonate după scadență" />
        <DataTable columns={orderCols} rows={d?.items} loading={loading} dense empty={<EmptyState compact title="Nicio comandă neachitată" />} />
      </Card>
    </div>
  );
}

function StockReport() {
  const { data: d } = useApi(`/api/reports/stock`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Valoarea stocului pe depozite" description="La preț de vânzare" icon={Stack} />
        <div className="px-5 pb-5">
          {d ? <BarList items={d.byWarehouse.map((w) => ({ key: String(w._id), label: w.name, value: w.value, sub: `cost ${moneyShort(w.cost)}` }))} format={(v) => moneyShort(v)} /> : <Skeleton className="h-40" />}
        </div>
      </Card>
      <Card>
        <CardHeader title="Valoarea stocului pe categorii" icon={Package} />
        <div className="px-5 pb-5">
          {d ? <BarList items={d.byCategory.map((c) => ({ key: String(c._id), label: c.name, value: c.value, sub: `${c.products} prod.` }))} format={(v) => moneyShort(v)} /> : <Skeleton className="h-40" />}
        </div>
      </Card>
      <p className="text-[12.5px] text-fg-3 lg:col-span-2">
        Detaliile pe produs și lista de reaprovizionare sunt în <Link href="/stoc" className="font-medium text-accent hover:underline">Situația stocului</Link>.
      </p>
    </div>
  );
}

function Writeoffs({ params }) {
  const { data: d } = useApi(`/api/reports/writeoffs${qs(params)}`);
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Stat label="Pierderi din casări (cost)" icon={Warning} tone={d?.total > 0 ? "bad" : undefined} value={money(d?.total)} />
        <Card>
          <CardHeader title="Pe motive" />
          <div className="px-5 pb-5">
            <BarList items={(d?.byReason || []).map((r) => ({ key: r.key, label: r.label, value: r.cost, sub: `${r.docs} doc.` }))} format={(v) => moneyShort(v)} color="var(--series-8)" />
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="Documente de casare" />
        <ul className="divide-y divide-line border-t border-line">
          {(d?.items || []).map((w) => (
            <li key={w._id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
              <span>
                <span className="font-medium text-fg">{w.number}</span>
                <span className="ml-2 text-fg-3">{formatDate(w.createdAt)} · {w.warehouse?.name} {w.reason ? `· ${w.reason}` : ""}</span>
              </span>
              <span className="tnum font-medium text-fg">{money(w.totalCost || 0)}</span>
            </li>
          ))}
          {d && !d.items.length && <p className="px-5 py-8 text-center text-[13px] text-fg-3">Nicio casare în perioadă.</p>}
        </ul>
      </Card>
    </div>
  );
}

function Inner() {
  const user = useUser();
  const isAdmin = can(user, "orders.all") || can(user, "orders.approve");
  const [f, setF] = useQueryState({ tab: "sales", preset: "month", group: "day" });
  const { data: users } = useApi(isAdmin ? "/api/users" : null);
  const range = f.preset === "custom" ? { from: f.from, to: f.to } : presetRange(f.preset) || {};
  const params = { ...range, group: f.group, channel: f.channel, responsible: f.responsible };
  const periodTabs = ["sales", "products", "customers", "writeoffs"].includes(f.tab);
  const tabs = [
    { key: "sales", label: "Vânzări" },
    { key: "products", label: "Produse" },
    { key: "customers", label: "Clienți" },
    { key: "debts", label: "Datorii" },
    { key: "stock", label: "Stoc" },
    { key: "writeoffs", label: "Casări" },
  ];

  return (
    <div className="animate-in">
      <PageHeader
        title="Rapoarte"
        description="Vânzări, marje, produse, clienți și încasări — pentru decizii pe cifre, nu din memorie."
        actions={f.tab !== "stock" && <Export href={`/api/reports/${f.tab}${qs({ ...params, format: "csv" })}`} />}
      />
      <Tabs className="mb-4" value={f.tab} onChange={(t) => setF({ tab: t })} tabs={tabs} />
      {periodTabs && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Segmented
            value={f.preset}
            onChange={(v) => setF({ preset: v })}
            options={[
              { value: "month", label: "Luna aceasta" },
              { value: "prev", label: "Luna trecută" },
              { value: "30", label: "30 zile" },
              { value: "90", label: "90 zile" },
              { value: "year", label: "Anul" },
              { value: "custom", label: "Interval" },
            ]}
          />
          {f.preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={f.from || ""} onChange={(e) => setF({ from: e.target.value })} className="w-[140px]" aria-label="De la" />
              <span className="text-fg-4">–</span>
              <Input type="date" value={f.to || ""} onChange={(e) => setF({ to: e.target.value })} className="w-[140px]" aria-label="Până la" />
            </div>
          )}
          {f.tab === "sales" && (
            <Select value={f.group} onChange={(e) => setF({ group: e.target.value })} className="w-[150px]">
              <option value="day">Pe zile</option>
              <option value="week">Pe săptămâni</option>
              <option value="month">Pe luni</option>
            </Select>
          )}
          {f.tab !== "writeoffs" && (
            <Select value={f.channel || ""} onChange={(e) => setF({ channel: e.target.value })} className="w-[160px]">
              <option value="">Toate canalele</option>
              {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          )}
          {isAdmin && f.tab !== "writeoffs" && (
            <Select value={f.responsible || ""} onChange={(e) => setF({ responsible: e.target.value })} className="w-[170px]">
              <option value="">Toți managerii</option>
              {(users || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </Select>
          )}
          {range.from && <span className="text-[12.5px] text-fg-3">{formatDate(range.from + "T12:00:00")} – {formatDate((range.to || ymd()) + "T12:00:00")}</span>}
        </div>
      )}
      {f.tab === "sales" && <Sales params={params} />}
      {f.tab === "products" && <Products params={params} />}
      {f.tab === "customers" && <Customers params={params} />}
      {f.tab === "debts" && <Debts />}
      {f.tab === "stock" && <StockReport />}
      {f.tab === "writeoffs" && <Writeoffs params={params} />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
