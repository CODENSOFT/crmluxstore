"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { formatDateTime, relativeTime } from "@/lib/format";
import { roleLabel } from "@/lib/constants";
import { Card, PageHeader, Select, SearchInput, Input, Badge, Avatar, EmptyState } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { ClockCounterClockwise } from "@/app/_components/icons";

const CATS = { order: "Comenzi", product: "Produse", stock: "Stoc", warehouse: "Depozite", customer: "Clienți", supplier: "Furnizori", user: "Utilizatori", integration: "Integrări", settings: "Setări" };
const TONE = { order: "accent", product: "violet", stock: "info", customer: "ok", integration: "warn", user: "neutral", settings: "neutral" };

function Inner() {
  const [f, setF] = useQueryState({ page: "1" });
  const { data, loading, error, reload } = useApi(`/api/activity${qs({ q: f.q, category: f.category, user: f.user, from: f.from, to: f.to, page: f.page, limit: 50 })}`);
  const { data: users } = useApi("/api/users");
  const columns = [
    { key: "date", header: "Când", render: (a) => <span className="whitespace-nowrap text-[12.5px] text-fg-3" title={formatDateTime(a.createdAt)}>{relativeTime(a.createdAt)}<div className="text-fg-4">{formatDateTime(a.createdAt)}</div></span> },
    { key: "user", header: "Cine", render: (a) => <div className="flex items-center gap-2"><Avatar name={a.userName} size={26} /><div><div className="text-[13px] text-fg">{a.userName || "—"}</div><div className="text-[11.5px] text-fg-4">{a.userRole ? roleLabel(a.userRole) : "sistem"}</div></div></div> },
    { key: "cat", header: "Zona", render: (a) => (a.category ? <Badge tone={TONE[a.category]}>{CATS[a.category] || a.category}</Badge> : "—") },
    {
      key: "what",
      header: "Ce a făcut",
      render: (a) => (
        <div className="min-w-[260px]">
          <div className="text-[13px] text-fg">
            {a.label}
            {a.order ? (
              <Link href={`/comenzi/${a.order}`} className="ml-1.5 font-medium text-accent hover:underline">{a.orderNumber}</Link>
            ) : a.entityName ? (
              <span className="ml-1.5 font-medium">{a.entityName}</span>
            ) : null}
          </div>
          {a.details && <div className="mt-0.5 text-[12.5px] text-fg-3">{a.details}</div>}
        </div>
      ),
    },
  ];
  return (
    <div className="animate-in">
      <PageHeader title="Istoric activitate" description="Cine, ce și când — toate acțiunile importante din CRM. Se păstrează 30 de zile." />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Caută în detalii…" className="w-full sm:w-64" />
          <Select value={f.category || ""} onChange={(e) => setF({ category: e.target.value })} className="w-[160px]">
            <option value="">Toate zonele</option>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={f.user || ""} onChange={(e) => setF({ user: e.target.value })} className="w-[170px]">
            <option value="">Toți utilizatorii</option>
            {(users || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </Select>
          <Input type="date" value={f.from || ""} onChange={(e) => setF({ from: e.target.value })} className="w-[140px]" aria-label="De la" />
          <Input type="date" value={f.to || ""} onChange={(e) => setF({ to: e.target.value })} className="w-[140px]" aria-label="Până la" />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} dense empty={<EmptyState icon={ClockCounterClockwise} title="Nicio activitate" />} />
        <Pagination page={Number(f.page) || 1} limit={50} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
    </div>
  );
}

export default function ActivityPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
