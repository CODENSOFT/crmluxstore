"use client";

import { Suspense } from "react";
import { useUser, can } from "@/app/_components/user";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, num, formatDateTime, relativeTime } from "@/lib/format";
import { WRITEOFF_REASONS, writeoffReasonLabel } from "@/lib/constants";
import { Card, PageHeader, ButtonLink, Select, SearchInput, EmptyState, Badge } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Plus, TrashSimple } from "@/app/_components/icons";

const TONE = { expired: "warn", damaged: "bad", defect: "bad", internal: "info", sample: "violet", lost: "bad", other: "neutral" };

function Inner() {
  const user = useUser();
  const [f, setF] = useQueryState({ page: "1" });
  const { data, loading, error, reload } = useApi(`/api/writeoffs${qs({ q: f.q, reason: f.reason, warehouse: f.warehouse, page: f.page, limit: 30 })}`);
  const columns = [
    { key: "number", header: "Document", render: (d) => <div><div className="font-medium text-fg">{d.number || "—"}</div><div className="text-[12px] text-fg-3">{formatDateTime(d.createdAt)}</div></div> },
    { key: "reason", header: "Motiv", render: (d) => <div><Badge tone={TONE[d.reasonCode] || "neutral"}>{d.reasonCode ? writeoffReasonLabel(d.reasonCode) : "—"}</Badge>{d.reason && <div className="mt-1 max-w-[260px] truncate text-[12px] text-fg-3">{d.reason}</div>}</div> },
    { key: "items", header: "Produse", render: (d) => <div className="max-w-[340px] truncate text-[12.5px] text-fg-3">{d.items.map((l) => `${l.productName || l.product?.name} × ${num(l.quantity)}`).join(", ")}</div> },
    { key: "warehouse", header: "Depozit", className: "hidden md:table-cell", headClassName: "hidden md:table-cell", render: (d) => d.warehouse?.name || "—" },
    { key: "cost", header: "Pierdere (cost)", align: "right", render: (d) => <span className="tnum font-medium text-fg">{d.totalCost ? money(d.totalCost) : "—"}</span> },
    { key: "by", header: "De", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name || "—"} · {relativeTime(d.createdAt)}</span> },
  ];
  return (
    <div className="animate-in">
      <PageHeader
        title="Casări"
        description="Produse scoase din stoc: expirate, deteriorate, defecte, consum intern sau mostre."
        actions={can(user, "stock.writeoff") && <ButtonLink href="/anulare/nou" variant="primary" icon={Plus}>Casare nouă</ButtonLink>}
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr sau produs…" className="w-full sm:w-64" />
          <Select value={f.reason || ""} onChange={(e) => setF({ reason: e.target.value })} className="w-[200px]">
            <option value="">Toate motivele</option>
            {WRITEOFF_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon={TrashSimple} title="Nicio casare" description="Nu există casări înregistrate." />} />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
    </div>
  );
}

export default function WriteoffsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
