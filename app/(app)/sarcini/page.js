"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser } from "@/app/_components/user";
import { formatDate, relativeTime, ymd } from "@/lib/format";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { PageHeader, Button, Field, Input, Select, Textarea, Segmented, Badge, Avatar, Skeleton, cx } from "@/app/_components/ui";
import { Drawer, useConfirm, useToast } from "@/app/_components/overlay";
import { CustomerPicker, SelectedChip } from "@/app/_components/pickers";
import { Plus, CalendarBlank, Trash, User, Buildings, Receipt, CheckCircle, Circle, Timer } from "@/app/_components/icons";

const COL_ICON = { todo: Circle, in_progress: Timer, done: CheckCircle };

function TaskForm(props) {
  return props.open ? <TaskFormBody {...props} /> : null;
}

function TaskFormBody({ open, onClose, task, presetCustomer, onSaved, onDelete }) {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user.role === "admin";
  const { data: users } = useApi(isAdmin ? "/api/users" : null);
  const { data: preset } = useApi(!task && presetCustomer ? `/api/customers/${presetCustomer}` : null);
  const [f, setF] = useState(() => ({
    title: task?.title || "",
    description: task?.description || "",
    assignedTo: task?.assignedTo?._id || user.id,
    dueDate: task?.dueDate ? ymd(task.dueDate) : "",
    priority: task?.priority || "normal",
    status: task?.status || "todo",
  }));
  // undefined = neales inca (se foloseste clientul presetat), null = sters explicit
  const [chosen, setCustomer] = useState(task?.customer || undefined);
  const customer = chosen === undefined ? preset || null : chosen;
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, dueDate: f.dueDate || null, customer: customer?._id || null };
      task ? await apiPatch(`/api/tasks/${task._id}`, body) : await apiPost("/api/tasks", body);
      toast(task ? "Sarcina a fost actualizată" : "Sarcina a fost creată");
      invalidate("/api/tasks", "/api/me", "/api/dashboard");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const canEdit = !task || isAdmin || String(task.createdBy?._id) === user.id;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={task ? "Sarcină" : "Sarcină nouă"}
      description={task ? `Creată de ${task.createdBy?.name || "—"} · ${relativeTime(task.createdAt)}` : null}
      footer={
        <>
          {task && canEdit && (
            <Button variant="danger-ghost" icon={Trash} className="mr-auto" onClick={() => onDelete(task)}>
              Șterge
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" loading={busy} disabled={!f.title?.trim()} onClick={save}>{task ? "Salvează" : "Creează sarcina"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ce trebuie făcut" required>
          <Input autoFocus value={f.title || ""} onChange={(e) => set({ title: e.target.value })} disabled={!canEdit} placeholder="ex: Sunați spălătoria AquaWash pentru comanda de chimie" />
        </Field>
        <Field label="Detalii">
          <Textarea rows={4} value={f.description || ""} onChange={(e) => set({ description: e.target.value })} disabled={!canEdit} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {isAdmin && users && (
            <Field label="Responsabil">
              <Select value={f.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })}>
                {users.filter((u) => u.active).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Termen">
            <Input type="date" value={f.dueDate || ""} onChange={(e) => set({ dueDate: e.target.value })} disabled={!canEdit} />
          </Field>
          <Field label="Prioritate">
            <Segmented
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              value={f.priority}
              onChange={(v) => canEdit && set({ priority: v })}
              options={TASK_PRIORITY.map((p) => ({ value: p.key, label: p.label }))}
            />
          </Field>
          {task && (
            <Field label="Status">
              <Select value={f.status} onChange={(e) => set({ status: e.target.value })}>
                {TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <Field label="Client (opțional)">
          {customer ? (
            <SelectedChip icon={customer.type === "company" ? Buildings : User} title={customer.name} subtitle={customer.phone} onClear={canEdit ? () => setCustomer(null) : undefined} />
          ) : (
            <CustomerPicker onSelect={setCustomer} />
          )}
        </Field>
        {task?.order && (
          <Link href={`/comenzi/${task.order._id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline">
            <Receipt size={15} /> Comanda {task.order.number}
          </Link>
        )}
      </div>
    </Drawer>
  );
}

function TaskCard({ t, onOpen, onDragStart, onToggle }) {
  const pr = TASK_PRIORITY.find((p) => p.key === t.priority);
  const today = new Date(new Date().toDateString());
  const overdue = t.status !== "done" && t.dueDate && new Date(t.dueDate) < today;
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, t)}
      onClick={() => onOpen(t)}
      className="group cursor-pointer rounded-xl border border-line bg-surface p-3 shadow-xs transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(t);
          }}
          aria-label={t.status === "done" ? "Redeschide" : "Marchează finalizată"}
          className={cx("mt-0.5 shrink-0 rounded-full transition-colors", t.status === "done" ? "text-ok" : "text-fg-4 hover:text-ok")}
        >
          {t.status === "done" ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cx("text-[13.5px] leading-snug", t.status === "done" ? "text-fg-3 line-through" : "text-fg")}>{t.title}</p>
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
        <span className="ml-auto" title={t.assignedTo?.name}>
          <Avatar name={t.assignedTo?.name} size={22} />
        </span>
      </div>
    </div>
  );
}

function Inner() {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = user.role === "admin";
  const [f, setF] = useQueryState({ scope: isAdmin ? "all" : "mine" });
  const [formState, setForm] = useState({ open: false, task: null });
  const form = f.nou === "1" ? { open: true, task: null, customer: f.customer } : formState;
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
  const remove = async (t) => {
    if (!(await confirm({ title: "Ștergeți sarcina?", message: t.title, tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      await apiDelete(`/api/tasks/${t._id}`);
      setForm({ open: false, task: null });
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const today = new Date(new Date().toDateString());
  const overdue = (data || []).filter((t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < today).length;

  return (
    <div className="animate-in">
      <PageHeader
        title="Sarcini"
        description={overdue ? `${overdue} sarcini au termenul depășit.` : "Ce are de făcut echipa: apeluri, livrări, comenzi către furnizori."}
        actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, task: null })}>Sarcină nouă</Button>}
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
        <span className="text-[12.5px] text-fg-3">Trageți cardurile între coloane pentru a schimba statusul.</span>
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
              className={cx("flex min-h-[300px] flex-col rounded-2xl border border-line bg-surface-2/50 p-2.5 transition-colors", dragOver === col.key && "border-accent bg-accent-soft/50")}
            >
              <header className="flex items-center justify-between px-1.5 pb-2.5 pt-1">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
                  <IconC size={16} className={col.key === "done" ? "text-ok" : col.key === "in_progress" ? "text-accent" : "text-fg-3"} />
                  {col.label}
                  <span className="tnum rounded-md bg-surface-3 px-1.5 text-[11.5px] font-semibold text-fg-2">{items.length}</span>
                </span>
                {col.key === "todo" && (
                  <button type="button" onClick={() => setForm({ open: true, task: null })} className="rounded-md p-1 text-fg-3 hover:bg-surface-3 hover:text-fg" aria-label="Sarcină nouă">
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
                    onOpen={(x) => setForm({ open: true, task: x })}
                    onDragStart={(e, x) => e.dataTransfer.setData("text/plain", x._id)}
                    onToggle={(x) => move(x, x.status === "done" ? "todo" : "done")}
                  />
                ))}
                {data && !items.length && <p className="px-2 py-6 text-center text-[12.5px] text-fg-4">{col.key === "done" ? "Sarcinile finalizate în ultimele 7 zile apar aici" : "Nicio sarcină"}</p>}
              </div>
            </section>
          );
        })}
      </div>

      <TaskForm open={form.open} task={form.task} presetCustomer={form.customer} onClose={() => { setForm({ open: false, task: null }); if (f.nou) setF({ nou: "", customer: "" }); }} onSaved={reload} onDelete={remove} />
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
