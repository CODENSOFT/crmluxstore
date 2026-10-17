"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { money, num, relativeTime, formatDateTime } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/constants";
import { Card, PageHeader, Button, Tabs, EmptyState, Skeleton, cx, StageBadge } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { Bell, Check, Trash, Receipt, Globe, Warning, CheckSquareOffset, PlugsConnected, PencilSimple, Clock, CheckCircle, Info } from "@/app/_components/icons";

const TYPE = {
  order_approval: { icon: Clock, tone: "bg-warn-soft text-warn" },
  order_decision: { icon: CheckCircle, tone: "bg-ok-soft text-ok" },
  order_new: { icon: Receipt, tone: "bg-accent-soft text-accent" },
  order_assigned: { icon: Receipt, tone: "bg-accent-soft text-accent" },
  order_edit: { icon: PencilSimple, tone: "bg-warn-soft text-warn" },
  site_order: { icon: Globe, tone: "bg-accent-soft text-accent" },
  task_assigned: { icon: CheckSquareOffset, tone: "bg-violet-soft text-violet" },
  low_stock: { icon: Warning, tone: "bg-bad-soft text-bad" },
  integration: { icon: PlugsConnected, tone: "bg-bad-soft text-bad" },
  payment: { icon: CheckCircle, tone: "bg-ok-soft text-ok" },
  system: { icon: Info, tone: "bg-surface-2 text-fg-2" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("0");
  const { data, loading, reload, mutate } = useApi(`/api/notifications?read=${tab}&limit=200`);

  const open = async (n) => {
    if (!n.read) {
      await apiPatch(`/api/notifications/${n._id}`, { read: true }).catch(() => {});
      invalidate("/api/me");
    }
    router.push(n.link || (n.order ? `/comenzi/${n.order._id || n.order}` : "/"));
  };
  const markAll = async () => {
    await apiPost("/api/notifications", {});
    invalidate("/api/me", "/api/notifications");
    reload();
    toast("Toate notificările au fost marcate ca citite");
  };
  const clearRead = async () => {
    const r = await apiDelete("/api/notifications");
    reload();
    toast(`${r.deleted} notificări șterse`);
  };
  const toggle = async (n) => {
    await apiPatch(`/api/notifications/${n._id}`, { read: !n.read });
    mutate((d) => ({ ...d, items: d.items.filter((x) => x._id !== n._id) }));
    invalidate("/api/me");
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="Notificări"
        description="Comenzi de aprobat, comenzi noi de pe site, sarcini atribuite, stoc critic și erori de sincronizare."
        actions={
          tab === "0" ? (
            <Button icon={Check} onClick={markAll} disabled={!data?.items?.length}>
              Marchează toate citite
            </Button>
          ) : (
            <Button variant="danger-ghost" icon={Trash} onClick={clearRead} disabled={!data?.items?.length}>
              Golește istoricul
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        <div className="px-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { key: "0", label: "Necitite", count: data && tab === "0" ? data.items.length : data?.unread },
              { key: "1", label: "Citite" },
            ]}
          />
        </div>
        {loading && !data ? (
          <div className="space-y-2 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : !data?.items?.length ? (
          <EmptyState icon={Bell} title={tab === "0" ? "Nicio notificare nouă" : "Istoric gol"} description={tab === "0" ? "Sunteți la zi." : "Notificările citite se păstrează 90 de zile."} />
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((n) => {
              const t = TYPE[n.type] || TYPE.system;
              const IconC = t.icon;
              return (
                <li key={n._id} className={cx("group flex gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2/60", !n.read && "bg-accent-soft/30")}>
                  <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", t.tone)}>
                    <IconC size={18} />
                  </span>
                  <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("text-[13.5px]", n.read ? "text-fg-2" : "font-semibold text-fg")}>{n.title}</span>
                      {n.order?.status && <StageBadge status={n.order.status} short />}
                    </div>
                    {n.message && <p className="mt-0.5 text-[13px] text-fg-3">{n.message}</p>}
                    {n.meta?.items?.length > 0 && (
                      <p className="mt-1.5 truncate text-[12.5px] text-fg-3">
                        {n.meta.items.slice(0, 4).map((i) => `${i.name} × ${num(i.quantity)} ${UNIT_LABELS[i.unit] || ""}`).join(" · ")}
                        {n.meta.total ? ` — ${money(n.meta.total)}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[12px] text-fg-4" title={formatDateTime(n.createdAt)}>{relativeTime(n.createdAt)}</p>
                  </button>
                  <button type="button" onClick={() => toggle(n)} className="self-start rounded-md px-2 py-1 text-[12px] font-medium text-fg-3 opacity-0 transition-opacity hover:bg-surface-3 hover:text-fg group-hover:opacity-100 focus:opacity-100">
                    {n.read ? "Necitită" : "Citită"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
