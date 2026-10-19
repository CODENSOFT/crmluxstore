"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, moneyShort, formatDateShort, relativeTime, num, pct, formatDate, plural } from "@/lib/format";
import { channelLabel, UNIT_LABELS, TASK_PRIORITY } from "@/lib/constants";
import { Card, CardHeader, Stat, PageHeader, ButtonLink, StageBadge, Badge, Skeleton, EmptyState, cx, Segmented, PaymentBadge } from "@/app/_components/ui";
import { AreaChart, BarList, ColumnChart } from "@/app/_components/charts";
import {
  Plus, TrayArrowDown, Receipt, Coins, ChartLineUp, Wallet, Globe, Clock, PencilSimple, Warning, CheckSquareOffset,
  ArrowRight, Package, UsersThree, Stack,
} from "@/app/_components/icons";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("ro-RO", { hour: "numeric", hour12: false, timeZone: "Europe/Chisinau" }).format(new Date()));
  if (h < 11) return "Bună dimineața";
  if (h < 18) return "Bună ziua";
  return "Bună seara";
}

function AttentionItem({ href, icon: IconC, tone, title, text }) {
  const tones = { warn: "bg-warn-soft text-warn", accent: "bg-accent-soft text-accent", bad: "bg-bad-soft text-bad", violet: "bg-violet-soft text-violet" };
  return (
    <Link href={href} className="group flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-xs transition-colors hover:border-line-strong">
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
        <IconC size={18} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-fg">{title}</span>
        <span className="block truncate text-[12.5px] text-fg-3">{text}</span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-fg-4 transition-transform group-hover:translate-x-0.5 group-hover:text-fg-2" />
    </Link>
  );
}

