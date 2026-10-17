"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, moneyShort, num, formatDateTime } from "@/lib/format";
import { UNIT_LABELS, MOVEMENT_TYPES } from "@/lib/constants";
import { Card, PageHeader, Tabs, Select, SearchInput, Input, Badge, Stat, Dot, EmptyState, ButtonLink, cx } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { DownloadSimple, Stack, Coins, Warning, Prohibit, TrayArrowDown, ClockCounterClockwise } from "@/app/_components/icons";

const REF_LINK = { Order: (id) => `/comenzi/${id}`, StockArrival: (id) => `/receptie/${id}`, InventoryCount: (id) => `/inventariere/${id}`, Product: () => null };

function ExportLink({ href }) {
  return (
    <a href={href} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line-strong hover:bg-surface-2">
      <DownloadSimple size={16} weight="bold" />
      <span className="hidden sm:inline">Export Excel</span>
    </a>
  );
}

function Overview({ f, setF, reorder }) {
  const params = { q: f.q, category: f.category, status: reorder ? "" : f.status, warehouse: f.warehouse, view: reorder ? "reorder" : "" };
  const { data, loading, error, reload } = useApi(`/api/stock${qs(params)}`);
  const { data: categories } = useApi("/api/categories");
  const ws = (data?.warehouses || []).filter((w) => !f.warehouse || String(w._id) === f.warehouse);
  const columns = [
    {
      key: "name",
      header: "Produs",
      render: (r) => (
        <Link href={`/produse/${r._id}`} className="block min-w-[200px]">
          <div className="truncate font-medium text-fg hover:text-accent">{r.name}</div>
          <div className="truncate text-[12px] text-fg-3">{[r.sku, r.categoryName].filter(Boolean).join(" · ")}</div>
        </Link>
      ),
    },
    ...(reorder
      ? []
      : ws.length > 1
        ? ws.map((w) => ({
            key: String(w._id),
            header: w.name,
            align: "right",
            className: "hidden md:table-cell",
            headClassName: "hidden md:table-cell",
            render: (r) => <span className="tnum text-fg-2">{num(r.byWarehouse[String(w._id)] || 0)}</span>,
          }))
        : []),
    {
      key: "total",
      header: "Stoc total",
      align: "right",
      render: (r) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <Dot tone={r.stockStatus === "out" ? "bad" : r.stockStatus === "low" ? "warn" : "ok"} />
          <span className={cx("tnum font-medium", r.stockStatus === "out" ? "text-bad" : r.stockStatus === "low" ? "text-warn" : "text-fg")}>{num(r.totalStock)}</span>
          <span className="text-[12px] text-fg-3">{UNIT_LABELS[r.unit]}</span>
        </span>
      ),
    },
    { key: "min", header: "Minim", align: "right", render: (r) => <span className="tnum text-fg-3">{num(r.stockLimit)}</span> },
    ...(reorder
      ? [
          { key: "sold", header: "Vândut 30 zile", align: "right", render: (r) => <span className="tnum text-fg-2">{num(r.sold30)}</span> },
          { key: "sug", header: "De comandat", align: "right", render: (r) => <Badge tone="accent">{num(r.suggested)} {UNIT_LABELS[r.unit]}</Badge> },
          { key: "cost", header: "Cost estimat", align: "right", render: (r) => <span className="tnum text-fg-2">{r.costPrice ? money(r.costPrice * r.suggested) : "—"}</span> },
        ]
      : [
          { key: "value", header: "Valoare (vânzare)", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (r) => <span className="tnum text-fg-2">{money(r.value)}</span> },
          { key: "cost", header: "Valoare (cost)", align: "right", className: "hidden xl:table-cell", headClassName: "hidden xl:table-cell", render: (r) => <span className="tnum text-fg-3">{r.costValue ? money(r.costValue) : "—"}</span> },
        ]),
  ];
  const s = data?.summary;
  const totalCost = reorder ? (data?.rows || []).reduce((t, r) => t + (r.costPrice || 0) * r.suggested, 0) : 0;
  return (
    <>
      {!reorder ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Poziții" icon={Stack} value={s ? s.positions : "…"} sub="produse active" />
          <Stat label="Valoare stoc" icon={Coins} value={s ? moneyShort(s.value) : "…"} sub={s ? `la cost ${moneyShort(s.costValue)}` : null} />
          <Stat label="Stoc mic" icon={Warning} tone={s?.low ? "warn" : undefined} value={s ? s.low : "…"} sub="sub pragul minim" href="/stoc?tab=reorder" />
          <Stat label="Fără stoc" icon={Prohibit} tone={s?.out ? "bad" : undefined} value={s ? s.out : "…"} sub="epuizate" href="/stoc?status=out" />
        </div>
      ) : (
        data && (
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-5 py-3 text-[13.5px] shadow-xs">
            <span className="text-fg-2">
              <span className="font-semibold text-fg">{data.rows.length}</span> produse de reaprovizionat
            </span>
            <span className="text-fg-2">
              Cost estimat: <span className="tnum font-semibold text-fg">{money(totalCost)}</span>
            </span>
            <span className="text-[12.5px] text-fg-3">Cantitatea sugerată acoperă vânzările din ultimele 30 de zile (minim de 2× pragul).</span>
            <ButtonLink href="/receptie/nou" size="sm" icon={TrayArrowDown} className="ml-auto">
              Recepție
            </ButtonLink>
          </div>
        )
      )}
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Produs sau SKU…" className="w-full sm:w-64" />
          <Select value={f.category || ""} onChange={(e) => setF({ category: e.target.value })} className="w-[200px]">
            <option value="">Toate categoriile</option>
            {(categories || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          {!reorder && (
            <>
              <Select value={f.warehouse || ""} onChange={(e) => setF({ warehouse: e.target.value })} className="w-[180px]">
                <option value="">Toate depozitele</option>
                {(data?.warehouses || []).map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <Select value={f.status || ""} onChange={(e) => setF({ status: e.target.value })} className="w-[150px]">
                <option value="">Orice stoc</option>
                <option value="in">În stoc</option>
                <option value="low">Stoc mic</option>
                <option value="out">Fără stoc</option>
              </Select>
            </>
          )}
          <div className="ml-auto">
            <ExportLink href={`/api/stock${qs({ ...params, format: "csv" })}`} />
          </div>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.rows}
          loading={loading}
          error={error}
          onRetry={reload}
          dense
          empty={<EmptyState icon={Stack} title={reorder ? "Nimic de comandat" : "Niciun produs"} description={reorder ? "Toate produsele sunt peste pragul minim." : undefined} />}
        />
      </Card>
    </>
  );
}

