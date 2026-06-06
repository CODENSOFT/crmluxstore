"use client";

import { useEffect, useMemo, useState } from "react";
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

function stockOf(product, warehouseId) {
  if (!product || !warehouseId) return 0;
  const e = (product.stock || []).find(
    (s) => String(s.warehouse?._id || s.warehouse) === String(warehouseId)
  );
  return e ? e.quantity : 0;
}

export default function TransferPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    product: "",
    fromWarehouse: "",
    toWarehouse: "",
    quantity: "",
    note: "",
  });

  async function load() {
    try {
      const [p, w, h] = await Promise.all([
        apiGet("/api/products"),
        apiGet("/api/warehouses"),
        apiGet("/api/transfers"),
      ]);
      setProducts(p);
      setWarehouses(w);
      setHistory(h);
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  const product = useMemo(
    () => products.find((p) => p._id === form.product),
    [products, form.product]
  );
  const available = stockOf(product, form.fromWarehouse);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/transfers", {
        ...form,
        quantity: Number(form.quantity),
      });
      toast("Transfer efectuat");
      setForm({
        product: "",
        fromWarehouse: "",
        toWarehouse: "",
        quantity: "",
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
        title="Transfer produse"
        subtitle="Mutati o cantitate de produs intre depozite."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
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
            <Field label="Din depozit" required>
              <Select
                value={form.fromWarehouse}
                onChange={(e) =>
                  setForm({ ...form, fromWarehouse: e.target.value })
                }
                required
              >
                <option value="">— sursa —</option>
                {warehouses.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              {form.product && form.fromWarehouse && (
                <span className="mt-1 block text-xs text-slate-400">
                  Disponibil: {available} {product && UNIT_LABELS[product.unit]}
                </span>
              )}
            </Field>
            <Field label="In depozit" required>
              <Select
                value={form.toWarehouse}
                onChange={(e) =>
                  setForm({ ...form, toWarehouse: e.target.value })
                }
                required
              >
                <option value="">— destinatie —</option>
                {warehouses
                  .filter((w) => w._id !== form.fromWarehouse)
                  .map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Cantitate" required>
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
            <Field label="Nota">
              <Textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </Field>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Se transfera…" : "Efectueaza transfer"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Icon name="transfer" className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Istoric transferuri</h2>
          </div>
          {history.length === 0 ? (
            <Empty>Niciun transfer inca.</Empty>
          ) : (
            <div className="divide-y divide-slate-50">
              {history.map((t) => (
                <div
                  key={t._id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <Icon name="transfer" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700">
                      {t.product?.name || t.productName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t.fromWarehouse?.name} → {t.toWarehouse?.name} ·{" "}
                      {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <Badge color="sky">
                    {t.quantity} {t.product && UNIT_LABELS[t.product.unit]}
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
