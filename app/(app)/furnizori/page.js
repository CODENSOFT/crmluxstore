"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, money } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Modal,
  Empty,
  PageHeader,
  Badge,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

const EMPTY = { name: "", phone: "", email: "", address: "", note: "" };

export default function SuppliersPage() {
  const toast = useToast();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setList(await apiGet("/api/suppliers"));
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
      await apiPost("/api/suppliers", form);
      toast("Furnizor adaugat");
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti furnizorul?")) return;
    try {
      await apiDelete(`/api/suppliers/${id}`);
      toast("Furnizor sters");
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Furnizori"
        subtitle="Companiile de la care primesti marfa. Le selectezi la receptie."
        action={
          <Button
            onClick={() => {
              setForm(EMPTY);
              setOpen(true);
            }}
          >
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Furnizor nou
          </Button>
        }
      />

      {list.length === 0 ? (
        <Card>
          <Empty>Niciun furnizor. Adauga primul furnizor.</Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <Card key={s._id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Icon name="truck" className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.name}</h3>
                    <div className="text-xs text-slate-400">
                      {s.phone || "fara telefon"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => remove(s._id)}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-500">
                {s.email && (
                  <div className="truncate">✉ {s.email}</div>
                )}
                {s.address && <div className="truncate">📍 {s.address}</div>}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <div>
                  <div className="text-xs text-slate-400">Receptii</div>
                  <div className="font-semibold text-slate-700">
                    {s.arrivals}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Valoare marfa</div>
                  <div className="font-semibold text-emerald-600">
                    {money(s.totalCost)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Furnizor nou"
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
          <Field label="Denumire furnizor" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ex: ChemDistrib SRL"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Adresa">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