export default function Dashboard() {
  const user = useUser();
  const { data: d, loading } = useApi("/api/dashboard", { refreshInterval: 60000 });
  const [metric, setMetric] = useState("revenue");
  const cur = d?.currency || "MDL";

  const chart = useMemo(
    () =>
      (d?.chart || []).map((p) => ({
        label: formatDateShort(p.date + "T12:00:00"),
        tooltipLabel: formatDate(p.date + "T12:00:00"),
        value: metric === "revenue" ? p.revenue : p.orders,
        sub: metric === "revenue" ? `${p.orders} comenzi` : money(p.revenue, cur),
      })),
    [d, metric, cur]
  );

  const delta =
    d && d.prevMonth.revenue > 0 ? ((d.month.revenue - d.prevMonth.revenue) / d.prevMonth.revenue) * 100 : null;
  const marginPct = d && d.month.items > 0 ? (d.month.profit / d.month.items) * 100 : 0;
  const isAdmin = user.role === "admin";
  const approver = can(user, "orders.approve");
  const reports = can(user, "reports.view");
  const firstName = user.name.split(" ")[0];

  const attention = [];
  if (d?.counts.siteNew) attention.push({ href: "/comenzi?status=new&channel=site", icon: Globe, tone: "accent", title: `${plural(d.counts.siteNew, "comandă nouă", "comenzi noi", "de comenzi noi")} de pe site`, text: "Confirmați telefonic și treceți-le în pregătire" });
  if (approver && d?.counts.pending_approval) attention.push({ href: "/comenzi?status=pending_approval", icon: Clock, tone: "warn", title: `${d.counts.pending_approval} așteaptă aprobarea ta`, text: "Comenzi create de angajați" });
  if (d && d.counts.new - d.counts.siteNew > 0) attention.push({ href: "/comenzi?status=new", icon: Receipt, tone: "violet", title: `${d.counts.new - d.counts.siteNew} comenzi noi (ciorne)`, text: "Neconfirmate încă" });
  if (d?.lowStock.count) attention.push({ href: "/stoc?tab=reorder", icon: Warning, tone: "bad", title: `${plural(d.lowStock.count, "produs", "produse", "de produse")} sub stocul minim`, text: "Vezi lista de reaprovizionare" });
  if (d?.overdueTasks) attention.push({ href: "/sarcini", icon: CheckSquareOffset, tone: "bad", title: `${plural(d.overdueTasks, "sarcină întârziată", "sarcini întârziate", "de sarcini întârziate")}`, text: "Termenul a trecut" });

  return (
    <div className="animate-in">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          isAdmin
            ? "Situația magazinului pe scurt — vânzări, comenzi de procesat, încasări și stoc."
            : "Comenzile, clienții și sarcinile tale."
        }
        actions={
          <>
            <ButtonLink href="/receptie/nou" icon={TrayArrowDown} variant="secondary">
              Recepție
            </ButtonLink>
            <ButtonLink href="/comenzi/nou" icon={Plus} variant="primary">
              Comandă nouă
            </ButtonLink>
          </>
        }
      />

      {attention.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          {attention.map((a) => (
            <AttentionItem key={a.href} {...a} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Vânzări azi"
          icon={Receipt}
          loading={loading && !d}
          value={moneyShort(d?.today.revenue, cur)}
          sub={d ? `${d.today.orders} comenzi` : null}
          href="/comenzi"
        />
        <Stat
          label="Vânzări luna aceasta"
          icon={ChartLineUp}
          loading={loading && !d}
          value={moneyShort(d?.month.revenue, cur)}
          delta={delta}
          sub={d ? `vs. aceeași perioadă luna trecută · ${d.month.orders} comenzi` : null}
          href={reports ? "/rapoarte" : undefined}
        />
        <Stat
          label="Marjă brută (luna)"
          icon={Coins}
          loading={loading && !d}
          value={moneyShort(d?.month.profit, cur)}
          sub={d ? `${pct(marginPct)} din vânzări · bon mediu ${moneyShort(d.month.avg, cur)}` : null}
        />
        <Stat
          label="De încasat"
          icon={Wallet}
          tone={d?.debt.overdue > 0 ? "bad" : undefined}
          loading={loading && !d}
          value={moneyShort(d?.debt.amount, cur)}
          sub={d ? (d.debt.overdue > 0 ? `${moneyShort(d.debt.overdue, cur)} cu termen depășit` : `${d.debt.orders} comenzi neachitate`) : null}
          href={reports ? "/rapoarte?tab=debts" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Vânzări în ultimele 30 de zile"
            description={metric === "revenue" ? "Valoarea comenzilor confirmate, pe zile" : "Numărul de comenzi confirmate, pe zile"}
            action={
              <Segmented
                size="sm"
                value={metric}
                onChange={setMetric}
                options={[
                  { value: "revenue", label: "Valoare" },
                  { value: "orders", label: "Comenzi" },
                ]}
              />
            }
          />
          <div className="px-3 pb-3">
            {loading && !d ? (
              <Skeleton className="mx-2 h-[220px]" />
            ) : metric === "revenue" ? (
              <AreaChart data={chart} format={(v) => money(v, cur)} ariaLabel="Vânzări pe zile" />
            ) : (
              <ColumnChart data={chart} format={(v) => `${v} comenzi`} ariaLabel="Comenzi pe zile" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Canale de vânzare" description="Luna curentă, după valoare" />
          <div className="px-5 pb-5">
            {loading && !d ? (
              <Skeleton className="h-40" />
            ) : (
              <BarList
                items={(d?.byChannel || []).map((c) => ({ key: c._id, label: channelLabel(c._id), value: c.revenue, sub: `${c.orders}` }))}
                format={(v) => moneyShort(v, cur)}
              />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Cele mai vândute produse" description="Luna curentă" icon={Package} action={reports && <Link href="/rapoarte?tab=products" className="text-[12.5px] font-medium text-accent hover:underline">Raport</Link>} />
          <div className="px-5 pb-5">
            {loading && !d ? (
              <Skeleton className="h-40" />
            ) : (
              <BarList
                items={(d?.topProducts || []).map((p) => ({ key: p._id, label: p.name, value: p.revenue, sub: `${num(p.qty)} ${UNIT_LABELS[p.unit] || ""}` }))}
                format={(v) => moneyShort(v, cur)}
              />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Clienți de top" description="Luna curentă" icon={UsersThree} action={<Link href="/clienti?sort=-spent" className="text-[12.5px] font-medium text-accent hover:underline">Toți</Link>} />
          <ul className="divide-y divide-line px-2 pb-2">
            {loading && !d && <Skeleton className="mx-3 mb-3 h-40" />}
            {d && d.topCustomers.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-fg-3">Nicio vânzare către clienți înregistrați luna aceasta.</p>}
            {d?.topCustomers.map((c, i) => (
              <li key={c._id}>
                <Link href={`/clienti/${c._id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                  <span className="tnum w-4 text-[12px] font-medium text-fg-4">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{c.name}</span>
                  <span className="tnum text-[12.5px] text-fg-3">{c.orders} cmd.</span>
                  <span className="tnum w-24 text-right text-[13px] font-medium text-fg">{moneyShort(c.revenue, cur)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader
            title="Stoc critic"
            description={d ? `Valoare stoc: ${moneyShort(d.stock.value, cur)} (cost ${moneyShort(d.stock.cost, cur)})` : "Produse sub pragul minim"}
            icon={Stack}
            action={<Link href="/stoc?tab=reorder" className="text-[12.5px] font-medium text-accent hover:underline">De comandat</Link>}
          />
          <ul className="divide-y divide-line px-2 pb-2">
            {loading && !d && <Skeleton className="mx-3 mb-3 h-40" />}
            {d && d.lowStock.items.length === 0 && (
              <EmptyState compact icon={Stack} title="Stocul e în regulă" description="Niciun produs activ nu e sub pragul minim." />
            )}
            {d?.lowStock.items.map((p) => (
              <li key={p._id}>
                <Link href={`/produse/${p._id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-2">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", p.total <= 0 ? "bg-bad" : "bg-warn")} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{p.name}</span>
                  <span className={cx("tnum text-[13px] font-medium", p.total <= 0 ? "text-bad" : "text-warn")}>
                    {num(p.total)} {UNIT_LABELS[p.unit] || ""}
                  </span>
                  <span className="tnum w-16 text-right text-[12px] text-fg-4">min {num(p.limit)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Comenzi recente" action={<Link href="/comenzi" className="text-[12.5px] font-medium text-accent hover:underline">Toate comenzile</Link>} />
          {loading && !d ? (
            <Skeleton className="mx-5 mb-5 h-48" />
          ) : d?.recentOrders.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {d.recentOrders.map((o) => (
                <li key={o._id}>
                  <Link href={`/comenzi/${o._id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13.5px] font-medium text-fg">{o.number}</span>
                        <span className="text-[12px] text-fg-4">{channelLabel(o.channel)}</span>
                      </span>
                      <span className="block truncate text-[12.5px] text-fg-3">
                        {o.customerName || "Fără client"} · {relativeTime(o.createdAt)}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <PaymentBadge status={o.paymentStatus} />
                    </span>
                    <StageBadge status={o.status} short />
                    <span className="tnum w-28 text-right text-[13.5px] font-medium text-fg">{money(o.total, cur)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Receipt}
              title="Încă nu există comenzi"
              description="Creați prima comandă sau conectați site-ul din Integrări."
              action={
                <ButtonLink href="/comenzi/nou" variant="primary" icon={Plus} size="sm">
                  Comandă nouă
                </ButtonLink>
              }
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Sarcinile mele" icon={CheckSquareOffset} action={<Link href="/sarcini" className="text-[12.5px] font-medium text-accent hover:underline">Toate</Link>} />
          {d && d.tasks.length === 0 ? (
            <EmptyState compact icon={CheckSquareOffset} title="Nicio sarcină deschisă" description="Sarcinile atribuite ție apar aici." />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {d?.tasks.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate) < new Date(new Date().toDateString());
                const pr = TASK_PRIORITY.find((p) => p.key === t.priority);
                return (
                  <li key={t._id}>
                    <Link href="/sarcini" className="flex items-start gap-3 px-5 py-3 hover:bg-surface-2/70">
                      <PencilSimple size={15} className="mt-0.5 shrink-0 text-fg-4" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-fg">{t.title}</span>
                        <span className={cx("block text-[12px]", overdue ? "font-medium text-bad" : "text-fg-3")}>
                          {t.dueDate ? `${overdue ? "Întârziată · " : ""}${formatDate(t.dueDate)}` : "Fără termen"}
                        </span>
                      </span>
                      {t.priority === "high" && <Badge tone={pr?.tone}>{pr?.label}</Badge>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
