"use client";

import Link from "@/app/_components/link";
import { useState } from "react";
import { useApi, invalidate } from "@/lib/useApi";
import { apiPatch } from "@/lib/client";
import { useUser } from "@/app/_components/user";
import { useToast } from "@/app/_components/overlay";
import { money, relativeTime, num, formatDate, plural } from "@/lib/format";
import { channelLabel, UNIT_LABELS, TASK_PRIORITY } from "@/lib/constants";
import { Card, CardHeader, PageHeader, ButtonLink, Badge, Skeleton, EmptyState, ErrorState, cx } from "@/app/_components/ui";
import {
  Plus, TrayArrowDown, Receipt, Clock, Warning, CheckSquareOffset, ArrowRight, Package, Prohibit, Truck, Timer, Circle,
  Play, Check, CheckCircle, ClipboardText, CalendarBlank, Sparkle, UsersThree,
} from "@/app/_components/icons";

// Panoul: doar ce trebuie facut acum (sarcini, comenzi, stoc), pe drepturile contului.
// Statisticile (vanzari, marje, top) sunt in Rapoarte.

function greeting() {
  const h = Number(new Intl.DateTimeFormat("ro-RO", { hour: "numeric", hour12: false, timeZone: "Europe/Chisinau" }).format(new Date()));
  if (h < 11) return "Bună dimineața";
  if (h < 18) return "Bună ziua";
  return "Bună seara";
}

const TONES = {
  bad: "border-bad/50 bg-bad-soft text-bad",
  warn: "border-warn/50 bg-warn-soft text-warn",
  accent: "border-accent/50 bg-accent-soft text-accent",
  violet: "border-violet/50 bg-violet-soft text-violet",
};

// Contor de actiune: colorat cand e ceva de facut, discret cand e 0
function ActionTile({ href, icon: IconC, label, count, tone, sub, loading }) {
  const active = count > 0;
  return (
    <Link
      href={href}
      className={cx(
        "group flex min-w-0 items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        active ? TONES[tone] : "border-line bg-surface text-fg-4 hover:border-line-strong"
      )}
    >
      <IconC size={20} weight={active ? "fill" : "regular"} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={cx("tnum block text-[20px] font-semibold leading-tight", active ? "" : "text-fg-3")}>{loading ? "…" : num(count || 0)}</span>
        <span className={cx("block text-[12.5px] leading-tight", active ? "font-medium text-fg" : "text-fg-3")}>{label}</span>
        {sub && active && <span className="block truncate text-[11.5px] text-fg-3">{sub}</span>}
      </span>
      <ArrowRight size={14} className="shrink-0 opacity-40 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80" />
    </Link>
  );
}

function dueInfo(due) {
  if (!due) return { text: "Fără termen", tone: "text-fg-4" };
  const d = new Date(due);
  const today = new Date(new Date().toDateString());
  const days = Math.round((new Date(d.toDateString()) - today) / 86400000);
  if (days < 0) return { text: `Întârziată · ${formatDate(due)}`, tone: "font-medium text-bad" };
  if (days === 0) return { text: "Azi", tone: "font-medium text-accent" };
  if (days === 1) return { text: "Mâine", tone: "text-fg-2" };
  return { text: formatDate(due), tone: "text-fg-3" };
}

const TASK_ICON = { todo: Circle, in_progress: Timer };

