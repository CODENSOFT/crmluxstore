"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, money, formatDateTime, UNIT_LABELS } from "@/lib/client";
import {
  Button,
  Card,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

function typeStyle(type) {
  if (type === "order_decision")
    return { icon: "checkCircle", tone: "bg-emerald-50 text-emerald-600" };
  if (type === "order_assigned")
    return { icon: "receipt", tone: "bg-indigo-50 text-indigo-600" };
  if (type === "order_edit")
    return { icon: "edit", tone: "bg-violet-50 text-violet-600" };
  return { icon: "clock", tone: "bg-amber-50 text-amber-600" }; // approval / new
}

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("current");
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const read = tab === "current" ? "0" : "1";
      const d = await apiGet(`/api/notifications?read=${read}`);
      setItems(d.items);
      setUnread(d.unread);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    await apiPost("/api/notifications", {}).catch(() => {});
    toast("Toate notificarile au fost marcate citite");
    load();
  }

  async function decide(orderId, action, e) {
    e?.stopPropagation();
    setBusy(orderId + action);
    try {
      await apiPatch(`/api/orders/${orderId}`, { action });
      toast(action === "approve" ? "Comanda aprobata" : "Comanda respinsa");
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function openOrder(n) {
    const orderId = n.order?._id || n.order;
    if (!orderId) return;
    if (!n.read) apiPatch(`/api/notifications/${n._id}`, {}).catch(() => {});
    router.push(`/comenzi?order=${orderId}`);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notificari"
        subtitle="Cererile si evenimentele care necesita atentia ta."
        action={
          tab === "current" && items.length > 0 ? (
            <Button variant="secondary" onClick={markAllRead}>
              <Icon name="check" className="h-4 w-4" strokeWidth={2} />
              Marcheaza toate citite
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("current")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "current"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          Curente
          {unread > 0 && (
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                tab === "current"
                  ? "bg-white/20 text-white"
                  : "bg-rose-500 text-white"
              }`}
            >
              {unread}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "history"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Icon name="history" className="h-4 w-4" />
          Istoric
        </button>
      </div>

      <Card>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Se incarca…
          </div>
        ) : items.length === 0 ? (
          <Empty>
            {tab === "current"
              ? "Nu ai notificari noi."
              : "Istoricul notificarilor este gol."}
          </Empty>
        ) : (
          <div className="divide-y divide-slate-50">
            {items.map((n) => {
              const st = typeStyle(n.type);
              const orderId = n.order?._id || n.order;
              const canDecide =
                (n.type === "order_approval" || n.type === "order_new") &&
                n.order &&
                (n.order.status === "pending_approval" ||
                  n.order.status === "new");
              return (
                <div
                  key={n._id}
                  onClick={() => openOrder(n)}
                  className={`flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 ${
                    !n.read ? "bg-indigo-50/30" : ""
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${st.tone}`}
                  >
                    <Icon name={st.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-800">
                        {n.title}
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    {n.message && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        {n.message}
                      </div>
                    )}

                    {n.meta?.items?.length > 0 && (
                      <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2">
                        {n.meta.items.slice(0, 6).map((it, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="truncate text-slate-600">
                              {it.name}
                              <span className="text-slate-400">
                                {" "}
                                × {it.quantity} {UNIT_LABELS[it.unit] || ""}
                              </span>
                            </span>
                            <span className="ml-2 shrink-0 font-medium text-slate-600">
                              {money(it.lineTotal)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-slate-200 pt-1 text-xs font-semibold text-slate-700">
                          <span>Total</span>
                          <span>{money(n.meta.total)}</span>
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      {canDecide && (
                        <>
                          <button
                            disabled={busy === orderId + "approve"}
                            onClick={(e) => decide(orderId, "approve", e)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Aproba
                          </button>
                          <button
                            disabled={busy === orderId + "reject"}
                            onClick={(e) => decide(orderId, "reject", e)}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
                          >
                            Respinge
                          </button>
                        </>
                      )}
                      {orderId && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                          Deschide comanda
                          <Icon name="arrowRight" className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
