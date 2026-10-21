"use client";

// Sarcina: pagina de creare si de vizualizare / editare
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { relativeTime, ymd } from "@/lib/format";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/constants";
import { Button, Field, FormSection, Input, Select, Textarea, Segmented } from "@/app/_components/ui";
import { useConfirm, useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { CustomerPicker, SelectedChip } from "@/app/_components/pickers";
import { CalendarBlank, Trash, User, Buildings, Receipt, ListChecks, LinkIcon } from "@/app/_components/icons";

/** Pagina „Sarcină nouă” / sarcina existenta (vizualizare + editare) */
export function TaskForm({ task, presetCustomer }) {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const onClose = () => router.push("/sarcini");
  const isAdmin = can(user, "tasks.manage");
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
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const canEdit = !task || isAdmin || String(task.createdBy?._id) === user.id;
  const remove = async () => {
    if (!(await confirm({ title: "Ștergeți sarcina?", message: task.title, tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      await apiDelete(`/api/tasks/${task._id}`);
      invalidate("/api/tasks", "/api/me", "/api/dashboard");
      toast("Sarcina a fost ștearsă");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  return (
    <FormPage
      back={{ href: "/sarcini", label: "Sarcini" }}
      title={task ? task.title : "Sarcină nouă"}
      description={task ? `Creată de ${task.createdBy?.name || "—"} · ${relativeTime(task.createdAt)}` : "Scrieți pe scurt ce trebuie făcut. Termenul și clientul sunt opționale."}
      missing={[!f.title?.trim() && "Ce trebuie făcut"].filter(Boolean)}
      onSubmit={() => f.title?.trim() && !busy && save()}
      footer={
        <>
          {task && canEdit && can(user, "delete") && (
            <Button variant="danger-ghost" icon={Trash} onClick={remove}>
              Șterge
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={!f.title?.trim()} onClick={save}>{task ? "Salvează" : "Creează sarcina"}</Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={ListChecks} title="Sarcina" description="Ce trebuie făcut, pe scurt, plus detaliile necesare.">
        <Field label="Ce trebuie făcut" required>
          <Input autoFocus value={f.title || ""} onChange={(e) => set({ title: e.target.value })} disabled={!canEdit} placeholder="ex: Sunați spălătoria AquaWash pentru comanda de chimie" />
        </Field>
        <Field label="Detalii">
          <Textarea rows={5} value={f.description || ""} onChange={(e) => set({ description: e.target.value })} disabled={!canEdit} />
        </Field>
        </FormSection>
        <FormSection icon={CalendarBlank} title="Planificare" description="Cine se ocupă, până când și cât de urgent este.">
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
        </FormSection>
        <FormSection icon={LinkIcon} title="Legături" description="Opțional — clientul sau comanda la care se referă sarcina.">
        <Field label="Client">
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
        </FormSection>
      </div>
    </FormPage>
  );
}

