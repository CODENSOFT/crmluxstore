"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, formatDateTime, UNIT_LABELS } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  Textarea,
  Select,
  Badge,
  Empty,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";

export default function ArrivalsPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    product: "",
    warehouse: "",
    quantity: "",
    unitCost: "",
    supplierId: "",
    note: "",
  });

  async function load() {
    try {
      const [p, w, s, h] = await Promise.all([
        apiGet("/api/products?light=1"),
        apiGet("/api/warehouses"),
        apiGet("/api/suppliers"),
        apiGet("/api/arrivals"),
      ]);
      setProducts(p);
      setWarehouses(w);
      setSuppliers(s);
      setHistory(h);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/arrivals", {
        ...form,
        quantity: Number(form.quantity),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
      });
      toast("Receptie inregistrata — stocul a fost marit");
      setForm({
        product: "",
        warehouse: "",
        quantity: "",
        unitCost: "",
        supplierId: "",
        note: "",
      });
      load();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Receptie marfa"
        subtitle="Inregistrati stocul nou primit pentru produse existente. Stocul creste automat."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Produs" required>
              <Select
                value={form.product}
                onChange={(e) => setForm({ ...form, product: e.target.value })}
                required
              >
                <option value="">— alege produs —</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Depozit destinatie" required>
              <Select
                value={form.warehouse}
                onChange={(e) =>
                  setForm({ ...form, warehouse: e.target.value })
                }
                required
              >
                <option value="">— depozit —</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cantitate primita" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Pret achizitie / unit.">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.unitCost}
                  onChange={(e) =>
                    setForm({ ...form, unitCost: e.target.value })
                  }
                  placeholder="optional"
                />
              </Field>
            </div>
            <Field label="Furnizor">
              <Select
                value={form.supplierId}
                onChange={(e) =>
                  setForm({ ...form, supplierId: e.target.value })
                }
              >
                <option value="">— fara furnizor —</option>
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {suppliers.length === 0 && (
                <span className="mt-1 block text-xs text-amber-600">
                  Niciun furnizor. Adauga-i in pagina „Furnizori".
                </span>
              )}
            </Field>
            <Field label="Nota">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
            <Button
              type="submit"
              variant="success"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Se inregistreaza…" : "Inregistreaza receptia"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Icon name="inbox" className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Istoric receptii</h2>
          </div>
          {history.length === 0 ? (
            <Empty>Nicio receptie inca.</Empty>
          ) : (
            <div className="divide-y divide-slate-50">
              {history.map((t) => (
                <div key={t._id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Icon name="inbox" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700">
                      {t.product?.name || t.productName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t.warehouse?.name}
                      {t.supplier ? ` · ${t.supplier}` : ""} ·{" "}
                      {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <Badge color="green">
                    +{t.quantity} {t.product && UNIT_LABELS[t.product.unit]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
