"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, money, formatDate, UNIT_LABELS } from "@/lib/client";
import { Icon } from "@/app/_components/icons";

export default function InvoicePage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    Promise.all([apiGet(`/api/orders/${id}`), apiGet("/api/settings")])
      .then(([o, s]) => {
        setOrder(o);
        setSettings(s);
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err)
    return (
      <div className="mx-auto max-w-2xl p-8 text-rose-600">Eroare: {err}</div>
    );
  if (!order || !settings)
    return <div className="p-8 text-slate-400">Se incarca…</div>;

  const currency = settings.currency || "MDL";

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Bara de actiuni — ascunsa la print */}
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
        >
          <Icon name="arrowRight" className="h-4 w-4 rotate-180" />
          Inapoi
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Icon name="printer" className="h-4 w-4" />
          Print / Salveaza PDF
        </button>
      </div>

      {/* Foaia de factura */}
      <div className="mx-auto max-w-3xl bg-white p-10 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <div className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <Icon name="droplet" className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <div>
              <div className="text-lg font-bold text-slate-900">
                {settings.companyName || "CRM Lux Store"}
              </div>
              <div className="text-xs text-slate-500">
                Produse chimice auto & spalatorii self-wash
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tracking-tight text-slate-900">
              FACTURA
            </div>
            <div className="mt-1 text-sm font-medium text-indigo-600">
              {order.number}
            </div>
            <div className="text-xs text-slate-400">
              {formatDate(order.createdAt)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Client
            </div>
            <div className="font-medium text-slate-800">
              {order.customerName || "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Responsabil
            </div>
            <div className="font-medium text-slate-800">
              {order.responsible?.name || "—"}
            </div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2.5 pr-2">#</th>
              <th className="py-2.5 pr-2">Produs</th>
              <th className="py-2.5 pr-2 text-right">Cant.</th>
              <th className="py-2.5 pr-2 text-right">Pret unitar</th>
              <th className="py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {order.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2.5 pr-2 text-slate-400">{i + 1}</td>
                <td className="py-2.5 pr-2 text-slate-800">{it.productName}</td>
                <td className="py-2.5 pr-2 text-right text-slate-600">
                  {it.quantity} {UNIT_LABELS[it.unit]}
                </td>
                <td className="py-2.5 pr-2 text-right text-slate-600">
                  {money(it.unitPrice, currency)}
                </td>
                <td className="py-2.5 text-right font-medium text-slate-800">
                  {money(it.lineTotal, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex items-center justify-between border-t-2 border-slate-800 pt-3 text-base font-bold text-slate-900">
              <span>TOTAL</span>
              <span>{money(order.total, currency)}</span>
            </div>
          </div>
        </div>

        {order.note && (
          <div className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Observatii: </span>
            {order.note}
          </div>
        )}

        <div className="mt-10 border-t border-slate-100 pt-4 text-center text-xs text-slate-400">
          Document generat de {settings.companyName || "CRM Lux Store"} ·{" "}
          {formatDate(order.createdAt)}
        </div>
      </div>
    </div>
  );
}
