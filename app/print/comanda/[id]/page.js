"use client";

import { Suspense, use, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useApi } from "@/lib/useApi";
import { num, formatDate, formatDateTime } from "@/lib/format";
import { UNIT_LABELS, paymentMethodLabel } from "@/lib/constants";
import { amountInWords } from "@/lib/numberWords";
import { Printer, Drop } from "@/app/_components/icons";

const f2 = (n) => Number(n || 0).toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Sheet({ order, s, doc }) {
  const cur = s.currency || "MDL";
  const incl = s.pricesIncludeVat !== false;
  const vatPayer = s.vatPayer !== false && order.vatTotal > 0;
  const titles = {
    factura: order.invoice?.number ? "Factură" : "Factură proformă",
    aviz: "Aviz de însoțire a mărfii",
    picking: "Fișă de pregătire comandă",
  };
  const docNo = doc === "factura" && order.invoice?.number ? order.invoice.number : order.number;
  const docDate = doc === "factura" && order.invoice?.date ? order.invoice.date : order.createdAt;
  const c = order.customer || {};

  // Linii (+ livrarea ca serviciu), cu defalcare TVA
  const lines = order.items.map((it) => ({
    name: it.productName,
    sku: it.sku,
    unit: UNIT_LABELS[it.unit] || it.unit,
    qty: it.quantity,
    price: it.unitPrice,
    discount: it.discount || 0,
    total: it.lineTotal,
    rate: it.vatRate || 0,
    warehouse: it.warehouse?.name,
  }));
  if (order.delivery?.cost > 0 && doc !== "picking") {
    lines.push({ name: `Servicii de livrare${order.delivery.label ? ` (${order.delivery.label})` : ""}`, unit: "serv.", qty: 1, price: order.delivery.cost, discount: 0, total: order.delivery.cost, rate: s.vatRate ?? 20 });
  }
  const vatOf = (l) => (vatPayer ? (incl ? (l.total * l.rate) / (100 + l.rate) : (l.total * l.rate) / 100) : 0);

  return (
    <div className="mx-auto w-full max-w-[820px] bg-white p-10 text-[12px] leading-snug text-[#111] shadow-sm ring-1 ring-black/5 print:max-w-none print:p-0 print:shadow-none print:ring-0">
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#111] pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#2457d4] text-white print:bg-[#2457d4]">
            <Drop size={24} weight="fill" />
          </span>
          <div>
            <div className="text-[16px] font-bold">{s.legalName || s.companyName}</div>
            <div className="mt-0.5 space-y-px text-[11px] text-[#444]">
              {s.idno && <div>IDNO: {s.idno}{s.vatCode ? ` · Cod TVA: ${s.vatCode}` : ""}</div>}
              {s.address && <div>{s.address}</div>}
              {(s.iban || s.bank) && <div>IBAN: {s.iban} {s.bank ? `· ${s.bank}` : ""} {s.bankCode ? `· ${s.bankCode}` : ""}</div>}
              <div>{[s.phone, s.email, s.website].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-bold uppercase tracking-tight">{titles[doc]}</div>
          <div className="mt-1 text-[13px] font-semibold">Nr. {docNo}</div>
          <div className="text-[11px] text-[#444]">din {formatDate(docDate)}</div>
          {doc === "factura" && order.invoice?.number && <div className="text-[11px] text-[#444]">Comanda {order.number}</div>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 py-5">
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#666]">{doc === "picking" ? "Client" : "Cumpărător"}</div>
          <div className="text-[13px] font-semibold">{order.customerName || c.name || "Client final"}</div>
          <div className="mt-0.5 space-y-px text-[11px] text-[#444]">
            {c.idno && <div>IDNO: {c.idno}{c.vatCode ? ` · Cod TVA: ${c.vatCode}` : ""}</div>}
            {c.legalAddress && <div>{c.legalAddress}</div>}
            {c.iban && <div>IBAN: {c.iban}{c.bank ? ` · ${c.bank}` : ""}</div>}
            {(order.customerPhone || c.phone) && <div>Tel.: {order.customerPhone || c.phone}</div>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[#666]">{doc === "factura" ? "Plată" : "Livrare"}</div>
          {doc === "factura" ? (
            <div className="space-y-px text-[11px] text-[#444]">
              <div>Metodă: {paymentMethodLabel(order.paymentMethod)}</div>
              {order.dueDate && <div>Termen de plată: {formatDate(order.dueDate)}</div>}
              <div>Achitat: {f2(order.paidAmount)} {cur}</div>
            </div>
          ) : (
            <div className="space-y-px text-[11px] text-[#444]">
              <div>{order.delivery?.label || "Ridicare din magazin"}</div>
              {(order.delivery?.city || order.delivery?.address) && <div>{[order.delivery.city, order.delivery.address].filter(Boolean).join(", ")}</div>}
              {order.delivery?.recipient && <div>Destinatar: {order.delivery.recipient} {order.delivery.phone}</div>}
              {order.delivery?.trackingNumber && <div>AWB: {order.delivery.trackingNumber}</div>}
            </div>
          )}
        </div>
      </section>

      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="border-y border-[#111] text-left text-[10.5px] uppercase tracking-wide text-[#444]">
            <th className="py-2 pr-2 font-semibold">Nr.</th>
            <th className="py-2 pr-2 font-semibold">Denumire</th>
            <th className="py-2 pr-2 font-semibold">U.M.</th>
            <th className="py-2 pr-2 text-right font-semibold">Cant.</th>
            {doc === "picking" ? (
              <>
                <th className="py-2 pr-2 font-semibold">Depozit</th>
                <th className="py-2 text-center font-semibold">✓</th>
              </>
            ) : (
              <>
                <th className="py-2 pr-2 text-right font-semibold">Preț</th>
                {lines.some((l) => l.discount) && <th className="py-2 pr-2 text-right font-semibold">Red.</th>}
                {vatPayer && doc === "factura" && <th className="py-2 pr-2 text-right font-semibold">TVA</th>}
                <th className="py-2 text-right font-semibold">Valoare</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-[#ddd] align-top">
              <td className="py-2 pr-2 text-[#666]">{i + 1}</td>
              <td className="py-2 pr-2">
                <div className="font-medium">{l.name}</div>
                {l.sku && <div className="text-[10.5px] text-[#777]">Cod: {l.sku}</div>}
              </td>
              <td className="py-2 pr-2">{l.unit}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{num(l.qty)}</td>
              {doc === "picking" ? (
                <>
                  <td className="py-2 pr-2">{l.warehouse}</td>
                  <td className="py-2 text-center">
                    <span aria-hidden className="inline-block h-3.5 w-3.5 border border-[#555]" />
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-2 text-right tabular-nums">{f2(l.price)}</td>
                  {lines.some((x) => x.discount) && <td className="py-2 pr-2 text-right tabular-nums">{l.discount ? `${num(l.discount)}%` : ""}</td>}
                  {vatPayer && doc === "factura" && <td className="py-2 pr-2 text-right tabular-nums">{f2(vatOf(l))}</td>}
                  <td className="py-2 text-right font-medium tabular-nums">{f2(l.total)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {doc !== "picking" && (
        <section className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-[12px]">
            {vatPayer && (
              <>
                <div className="flex justify-between text-[#444]">
                  <span>Valoare fără TVA</span>
                  <span className="tabular-nums">{f2(incl ? order.total - order.vatTotal : order.total - order.vatTotal)} {cur}</span>
                </div>
                <div className="flex justify-between text-[#444]">
                  <span>TVA {s.vatRate}%</span>
                  <span className="tabular-nums">{f2(order.vatTotal)} {cur}</span>
                </div>
              </>
            )}
            <div className="flex justify-between border-t-2 border-[#111] pt-1.5 text-[14px] font-bold">
              <span>Total de plată</span>
              <span className="tabular-nums">{f2(order.total)} {cur}</span>
            </div>
          </div>
        </section>
      )}

      {doc !== "picking" && (
        <p className="mt-3 text-[11.5px]">
          <span className="text-[#666]">Suma în litere: </span>
          <span className="font-medium first-letter:uppercase">{amountInWords(order.total, cur)}</span>
          {vatPayer ? `, inclusiv TVA ${f2(order.vatTotal)} ${cur}` : ""}.
        </p>
      )}

      {(order.note || (doc === "picking" && order.internalNote)) && (
        <div className="mt-4 rounded border border-[#ddd] p-2.5 text-[11.5px]">
          <span className="font-semibold">Observații: </span>
          {order.note}
          {doc === "picking" && order.internalNote ? ` ${order.internalNote}` : ""}
        </div>
      )}

      <section className="mt-10 grid grid-cols-2 gap-10 text-[11.5px]">
        <div>
          <div className="text-[#666]">{doc === "picking" ? "Pregătit de" : "Eliberat"}</div>
          <div className="mt-8 border-t border-[#999] pt-1 text-[10.5px] text-[#777]">{order.responsible?.name || "nume, semnătură"}</div>
        </div>
        <div>
          <div className="text-[#666]">{doc === "picking" ? "Verificat de" : "Primit"}</div>
          <div className="mt-8 border-t border-[#999] pt-1 text-[10.5px] text-[#777]">nume, semnătură, data</div>
        </div>
      </section>

      {doc !== "picking" && s.invoiceTerms && <p className="mt-6 text-[10.5px] text-[#666]">{s.invoiceTerms}</p>}
      <footer className="mt-6 border-t border-[#ddd] pt-2 text-[10px] text-[#888]">
        Generat de CRM {s.companyName} · {formatDateTime(new Date())}
        {doc === "factura" && !order.invoice?.number && " · Document informativ; factura fiscală se emite conform legislației (e-Factura)."}
      </footer>
    </div>
  );
}

function PrintInner({ id }) {
  const sp = useSearchParams();
  const doc = ["factura", "aviz", "picking"].includes(sp.get("doc")) ? sp.get("doc") : "factura";
  const { data: order, error } = useApi(`/api/orders/${id}`);
  const { data: settings } = useApi("/api/settings");
  useEffect(() => {
    if (order && settings) document.title = `${doc === "factura" ? "Factura" : doc === "aviz" ? "Aviz" : "Fisa"} ${order.number}`;
  }, [order, settings, doc]);
  if (error) return <p className="p-10 text-center text-[#c0312f]">{error.message}</p>;
  if (!order || !settings) return <p className="p-10 text-center text-[#888]">Se pregătește documentul…</p>;
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3 px-1">
        <button type="button" onClick={() => window.close()} className="text-[13px] text-[#555] hover:underline">
          Închide
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2457d4] px-4 text-[13.5px] font-medium text-white hover:bg-[#1c47b3]"
        >
          <Printer size={16} weight="bold" /> Tipărește / salvează PDF
        </button>
      </div>
      <Sheet order={order} s={settings} doc={doc} />
    </>
  );
}

export default function PrintOrder({ params }) {
  const { id } = use(params);
  return (
    <div className="min-h-dvh bg-[#eef0f3] py-6 print:bg-white print:py-0" data-theme="light" style={{ colorScheme: "light" }}>
      <Suspense>
        <PrintInner id={id} />
      </Suspense>
    </div>
  );
}
