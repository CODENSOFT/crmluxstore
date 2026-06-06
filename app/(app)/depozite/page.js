"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Modal,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

export default function WarehousesPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", note: "" });
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setList(await apiGet("/api/warehouses"));
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
      await apiPost("/api/warehouses", form);
      toast("Depozit creat");
      setOpen(false);
      setForm({ name: "", address: "", note: "" });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti acest depozit?")) return;
    try {
      await apiDelete(`/api/warehouses/${id}`);
      toast("Depozit sters");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Depozite"
        subtitle="Locatiile fizice unde se pastreaza produsele."
        action={
          <Button onClick={() => setOpen(true)}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Depozit nou
          </Button>
        }
      />

      {list.length === 0 ? (
        <Card>
          <Empty>Nu exista depozite. Creati primul depozit.</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((w) => (
            <Card key={w._id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon name="warehouse" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-800">{w.name}</h3>
                    <div className="text-xs text-slate-400">Depozit activ</div>
                  </div>
                </div>
                <button
                  onClick={() => remove(w._id)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-sm text-slate-500">
                <div className="flex items-start gap-2">
                  <Icon
                    name="warehouse"
                    className="mt-0.5 h-4 w-4 shrink-0 text-slate-300"
                  />
                  <span>{w.address || "Fara adresa"}</span>
                </div>
                {w.note && (
                  <div className="flex items-start gap-2">
                    <Icon
                      name="edit"
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-300"
                    />
                    <span>{w.note}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Depozit nou"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Anuleaza
            </Button>
            <Button onClick={save} disabled={loading}>
              {loading ? "Se salveaza…" : "Salveaza"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Denumire depozit" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex: Depozit central"
              required
            />
          </Field>
          <Field label="Adresa">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="ex: str. Industriala 12"
            />
          </Field>
          <Field label="Nota">
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
