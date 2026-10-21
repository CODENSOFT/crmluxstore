"use client";

import { Suspense } from "react";
import { useUser, can } from "@/app/_components/user";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { num, formatDateTime, relativeTime } from "@/lib/format";
import { Card, PageHeader, ButtonLink, Select, SearchInput, EmptyState } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Plus, ArrowsLeftRight, ArrowRight } from "@/app/_components/icons";

function Inner() {
  const user = useUser();
  const [f, setF] = useQueryState({ page: "1" });
  const { data, loading, error, reload } = useApi(`/api/transfers${qs({ q: f.q, warehouse: f.warehouse, page: f.page, limit: 30 })}`);
  const { data: warehouses } = useApi("/api/warehouses");
  const columns = [
    { key: "number", header: "Transfer", render: (d) => <div><div className="font-medium text-fg">{d.number || "—"}</div><div className="text-[12px] text-fg-3">{formatDateTime(d.createdAt)}</div></div> },
    {
      key: "route",
      header: "Traseu",
      render: (d) => (
        <span className="inline-flex items-center gap-1.5 text-fg-2">
          {d.fromWarehouse?.name} <ArrowRight size={13} className="text-fg-4" /> {d.toWarehouse?.name}
        </span>
      ),
    },
    { key: "items", header: "Produse", render: (d) => <div className="max-w-[360px] truncate text-[12.5px] text-fg-3">{d.items.map((l) => `${l.productName || l.product?.name} × ${num(l.quantity)}`).join(", ")}</div> },
    { key: "by", header: "Efectuat de", align: "right", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name || "—"} · {relativeTime(d.createdAt)}</span> },
  ];
  return (
    <div className="animate-in">
      <PageHeader
        title="Transferuri"
        description="Mutarea mărfii între depozite, magazin și mașina de livrare."
        actions={can(user, "stock.transfer") && <ButtonLink href="/transfer/nou" variant="primary" icon={Plus}>Transfer nou</ButtonLink>}
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr sau produs…" className="w-full sm:w-64" />
          <Select value={f.warehouse || ""} onChange={(e) => setF({ warehouse: e.target.value })} className="w-[180px]">
            <option value="">Toate depozitele</option>
            {(warehouses || []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon={ArrowsLeftRight} title="Niciun transfer" action={<ButtonLink href="/transfer/nou" size="sm" variant="primary" icon={Plus}>Transfer nou</ButtonLink>} />} />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