function MyTasks({ d, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const move = async (t, status) => {
    setBusy(t._id);
    try {
      await apiPatch(`/api/tasks/${t._id}`, { status });
      invalidate("/api/tasks", "/api/me");
      await reload();
      if (status === "done") toast("Sarcina a fost finalizată");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const items = d?.tasks.items || [];
  return (
    <Card>
      <CardHeader
        title="Sarcinile mele"
        icon={CheckSquareOffset}
        description={d ? (d.tasks.open ? `${plural(d.tasks.open, "sarcină deschisă", "sarcini deschise", "de sarcini deschise")}` : "Nimic de făcut") : null}
        action={<Link href="/sarcini" className="text-[12.5px] font-medium text-accent hover:underline">Toate</Link>}
      />
      {!d ? (
        <Skeleton className="mx-5 mb-5 h-40" />
      ) : items.length === 0 ? (
        <EmptyState compact icon={Sparkle} title="Nicio sarcină deschisă" description="Sarcinile atribuite ție apar aici." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((t) => {
            const due = dueInfo(t.dueDate);
            const pr = TASK_PRIORITY.find((p) => p.key === t.priority);
            const IconC = TASK_ICON[t.status] || Circle;
            const next = t.status === "todo" ? { key: "in_progress", label: "Începe", icon: Play } : { key: "done", label: "Finalizează", icon: Check };
            return (
              <li key={t._id} className="flex items-start gap-3 px-5 py-3">
                <IconC size={17} className={cx("mt-0.5 shrink-0", t.status === "in_progress" ? "text-accent" : "text-fg-4")} />
                <Link href={`/sarcini/${t._id}`} className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-snug text-fg">{t.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                    <span className={cx("inline-flex items-center gap-1", due.tone)}>
                      <CalendarBlank size={12} />
                      {due.text}
                    </span>
                    {t.priority === "high" && <Badge tone={pr?.tone}>{pr?.label}</Badge>}
                    {t.customerName && <span className="truncate text-fg-3">· {t.customerName}</span>}
                  </span>
                </Link>
                <button
                  type="button"
                  disabled={busy === t._id}
                  onClick={() => move(t, next.key)}
                  className={cx(
                    "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors disabled:opacity-50",
                    next.key === "done" ? "text-ok ring-ok/40 hover:bg-ok-soft" : "text-accent ring-accent/40 hover:bg-accent-soft"
                  )}
                >
                  <next.icon size={13} weight="bold" />
                  {next.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TeamOverdue({ team }) {
  if (!team?.count) return null;
  return (
    <Card>
      <CardHeader
        title="Întârziate în echipă"
        icon={UsersThree}
        description={plural(team.count, "sarcină cu termenul depășit", "sarcini cu termenul depășit", "de sarcini cu termenul depășit")}
        action={<Link href="/sarcini" className="text-[12.5px] font-medium text-accent hover:underline">Toate</Link>}
      />
      <ul className="divide-y divide-line border-t border-line">
        {team.items.map((t) => (
          <li key={t._id}>
            <Link href={`/sarcini/${t._id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/70">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-fg">{t.title}</span>
                <span className="block text-[12px] text-fg-3">
                  {t.assignee} · <span className="font-medium text-bad">{formatDate(t.dueDate)}</span>
                </span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-fg-4" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function OrderRow({ o, cur, by }) {
  return (
    <li>
      <Link href={`/comenzi/${o._id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/70">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2">
            <span className="text-[13.5px] font-medium text-fg">{o.number}</span>
            {o.channel && <span className="text-[12px] text-fg-4">{channelLabel(o.channel)}</span>}
          </span>
          <span className="block truncate text-[12.5px] text-fg-3">
            {o.customerName || "Fără client"}
            {o.customerPhone ? ` · ${o.customerPhone}` : ""}
            {by ? ` · de la ${by}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="tnum block text-[13.5px] font-medium text-fg">{money(o.total, cur)}</span>
          <span className="inline-flex items-center gap-1 text-[11.5px] text-fg-4">
            <Clock size={11} />
            {relativeTime(o.createdAt)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function Orders({ d }) {
  const approver = d?.can.approve;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Comenzi noi de preluat"
          icon={Receipt}
          description="Cele care așteaptă de cel mai mult timp — primele"
          action={<Link href="/comenzi?status=new" className="text-[12.5px] font-medium text-accent hover:underline">Toate</Link>}
        />
        {!d ? (
          <Skeleton className="mx-5 mb-5 h-40" />
        ) : d.newOrders.length === 0 ? (
          <EmptyState compact icon={CheckCircle} title="Nicio comandă nouă" description="Comenzile noi de pe site, din bot sau din magazin apar aici." />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {d.newOrders.map((o) => (
              <OrderRow key={o._id} o={o} />
            ))}
          </ul>
        )}
      </Card>
      {d?.approval.length > 0 && (
        <Card>
          <CardHeader
            title={approver ? "Așteaptă aprobarea ta" : "Comenzile tale la aprobare"}
            icon={Clock}
            description={approver ? "Comenzi create de angajați" : "Le aprobă administratorul"}
            action={<Link href="/comenzi?status=pending_approval" className="text-[12.5px] font-medium text-accent hover:underline">Toate</Link>}
          />
          <ul className="divide-y divide-line border-t border-line">
            {d.approval.map((o) => (
              <OrderRow key={o._id} o={o} by={approver ? o.createdByName : null} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function StockList({ title, icon: IconC, tone, list, empty }) {
  return (
    <div className="min-w-0">
      <div className={cx("mb-1 flex items-center gap-2 px-5 text-[13px] font-semibold", tone === "bad" ? "text-bad" : "text-warn")}>
        <IconC size={15} weight="bold" />
        {title}
        <span className="tnum rounded-md bg-surface-3 px-1.5 text-[11.5px] text-fg-2">{list.count}</span>
      </div>
      {list.items.length === 0 ? (
        <p className="px-5 py-4 text-[12.5px] text-fg-4">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.items.map((p) => (
            <li key={p._id}>
              <Link href={`/produse/${p._id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/70">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{p.name}</span>
                  <span className="block truncate text-[12px] text-fg-3">
                    {p.sku ? `${p.sku} · ` : ""}în stoc {num(p.total)} {UNIT_LABELS[p.unit] || ""} · minim {num(p.limit)}
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-[12px] font-medium text-fg-2" title="Cantitate sugerată de comandat">
                  +{num(p.suggested)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.count > list.items.length && <p className="px-5 pt-1 text-[12px] text-fg-4">și încă {list.count - list.items.length}…</p>}
    </div>
  );
}

function Stock({ d }) {
  const total = (d?.stock.out.count || 0) + (d?.stock.low.count || 0);
  return (
    <Card>
      <CardHeader
        title="Stoc de suplinit"
        icon={Package}
        description={d ? (total ? "Produse epuizate sau sub stocul minim · cifra din dreapta = cât să comandați" : "Toate produsele sunt peste stocul minim") : null}
        action={
          <div className="flex items-center gap-3">
            <Link href="/stoc?tab=reorder" className="text-[12.5px] font-medium text-accent hover:underline">Lista de comandat</Link>
          </div>
        }
      />
      {!d ? (
        <Skeleton className="mx-5 mb-5 h-40" />
      ) : total === 0 ? (
        <EmptyState compact icon={CheckCircle} title="Stocul e în regulă" description="Niciun produs activ nu e epuizat sau sub pragul minim." />
      ) : (
        <div className="grid gap-4 border-t border-line pb-4 pt-3 lg:grid-cols-2">
          <StockList title="Fără stoc" icon={Prohibit} tone="bad" list={d.stock.out} empty="Niciun produs epuizat." />
          <StockList title="Sub stocul minim" icon={Warning} tone="warn" list={d.stock.low} empty="Niciun produs sub minim." />
        </div>
      )}
      {d && total > 0 && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          <ButtonLink href="/receptie/nou" icon={TrayArrowDown} size="sm">
            Recepție marfă
          </ButtonLink>
        </div>
      )}
    </Card>
  );
}

function Inventories({ list }) {
  if (!list?.length) return null;
  return (
    <Card>
      <CardHeader title="Inventarieri neterminate" icon={ClipboardText} description="Numărați produsele rămase și finalizați fișa" />
      <ul className="divide-y divide-line border-t border-line">
        {list.map((i) => (
          <li key={i._id}>
            <Link href={`/inventariere/${i._id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/70">
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium text-fg">{i.number}</span>
                <span className="block truncate text-[12px] text-fg-3">
                  {i.warehouseName} · {plural(i.lines, "produs", "produse", "de produse")} · începută {relativeTime(i.createdAt)}
                </span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-fg-4" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Dashboard() {
  const user = useUser();
  const { data: d, loading, error, reload } = useApi("/api/dashboard", { refreshInterval: 60000 });
  const firstName = user.name.split(" ")[0];
  const c = d?.counts || {};
  const wait = loading && !d;

  const tiles = [
    { key: "overdue", href: "/sarcini", icon: Warning, label: "Sarcini întârziate", count: d?.tasks.overdue, tone: "bad" },
    { key: "today", href: "/sarcini", icon: CheckSquareOffset, label: "Sarcini pentru azi", count: d?.tasks.today, tone: "accent" },
    { key: "new", href: "/comenzi?status=new", icon: Receipt, label: "Comenzi noi", count: c.new, tone: "accent" },
    (d?.can.approve || c.pending_approval > 0) && {
      key: "approval",
      href: "/comenzi?status=pending_approval",
      icon: Clock,
      label: d?.can.approve ? "De aprobat" : "La aprobare",
      count: c.pending_approval,
      tone: "warn",
    },
    { key: "processing", href: "/comenzi?status=processing", icon: Package, label: "De pregătit", count: c.processing, tone: "violet" },
    { key: "ready", href: "/comenzi?status=ready", icon: Truck, label: "De livrat", count: (c.ready || 0) + (c.invoicing || 0), tone: "violet", sub: c.invoicing ? `${c.invoicing} în livrare` : null },
    { key: "out", href: "/stoc?status=out", icon: Prohibit, label: "Fără stoc", count: d?.stock.out.count, tone: "bad" },
    { key: "low", href: "/stoc?tab=reorder", icon: Warning, label: "Stoc mic", count: d?.stock.low.count, tone: "warn" },
  ].filter(Boolean);

  const nothing = d && tiles.every((t) => !t.count) && !d.inventories?.length;

  return (
    <div className="animate-in">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={nothing ? "Nimic urgent acum — totul e la zi." : "Ce ai de făcut: sarcini, comenzi și stoc."}
        actions={
          <>
            <ButtonLink href="/sarcini/nou" icon={CheckSquareOffset} variant="secondary">
              Sarcină
            </ButtonLink>
            <ButtonLink href="/receptie/nou" icon={TrayArrowDown} variant="secondary">
              Recepție
            </ButtonLink>
            <ButtonLink href="/comenzi/nou" icon={Plus} variant="primary">
              Comandă nouă
            </ButtonLink>
          </>
        }
      />

      {error && !d && (
        <Card className="mb-4">
          <ErrorState error={error} onRetry={reload} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map(({ key, ...t }) => (
          <ActionTile key={key} {...t} loading={wait} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <MyTasks d={d} reload={reload} />
          <TeamOverdue team={d?.teamOverdue} />
        </div>
        <Orders d={d} />
      </div>

      <div className="mt-4 space-y-4">
        <Stock d={d} />
        <Inventories list={d?.inventories} />
      </div>

    </div>
  );
}
