"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, money, formatDateTime } from "@/lib/client";
import { Card, Badge, PageHeader, Empty } from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";
import { stageInfo } from "@/lib/orderStages";

function Stat({ label, value, icon, href, tone }) {
  const tones = {
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    violet: "bg-violet-50 text-violet-600",
  };
  const inner = (
    <Card className="p-5 transition-shadow hover:shadow-md hover:shadow-slate-200/60">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-bold tracking-tight text-slate-900">
            {value}
          </div>
          <div className="mt-1 text-sm text-slate-500">{label}</div>
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon name={icon} className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// Grafic cu bare verticale (vanzari pe zile)
function SalesChart({ data, currency }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <div className="flex h-40 items-end gap-1.5">
      {data.map((d, i) => {
        const h = (d.total / max) * 100;
        const day = d.date.slice(8, 10);
        return (
          <div
            key={i}
            className="group flex flex-1 flex-col items-center gap-1"
            title={`${d.date}: ${money(d.total, currency)}`}
          >
            <div className="flex h-32 w-full items-end">
              <div
                className="w-full rounded-t bg-indigo-500 transition-all group-hover:bg-indigo-600"
                style={{ height: `${Math.max(h, d.total > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

// Bare orizontale (top produse / stoc pe depozite)
function HBars({ items, valueLabel, color = "indigo", currency }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const colors = {
    indigo: "bg-indigo-500",
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
  };
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate text-slate-600">{it.name}</span>
            <span className="ml-2 shrink-0 font-medium text-slate-500">
              {valueLabel ? valueLabel(it.value) : it.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${colors[color]}`}
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const user = useUser();
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/stats").then(setS).catch((e) => setErr(e.message));
  }, []);

  if (err)
    return <div className="rounded-lg bg-rose-50 p-4 text-rose-600">{err}</div>;
  if (!s) return <div className="text-slate-400">Se incarca…</div>;

  return (
    <div>
      <PageHeader
        title={`Bun venit, ${user?.name?.split(" ")[0] || ""}`}
        subtitle="Privire de ansamblu asupra activitatii din magazin."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Asteapta aprobare"
          value={s.pendingOrders}
          icon="clock"
          tone="amber"
          href="/comenzi?status=pending_approval"
        />
        <Stat
          label="In procesare"
          value={s.inProgressOrders}
          icon="transfer"
          tone="indigo"
          href="/comenzi?status=processing"
        />
        <Stat
          label="Comenzi complete"
          value={s.completedOrders}
          icon="checkCircle"
          tone="emerald"
          href="/comenzi?status=completed"
        />
        <Stat
          label="Sarcini deschise"
          value={s.openTasks}
          icon="tasks"
          tone="violet"
          href="/sarcini"
        />
      </div>

      {/* Grafice */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold text-slate-800">
            Vanzari — ultimele 14 zile
          </h2>
          {s.salesByDay?.some((d) => d.total > 0) ? (
            <SalesChart data={s.salesByDay} currency={s.currency} />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              Nicio vanzare in ultimele 14 zile.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-slate-800">Top produse</h2>
          {s.topProducts?.length ? (
            <HBars
              items={s.topProducts.map((p) => ({ name: p.name, value: p.qty }))}
              color="violet"
            />
          ) : (
            <p className="text-sm text-slate-400">Inca nu exista vanzari.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Comenzi recente</h2>
            <Link
              href="/comenzi"
              className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Vezi toate
              <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          </div>
          {s.recentOrders.length === 0 ? (
            <Empty>Nu exista comenzi inca.</Empty>
          ) : (
            <div className="divide-y divide-slate-50">
              {s.recentOrders.map((o) => (
                <Link
                  key={o._id}
                  href="/comenzi"
                  className="-mx-2 flex items-center justify-between rounded-lg px-2 py-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                      <Icon name="receipt" className="h-[18px] w-[18px]" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-700">
                        {o.number}
                      </div>
                      <div className="text-xs text-slate-400">
                        {o.responsible?.name || "—"} ·{" "}
                        {formatDateTime(o.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">
                      {money(o.total, s.currency)}
                    </span>
                    <Badge color={stageInfo(o.status).color}>
                      {stageInfo(o.status).short}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon name="wallet" className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-medium text-slate-500">
                Valoare stoc total
              </h2>
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              {money(s.inventoryValue, s.currency)}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {s.warehouseCount} depozite active
            </div>
            {s.stockByWarehouse?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <HBars
                  items={s.stockByWarehouse}
                  color="emerald"
                  valueLabel={(v) => money(v, s.currency)}
                />
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Icon name="alert" className="h-5 w-5" />
              </span>
              <h2 className="font-semibold text-slate-800">Stoc scazut</h2>
            </div>
            {s.lowStock.length === 0 ? (
              <p className="text-sm text-slate-400">
                Toate produsele au stoc suficient.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {s.lowStock.map((p) => (
                  <li
                    key={p._id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-600">{p.name}</span>
                    <Badge color={p.total === 0 ? "red" : "yellow"}>
                      {p.total} {p.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
