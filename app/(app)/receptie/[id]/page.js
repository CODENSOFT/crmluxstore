"use client";

import { use } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { money, num, formatDate, formatDateTime } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { Card, CardHeader, PageHeader, Button, DetailList, Skeleton, ErrorState } from "@/app/_components/ui";
import { Printer, Package, Info } from "@/app/_components/icons";

export default function ArrivalPage({ params }) {
  const { id } = use(params);
  const { data: d, error, reload } = useApi(`/api/arrivals/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!d) return <Skeleton className="h-96" />;
  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/receptie", label: "Recepții" }}
        title={`Recepția ${d.number || ""}`}
        description={`${formatDateTime(d.createdAt)} · ${d.warehouse?.name || ""}${d.supplier ? ` · ${d.supplier}` : ""}`}
        actions={
          <Button icon={Printer} onClick={() => window.print()}>
            Tipărește
          </Button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader title={`Produse (${d.items.length})`} icon={Package} />
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-y border-line bg-surface-2/60 text-left text-[12px] text-fg-3">
                <th className="px-5 py-2 font-medium">Produs</th>
                <th className="px-3 py-2 text-right font-medium">Cantitate</th>
                <th className="px-3 py-2 text-right font-medium">Preț achiziție</th>
                <th className="px-5 py-2 text-right font-medium">Valoare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.items.map((l, i) => (
                <tr key={i}>
                  <td className="px-5 py-3">
                    <Link href={`/produse/${l.product?._id || l.product}`} className="font-medium text-fg hover:text-accent">
                      {l.productName || l.product?.name}
                    </Link>
                    {l.sku && <div className="text-[12px] text-fg-3">{l.sku}</div>}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-fg-2">
                    {num(l.quantity)} {UNIT_LABELS[l.unit || l.product?.unit] || ""}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-fg-2">{l.unitCost != null ? money(l.unitCost) : "—"}</td>
                  <td className="tnum px-5 py-3 text-right font-medium text-fg">{l.unitCost ? money(l.unitCost * l.quantity) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td colSpan={3} className="px-5 py-3 text-right font-semibold text-fg">
                  Total
                </td>
                <td className="tnum px-5 py-3 text-right text-[16px] font-semibold text-fg">{money(d.total || 0)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
        <Card>
          <CardHeader title="Detalii" icon={Info} />
          <div className="px-5 pb-5">
            <DetailList
              items={[
                ["Număr", d.number],
                ["Depozit", d.warehouse?.name],
                ["Furnizor", d.supplierId ? <Link href={`/furnizori?open=${d.supplierId}`} className="text-accent hover:underline">{d.supplier}</Link> : d.supplier],
                ["Factură furnizor", d.supplierInvoice ? `${d.supplierInvoice}${d.supplierInvoiceDate ? ` din ${formatDate(d.supplierInvoiceDate)}` : ""}` : null],
                ["Înregistrat de", d.createdBy?.name || (d.source && d.source !== "crm" ? d.source.toUpperCase() : null)],
                ["Cod 1C", d.externalId],
                ["Notă", d.note],
              ]}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
