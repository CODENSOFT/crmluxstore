"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/app/_components/link";
import { apiPatch } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser, can } from "@/app/_components/user";
import { formatDate } from "@/lib/format";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { PageHeader, ButtonLink, Select, Segmented, Badge, Avatar, Skeleton, cx } from "@/app/_components/ui";
import { useToast, Menu } from "@/app/_components/overlay";
import { Plus, CalendarBlank, CheckCircle, Circle, Timer, Play, Check } from "@/app/_components/icons";

const COL_ICON = { todo: Circle, in_progress: Timer, done: CheckCircle };

const STATUS_TONE = { todo: "text-fg-4", in_progress: "text-accent", done: "text-ok" };

function TaskCard({ t, onOpen, onDragStart, onMove }) {
  const pr = TASK_PRIORITY.find((p) => p.key === t.priority);
  const today = new Date(new Date().toDateString());
  const overdue = t.status !== "done" && t.dueDate && new Date(t.dueDate) < today;
  const StatusIcon = COL_ICON[t.status] || Circle;
  // pasul urmator, la un singur click: De facut -> In lucru -> Finalizata
  const next = t.status === "todo" ? { key: "in_progress", label: "Începe", icon: Play } : t.status === "in_progress" ? { key: "done", label: "Finalizează", icon: Check } : null;
  return (
    // clic oriunde pe cartonas = scurtatura pentru mouse; de la tastatura se foloseste linkul din titlu
    <div
      role="presentation"
      draggable
      onDragStart={(e) => onDragStart(e, t)}
      onClick={(e) => e.currentTarget.contains(e.target) && onOpen(t)}
      className="group cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        {/* statusul se alege din lista (nu mai sare direct in „Finalizata”) */}
        <div className="shrink-0">
          <Menu
            align="left"
            width="w-48"
            trigger={
              <button
                type="button"
                aria-label="Schimbă statusul"
                title="Schimbă statusul"
                className={cx("mt-0.5 inline-flex items-center rounded-full transition-colors hover:text-accent", STATUS_TONE[t.status])}
              >
                <StatusIcon size={18} weight={t.status === "done" ? "fill" : "regular"} />
              </button>
            }
            items={[
              { header: "Statusul sarcinii" },
              ...TASK_STATUS.map((s) => ({ label: s.label, icon: COL_ICON[s.key], active: s.key === t.status, onClick: () => onMove(t, s.key) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/sarcini/${t._id}`}
            className={cx("block text-[13.5px] leading-snug focus-visible:underline", t.status === "done" ? "text-fg-3 line-through" : "text-fg")}
          >
            {t.title}
          </Link>
          {t.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-fg-3">{t.description}</p>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-6">
        {t.priority !== "normal" && <Badge tone={pr?.tone}>{pr?.label}</Badge>}
        {t.dueDate && (
          <span className={cx("inline-flex items-center gap-1 text-[12px]", overdue ? "font-medium text-bad" : "text-fg-3")}>
            <CalendarBlank size={13} />
            {formatDate(t.dueDate)}
          </span>
        )}
        {t.customer && <span className="max-w-[140px] truncate text-[12px] text-fg-3">· {t.customer.name}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          {next && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(t, next.key);
              }}
              className={cx(
                "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium ring-1 ring-inset transition-colors",
                next.key === "done" ? "text-ok ring-ok/40 hover:bg-ok-soft" : "text-accent ring-accent/40 hover:bg-accent-soft"
              )}
            >
              <next.icon size={13} weight="bold" />
              {next.label}
            </button>
          )}
          <span title={t.assignedTo?.name}>
            <Avatar name={t.assignedTo?.name} size={22} />
          </span>
        </span>
      </div>
    </div>
  );
}

function Inner() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = can(user, "tasks.manage");
  const [f, setF] = useQueryState({ scope: isAdmin ? "all" : "mine" });
  const router = useRouter();
  // linkuri vechi „?nou=1” -> pagina noua
  useEffect(() => {
    if (f.nou === "1") router.replace(`/sarcini/nou${f.customer ? `?customer=${f.customer}` : ""}`);
  }, [f.nou, f.customer, router]);
  const [dragOver, setDragOver] = useState(null);
  const { data, loading, reload, mutate } = useApi(`/api/tasks${qs({ mine: f.scope === "mine" ? 1 : "", assignedTo: f.assignedTo, hideDone: 1 })}`);
  const { data: users } = useApi(isAdmin ? "/api/users" : null);

  const move = async (t, status) => {
    if (t.status === status) return;
    mutate((list) => list.map((x) => (x._id === t._id ? { ...x, status } : x)));
    try {
      await apiPatch(`/api/tasks/${t._id}`, { status });
      invalidate("/api/me", "/api/dashboard");
    } catch (e) {
      toast(e.message, "error");
      reload();
    }
  };

  const today = new Date(new Date().toDateString());
  const overdue = (data || []).filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < today).length;

  return (
    <div className="animate-in">
      <PageHeader
        title="Sarcini"
        description={overdue ? `${overdue} sarcini au termenul depășit.` : "Ce are de făcut echipa: apeluri, livrări, comenzi către furnizori."}
        actions={<ButtonLink href="/sarcini/nou" variant="primary" icon={Plus}>Sarcină nouă</ButtonLink>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isAdmin && (
          <Segmented
            value={f.scope}
            onChange={(v) => setF({ scope: v })}
            options={[
              { value: "all", label: "Toată echipa" },
              { value: "mine", label: "Ale mele" },
            ]}
          />
        )}
        {isAdmin && f.scope === "all" && (
          <Select value={f.assignedTo || ""} onChange={(e) => setF({ assignedTo: e.target.value })} className="w-[200px]">
            <option value="">Toți membrii</option>
            {(users || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </Select>
        )}
        <span className="text-[12.5px] text-fg-3">Apăsați „Începe” / „Finalizează” sau pe cercul din stânga pentru a alege statusul. Pe calculator puteți și trage cardurile între coloane.</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {TASK_STATUS.map((col) => {
          const items = (data || []).filter((t) => t.status === col.key);
          const IconC = COL_ICON[col.key];
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                const t = (data || []).find((x) => x._id === id);
                if (t) move(t, col.key);
              }}
              className={cx("flex flex-col rounded-2xl lg:min-h-[300px] border border-line bg-surface-2/50 p-2.5 transition-colors", dragOver === col.key && "border-accent bg-accent-soft/50")}
            >
              <header className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
                  <IconC size={16} className={col.key === "done" ? "text-ok" : col.key === "in_progress" ? "text-accent" : "text-fg-3"} />
                  {col.label}
                  <span className="tnum rounded-md bg-surface-3 px-1.5 text-[11.5px] font-semibold text-fg-2">{items.length}</span>
                </span>
                {col.key === "todo" && (
                  <button type="button" onClick={() => router.push("/sarcini/nou")} className="rounded-md p-1 text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label="Sarcină nouă">
                    <Plus size={15} weight="bold" />
                  </button>
                )}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {loading && !data && [0, 1].map((i) => <Skeleton key={i} className="h-20" />)}
                {items.map((t) => (
                  <TaskCard
                    key={t._id}
                    t={t}
                    onOpen={(x) => router.push(`/sarcini/${x._id}`)}
                    onDragStart={(e, x) => e.dataTransfer.setData("text/plain", x._id)}
                    onMove={move}
                  />
                ))}
                {data && !items.length && <p className="px-2 py-6 text-center text-[12.5px] text-fg-4">{col.key === "done" ? "Sarcinile finalizate în ultimele 7 zile apar aici" : "Nicio sarcină"}</p>}
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
