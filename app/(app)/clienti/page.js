"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, moneyShort, relativeTime, formatDate } from "@/lib/format";
import { CUSTOMER_SEGMENTS, segmentLabel } from "@/lib/constants";
import { Card, PageHeader, Button, Select, SearchInput, Badge, Avatar, EmptyState, Stat, Switch } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Plus, DownloadSimple, UsersThree, Buildings, Wallet, Coins } from "@/app/_components/icons";

function CustomersInner() {
  const router = useRouter();
  const [f, setF] = useQueryState({ page: "1", sort: "-createdAt" });
  // linkuri vechi „?nou=1” -> pagina noua
  useEffect(() => {
    if (f.nou === "1") router.replace("/clienti/nou");
  }, [f.nou, router]);
  const params = { q: f.q, segment: f.segment, type: f.type, debt: f.debt, sort: f.sort, page: f.page, limit: 40 };
  const { data, loading, error, reload } = useApi(`/api/customers${qs(params)}`);

  const columns = [
    {
      key: "name",
      header: "Client",
      render: (c) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <Avatar name={c.name} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate font-medium text-fg">
              {c.type === "company" && <Buildings size={14} className="shrink-0 text-fg-3" />}
              <span className="truncate">{c.name}</span>
            </div>
            <div className="truncate text-[12px] text-fg-3">
              {c.number}
              {c.contactPerson ? ` · ${c.contactPerson}` : ""}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      className: "hidden md:table-cell",
      headClassName: "hidden md:table-cell",
      render: (c) => (
        <div className="text-[12.5px]">
          <div className="text-fg-2">{c.phone || "—"}</div>
          {c.email && <div className="truncate text-fg-3">{c.email}</div>}
        </div>
      ),
    },
    {
      key: "segment",
      header: "Segment",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          <Badge>{segmentLabel(c.segment)}</Badge>
          {c.priceType === "wholesale" && <Badge tone="accent">angro</Badge>}
          {c.discount > 0 && <Badge tone="ok">−{c.discount}%</Badge>}
        </div>
      ),
    },
    { key: "orders", header: "Comenzi", align: "right", render: (c) => <span className="tnum">{c.stats?.ordersCount || 0}</span> },
    { key: "spent", header: "Total cumpărat", align: "right", render: (c) => <span className="tnum font-medium text-fg">{money(c.stats?.totalSpent)}</span> },
    {
      key: "balance",
      header: "Datorie",
      align: "right",
      render: (c) => (c.stats?.balance > 0 ? <span className="tnum font-medium text-bad">{money(c.stats.balance)}</span> : <span className="text-fg-4">—</span>),
    },
    {
      key: "last",
      header: "Ultima comandă",
      align: "right",
      className: "hidden lg:table-cell",
      headClassName: "hidden lg:table-cell",
      render: (c) => <span className="whitespace-nowrap text-[12.5px] text-fg-3" title={formatDate(c.stats?.lastOrderAt)}>{c.stats?.lastOrderAt ? relativeTime(c.stats.lastOrderAt) : "—"}</span>,
    },
  ];

  const filtered = f.q || f.segment || f.type || f.debt;

  return (
    <div className="animate-in">
      <PageHeader
        title="Clienți"
        description="Persoane fizice, spălătorii self-service, studiouri de detailing și revânzători — cu istoric, condiții și datorii."
        actions={
          <>
            <a href={`/api/customers${qs({ ...params, page: undefined, limit: undefined, format: "csv" })}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line-strong hover:bg-surface-2">
              <DownloadSimple size={16} weight="bold" />
              <span className="hidden sm:inline">Export Excel</span>
            </a>
            <Button variant="primary" icon={Plus} onClick={() => router.push("/clienti/nou")}>
              Client nou
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clienți" icon={UsersThree} value={data ? data.total.toLocaleString("ro-RO") : "…"} sub={filtered ? "după filtre" : "activi"} />
        <Stat label="Persoane juridice" icon={Buildings} value={data ? data.summary.b2b : "…"} sub="clienți B2B" />
        <Stat label="Total cumpărat" icon={Coins} value={data ? moneyShort(data.summary.spent) : "…"} sub="comenzi confirmate" />
        <Stat label="De încasat" icon={Wallet} tone={data?.summary.debt > 0 ? "bad" : undefined} value={data ? moneyShort(data.summary.debt) : "…"} sub="datorii curente" href="/clienti?debt=1&sort=-balance" />
      </div>

      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Nume, telefon, IDNO, email…" className="w-full sm:w-72" />
          <Select value={f.segment || ""} onChange={(e) => setF({ segment: e.target.value })} className="w-[190px]">
            <option value="">Toate segmentele</option>
            {CUSTOMER_SEGMENTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          <Select value={f.type || ""} onChange={(e) => setF({ type: e.target.value })} className="w-[160px]">
            <option value="">Fizice și juridice</option>
            <option value="individual">Persoane fizice</option>
            <option value="company">Persoane juridice</option>
          </Select>
          <Select value={f.sort} onChange={(e) => setF({ sort: e.target.value })} className="w-[180px]">
            <option value="-createdAt">Cei mai noi</option>
            <option value="name">Alfabetic</option>
            <option value="-spent">Cumpărături (desc.)</option>
            <option value="-balance">Datorie (desc.)</option>
            <option value="-last">Ultima comandă</option>
          </Select>
          <Switch className="ml-1" label="Doar cu datorii" checked={f.debt === "1"} onChange={(v) => setF({ debt: v ? "1" : "" })} />
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          rowHref={(c) => `/clienti/${c._id}`}
          mobile={(c) => (
            <div className="flex items-center gap-3">
              <Avatar name={c.name} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-fg">{c.name}</div>
                <div className="truncate text-[12px] text-fg-3">
                  {c.phone || c.number} · {segmentLabel(c.segment)}
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[13px] font-medium text-fg">{moneyShort(c.stats?.totalSpent)}</div>
                {c.stats?.balance > 0 && <div className="tnum text-[12px] text-bad">datorie {moneyShort(c.stats.balance)}</div>}
              </div>
            </div>
          )}
          empty={
            <EmptyState
              icon={UsersThree}
              title={filtered ? "Niciun client găsit" : "Încă nu aveți clienți"}
              description={filtered ? "Încercați altă căutare." : "Clienții se adaugă manual sau automat, la comenzile de pe site."}
              action={!filtered && <Button variant="primary" size="sm" icon={Plus} onClick={() => router.push("/clienti/nou")}>Client nou</Button>}
            />
          }
        />
        <Pagination page={Number(f.page) || 1} limit={40} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>

    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersInner />
    </Suspense>
  );
}
