"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, formatDate } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  Badge,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";

const PRIORITY = {
  low: { label: "Scazuta", color: "slate" },
  normal: { label: "Normala", color: "blue" },
  high: { label: "Ridicata", color: "red" },
};
const STATUS = {
  todo: { label: "De facut", color: "slate" },
  in_progress: { label: "In lucru", color: "yellow" },
  done: { label: "Finalizata", color: "green" },
};

export default function TasksPage() {
  const user = useUser();
  const isAdmin = user?.role === "admin";
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assignedTo: "",
    dueDate: "",
    priority: "normal",
  });

  async function load() {
    try {
      const [t, u] = await Promise.all([
        apiGet("/api/tasks"),
        apiGet("/api/users"),
      ]);
      setTasks(t);
      setUsers(u.filter((x) => x.active));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/tasks", {
        ...form,
        assignedTo: isAdmin ? form.assignedTo || undefined : undefined,
      });
      toast("Sarcina creata");
      setOpen(false);
      setForm({
        title: "",
        description: "",
        assignedTo: "",
        dueDate: "",
        priority: "normal",
      });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function setStatus(id, status) {
    try {
      await apiPatch(`/api/tasks/${id}`, { status });
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti sarcina?")) return;
    try {
      await apiDelete(`/api/tasks/${id}`);
      toast("Sarcina stearsa");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  const columns = ["todo", "in_progress", "done"];

  return (
    <div>
      <PageHeader
        title="Sarcini"
        subtitle="Indicatii si sarcini pentru manageri, cu termen pentru viitor."
        action={
          <Button onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Sarcina noua
          </Button>
        }
      />

      {tasks.length === 0 ? (
        <Card>
          <Empty>Nu exista sarcini.</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {columns.map((col) => (
            <div key={col}>
              <div className="mb-2 flex items-center gap-2">
                <Badge color={STATUS[col].color}>{STATUS[col].label}</Badge>
                <span className="text-xs text-slate-400">
                  {tasks.filter((t) => t.status === col).length}
                </span>
              </div>
              <div className="space-y-3">
                {tasks
                  .filter((t) => t.status === col)
                  .map((t) => {
                    const overdue =
                      t.dueDate &&
                      t.status !== "done" &&
                      new Date(t.dueDate) < new Date();
                    return (
                      <Card key={t._id} className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-slate-800">
                            {t.title}
                          </h3>
                          <Badge color={PRIORITY[t.priority].color}>
                            {PRIORITY[t.priority].label}
                          </Badge>
                        </div>
                        {t.description && (
                          <p className="mt-1 text-sm text-slate-500">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="user" className="h-3.5 w-3.5" />
                            {t.assignedTo?.name || "—"}
                          </span>
                          {t.dueDate && (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                overdue ? "text-rose-500" : ""
                              }`}
                            >
                              <Icon name="calendar" className="h-3.5 w-3.5" />
                              {formatDate(t.dueDate)}
                              {overdue && " (depasit)"}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <Select
                            value={t.status}
                            onChange={(e) => setStatus(t._id, e.target.value)}
                            className="!py-1 text-xs"
                          >
                            <option value="todo">De facut</option>
                            <option value="in_progress">In lucru</option>
                            <option value="done">Finalizata</option>
                          </Select>
                          {(isAdmin ||
                            t.createdBy?._id === user.id) && (
                            <button
                              onClick={() => remove(t._id)}
                              className="ml-2 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sarcina noua"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Anuleaza
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading ? "Se salveaza…" : "Creeaza sarcina"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Titlu" required>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="ex: Verifica stocul de sampon"
              required
            />
          </Field>
          <Field label="Descriere / indicatii">
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Pentru cine"
              hint={!isAdmin ? "Doar tu (manager)" : undefined}
            >
              {isAdmin ? (
                <Select
                  value={form.assignedTo}
                  onChange={(e) =>
                    setForm({ ...form, assignedTo: e.target.value })
                  }
                >
                  <option value="">— eu ({user.name}) —</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={user.name} disabled />
              )}
            </Field>
            <Field label="Termen (pentru cand)">
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Prioritate">
            <Select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Scazuta</option>
              <option value="normal">Normala</option>
              <option value="high">Ridicata</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
