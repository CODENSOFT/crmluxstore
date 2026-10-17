"use client";

import { Suspense } from "react";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser } from "@/app/_components/user";
import { money, relativeTime, formatDateTime, num } from "@/lib/format";
import { CHANNELS, channelLabel, PAYMENT_STATUS } from "@/lib/constants";
import { Card, PageHeader, ButtonLink, Tabs, StageBadge, PaymentBadge, Select, SearchInput, Input, Button, EmptyState, cx } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Plus, DownloadSimple, Receipt, Globe, PencilSimple, X } from "@/app/_components/icons";

const TABS = [
  { key: "open", label: "În lucru", statuses: ["new", "pending_approval", "processing", "ready", "invoicing"] },
  { key: "new", label: "Noi" },
  { key: "pending_approval", label: "La aprobare" },
  { key: "processing", label: "În pregătire" },
  { key: "ready", label: "Gata" },
  { key: "invoicing", label: "Livrare" },
  { key: "completed", label: "Finalizate" },
  { key: "cancelled", label: "Anulate", statuses: ["cancelled", "rejected"] },
  { key: "debt", label: "Neachitate" },
  { key: "all", label: "Toate" },
];

function OrdersInner() {
  const user = useUser();
  const isAdmin = user.role === "admin";
  const [f, setF] = useQueryState({ status: "open", page: "1" });
  const params = {
    status: f.status === "all" ? "" : f.status,
    q: f.q,
    channel: f.channel,
    paymentStatus: f.paymentStatus,
    responsible: f.responsible,
    from: f.from,
    to: f.to,
    page: f.page,
    limit: 30,
  };
  const { data, loading, error, reload } = useApi(`/api/orders${qs(params)}`);
  const { data: users } = useApi(isAdmin ? "/api/users" : null);
  const counts = data?.counts || {};
  const tabCount = (t) => {
    if (t.key === "all" || t.key === "debt") return undefined;
    if (t.statuses) return t.statuses.reduce((s, k) => s + (counts[k] || 0), 0);
    return counts[t.key] || 0;
  };
  const filtered = f.q || f.channel || f.paymentStatus || f.responsible || f.from || f.to;
  const exportUrl = `/api/orders${qs({ ...params, page: undefined, limit: undefined, format: "csv" })}`;

  const columns = [
    {
      key: "number",
      header: "Comandă",
      render: (o) => (
        <div className="min-w-[120px]">
          <div className="flex items-center gap-1.5 font-medium text-fg">
            {o.number}
            {o.hasPendingEdit && <PencilSimple size={13} weight="bold" className="text-warn" title="Modificare în așteptare" />}
          </div>
          <div className="flex items-center gap-1 text-[12px] text-fg-3">
            {o.channel === "site" && <Globe size={12} />}
            {channelLabel(o.channel)}
            {o.externalNumber ? ` #${o.externalNumber}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Client",
      render: (o) => (
        <div className="min-w-[160px] max-w-[240px]">
          <div className="truncate text-fg">{o.customerName || <span className="text-fg-4">Fără client</span>}</div>
          {o.customerPhone && <div className="truncate text-[12px] text-fg-3">{o.customerPhone}</div>}
        </div>
      ),
    },
    {
      key: "items",
      header: "Produse",
      className: "hidden xl:table-cell",
      headClassName: "hidden xl:table-cell",
      render: (o) => (
        <div className="max-w-[280px] text-[12.5px] text-fg-3">
          <div className="truncate">
            {o.items.map((i) => `${i.productName} × ${num(i.quantity)}`).join(", ")}
          </div>
          {o.itemsCount > 3 && <div>+{o.itemsCount - 3} produse</div>}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (o) => <StageBadge status={o.status} short /> },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (o) => (
        <div>
          <div className="tnum whitespace-nowrap font-medium text-fg">{money(o.total)}</div>
          {!["cancelled", "rejected"].includes(o.status) && (
            <div className="mt-0.5 flex justify-end">
              <PaymentBadge status={o.paymentStatus} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: "responsible",
      header: "Responsabil",
      className: "hidden lg:table-cell",
      headClassName: "hidden lg:table-cell",
      render: (o) => <span className="text-fg-2">{o.responsible?.name || "—"}</span>,
    },
    {
      key: "createdAt",
      header: "Creată",
      align: "right",
      render: (o) => (
        <span className="whitespace-nowrap text-[12.5px] text-fg-3" title={formatDateTime(o.createdAt)}>
          {relativeTime(o.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader
        title="Comenzi"
        description="Comenzile din magazin, de pe site, telefon și B2B — de la confirmare până la încasare."
        actions={
          <>
            <a href={exportUrl} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 ring-1 ring-inset ring-line-strong transition-colors hover:bg-surface-2">
              <DownloadSimple size={16} weight="bold" />
              <span className="hidden sm:inline">Export Excel</span>
            </a>
            <ButtonLink href="/comenzi/nou" variant="primary" icon={Plus}>
              Comandă nouă
            </ButtonLink>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="px-3 sm:px-4">
          <Tabs
            tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: tabCount(t) }))}
            value={f.status}
            onChange={(v) => setF({ status: v })}
          />
        </div>
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr, client, telefon, produs…" className="w-full sm:w-72" />
          <Select value={f.channel || ""} onChange={(e) => setF({ channel: e.target.value })} className="w-[150px]">
            <option value="">Toate canalele</option>
            {CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select value={f.paymentStatus || ""} onChange={(e) => setF({ paymentStatus: e.target.value })} className="w-[150px]">
            <option value="">Orice plată</option>
            {Object.entries(PAYMENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          {isAdmin && (
            <Select value={f.responsible || ""} onChange={(e) => setF({ responsible: e.target.value })} className="w-[160px]">
              <option value="">Toți responsabilii</option>
              {(users || []).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
          <div className="flex items-center gap-1.5">
            <Input type="date" value={f.from || ""} onChange={(e) => setF({ from: e.target.value })} className="w-[140px]" aria-label="De la data" />
            <span className="text-fg-4">–</span>
            <Input type="date" value={f.to || ""} onChange={(e) => setF({ to: e.target.value })} className="w-[140px]" aria-label="Până la data" />
          </div>
          {filtered && (
            <Button variant="ghost" size="sm" icon={X} onClick={() => setF({ q: "", channel: "", paymentStatus: "", responsible: "", from: "", to: "" })}>
              Resetează
            </Button>
          )}
          {data && (
            <div className="ml-auto hidden text-[12.5px] text-fg-3 md:block">
              Total: <span className="tnum font-medium text-fg">{money(data.sums.total)}</span>
              {data.sums.debt > 0.01 && (
                <>
                  {" "}
                  · de încasat <span className="tnum font-medium text-bad">{money(data.sums.debt)}</span>
                </>
              )}
            </div>
          )}
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          rowHref={(o) => `/comenzi/${o._id}`}
          rowClassName={(o) => cx(o.status === "pending_approval" && isAdmin && "bg-warn-soft/40", o.status === "new" && o.channel === "site" && "bg-accent-soft/40")}
          mobile={(o) => (
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium text-fg">{o.number}</span>
                  <StageBadge status={o.status} short />
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-fg-3">
                  {o.customerName || "Fără client"} · {relativeTime(o.createdAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-[13.5px] font-medium text-fg">{money(o.total)}</div>
                <div className="mt-1">
                  <PaymentBadge status={o.paymentStatus} />
                </div>
              </div>
            </div>
          )}
          empty={
            <EmptyState
              icon={Receipt}
              title={filtered ? "Nicio comandă nu corespunde filtrelor" : "Nicio comandă în această categorie"}
              description={filtered ? "Modificați căutarea sau resetați filtrele." : "Comenzile noi apar aici automat, inclusiv cele de pe site."}
              action={
                !filtered && (
                  <ButtonLink href="/comenzi/nou" variant="primary" icon={Plus} size="sm">
                    Comandă nouă
                  </ButtonLink>
                )
              }
            />
          }
        />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersInner />
    </Suspense>
  );
}