function Movements({ f, setF }) {
  const params = { q: f.q, type: f.type, warehouse: f.warehouse, from: f.from, to: f.to, page: f.page, limit: 50 };
  const { data, loading, error, reload } = useApi(`/api/movements${qs(params)}`);
  const { data: warehouses } = useApi("/api/warehouses");
  const columns = [
    { key: "date", header: "Data", render: (m) => <span className="whitespace-nowrap text-fg-3">{formatDateTime(m.createdAt)}</span> },
    { key: "type", header: "Operațiune", render: (m) => <Badge tone={MOVEMENT_TYPES[m.type]?.tone}>{MOVEMENT_TYPES[m.type]?.label || m.type}</Badge> },
    {
      key: "product",
      header: "Produs",
      render: (m) => (
        <Link href={`/produse/${m.product}`} className="block min-w-[180px] max-w-[300px] truncate text-fg hover:text-accent">
          {m.productName}
        </Link>
      ),
    },
    { key: "wh", header: "Depozit", render: (m) => <span className="text-fg-2">{m.warehouse?.name || "—"}</span> },
    { key: "qty", header: "Cantitate", align: "right", render: (m) => <span className={cx("tnum font-medium", m.quantity > 0 ? "text-ok" : "text-bad")}>{m.quantity > 0 ? "+" : ""}{num(m.quantity)}</span> },
    { key: "bal", header: "Sold", align: "right", render: (m) => <span className="tnum text-fg-2">{m.balanceAfter != null ? num(m.balanceAfter) : "—"}</span> },
    {
      key: "ref",
      header: "Document",
      render: (m) => {
        const href = m.refId && REF_LINK[m.refType]?.(m.refId);
        return (
          <span className="text-[12.5px]">
            {href ? <Link href={href} className="font-medium text-accent hover:underline">{m.refNumber}</Link> : <span className="text-fg-3">{m.refNumber || m.note || "—"}</span>}
            {m.userName && <span className="text-fg-4"> · {m.userName}</span>}
          </span>
        );
      },
    },
  ];
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Produs, document, utilizator…" className="w-full sm:w-64" />
        <Select value={f.type || ""} onChange={(e) => setF({ type: e.target.value })} className="w-[170px]">
          <option value="">Toate operațiunile</option>
          {Object.entries(MOVEMENT_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <Select value={f.warehouse || ""} onChange={(e) => setF({ warehouse: e.target.value })} className="w-[170px]">
          <option value="">Toate depozitele</option>
          {(warehouses || []).map((w) => (
            <option key={w._id} value={w._id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={f.from || ""} onChange={(e) => setF({ from: e.target.value })} className="w-[140px]" aria-label="De la" />
        <Input type="date" value={f.to || ""} onChange={(e) => setF({ to: e.target.value })} className="w-[140px]" aria-label="Până la" />
        <div className="ml-auto">
          <ExportLink href={`/api/movements${qs({ ...params, page: undefined, limit: undefined, format: "csv" })}`} />
        </div>
      </Toolbar>
      <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} dense empty={<EmptyState icon={ClockCounterClockwise} title="Nicio mișcare" />} />
      <Pagination page={Number(f.page) || 1} limit={50} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
    </Card>
  );
}

function Inner() {
  const [f, setF] = useQueryState({ tab: "overview", page: "1" });
  return (
    <div className="animate-in">
      <PageHeader title="Situația stocului" description="Stocul pe fiecare depozit, ce trebuie comandat și registrul complet al mișcărilor." />
      <Tabs
        className="mb-4"
        value={f.tab}
        onChange={(t) => setF({ tab: t, q: "", status: "", type: "", page: "" })}
        tabs={[
          { key: "overview", label: "Stoc pe depozite" },
          { key: "reorder", label: "De comandat" },
          { key: "movements", label: "Registrul mișcărilor" },
        ]}
      />
      {f.tab === "movements" ? <Movements f={f} setF={setF} /> : <Overview key={f.tab} f={f} setF={setF} reorder={f.tab === "reorder"} />}
    </div>
  );
}

export default function StockPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
