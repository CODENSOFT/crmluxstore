"use client";

import { Suspense } from "react";
import { useApi, qs } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, num, formatDate, relativeTime } from "@/lib/format";
import { Card, PageHeader, ButtonLink, Select, SearchInput, Input, EmptyState } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Plus, TrayArrowDown } from "@/app/_components/icons";

function Inner() {
  const [f, setF] = useQueryState({ page: "1" });
  const { data, loading, error, reload } = useApi(`/api/arrivals${qs({ q: f.q, warehouse: f.warehouse, supplier: f.supplier, from: f.from, to: f.to, page: f.page, limit: 30 })}`);
  const { data: warehouses } = useApi("/api/warehouses");
  const { data: suppliers } = useApi("/api/suppliers");

  const columns = [
    {
      key: "number",
      header: "Recepție",
      render: (d) => (
        <div>
          <div className="font-medium text-fg">{d.number || "—"}</div>
          <div className="text-[12px] text-fg-3">{formatDate(d.createdAt)}</div>
        </div>
      ),
    },
    {
      key: "supplier",
      header: "Furnizor",
      render: (d) => (
        <div>
          <div className="text-fg-2">{d.supplier || <span className="text-fg-4">—</span>}</div>
          {d.supplierInvoice && <div className="text-[12px] text-fg-3">Factura {d.supplierInvoice}</div>}
        </div>
      ),
    },
    {
      key: "items",
      header: "Produse",
      render: (d) => (
        <div className="max-w-[320px] truncate text-[12.5px] text-fg-3">
          {d.items.map((l) => `${l.productName || l.product?.name} × ${num(l.quantity)}`).join(", ")}
        </div>
      ),
    },
    { key: "warehouse", header: "Depozit", className: "hidden md:table-cell", headClassName: "hidden md:table-cell", render: (d) => d.warehouse?.name || "—" },
    { key: "total", header: "Valoare", align: "right", render: (d) => <span className="tnum font-medium text-fg">{d.total ? money(d.total) : "—"}</span> },
    { key: "by", header: "Înregistrat", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name || d.source?.toUpperCase() || "—"} · {relativeTime(d.createdAt)}</span> },
  ];

  return (
    <div className="animate-in">
      <PageHeader
        title="Recepții de marfă"
        description="Intrările de marfă de la furnizori. Stocul crește automat, iar prețul de achiziție se actualizează."
        actions={
          <ButtonLink href="/receptie/nou" variant="primary" icon={Plus}>
            Recepție nouă
          </ButtonLink>
        }
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr, produs, furnizor…" className="w-full sm:w-64" />
          <Select value={f.supplier || ""} onChange={(e) => setF({ supplier: e.target.value })} className="w-[180px]">
            <option value="">Toți furnizorii</option>
            {(suppliers || []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
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
        </Toolbar>
        <DataTable
          columns={columns}
          rows={data?.items}
          loading={loading}
          error={error}
          onRetry={reload}
          rowHref={(d) => `/receptie/${d._id}`}
          empty={<EmptyState icon={TrayArrowDown} title="Nicio recepție" description="Înregistrați marfa sosită de la furnizori pentru a crește stocul." action={<ButtonLink href="/receptie/nou" size="sm" variant="primary" icon={Plus}>Recepție nouă</ButtonLink>} />}
        />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
    </div>
  );
}

export default function ArrivalsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
