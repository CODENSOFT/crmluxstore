"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, formatDateTime, UNIT_LABELS } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
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

const REASONS = ["Defect", "Expirat", "Deteriorat", "Pierdere", "Altul"];

export default function WriteOffPage() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    product: "",
    warehouse: "",
    quantity: "",
    reason: "Defect",
  });

  async function load() {
    try {
      const [p, w, h] = await Promise.all([
        apiGet("/api/products"),
        apiGet("/api/warehouses"),
        apiGet("/api/writeoffs"),
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
  const available = stockOf(product, form.warehouse);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/writeoffs", {
        ...form,
        quantity: Number(form.quantity),
      });
      toast("Produs anulat din stoc");
      setForm({ product: "", warehouse: "", quantity: "", reason: "Defect" });
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
        title="Anulare produs (spisanie)"
        subtitle="Scoateti din stoc produsele defecte, expirate sau deteriorate."
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
            <Field label="Depozit" required>
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
              {form.product && form.warehouse && (
                <span className="mt-1 block text-xs text-slate-400">
                  Disponibil: {available} {product && UNIT_LABELS[product.unit]}
                </span>
              )}
            </Field>
            <Field label="Cantitate de anulat" required>
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
            <Field label="Motiv">
              <Select
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="submit"
              variant="danger"
              disabled={loading}
              className="w-full"
            >
              {loading ? "Se anuleaza…" : "Anuleaza din stoc"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5">
            <Icon name="trash" className="h-4 w-4 text-slate-400" />
            <h2 className="font-semibold text-slate-800">Istoric anulari</h2>
          </div>
          {history.length === 0 ? (
            <Empty>Nicio anulare inca.</Empty>
          ) : (
            <div className="divide-y divide-slate-50">
              {history.map((t) => (
                <div key={t._id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <Icon name="trash" className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700">
                      {t.product?.name || t.productName}
                    </div>
                    <div className="text-xs text-slate-400">
                      {t.warehouse?.name} · {t.reason} ·{" "}
                      {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <Badge color="red">
                    −{t.quantity} {t.product && UNIT_LABELS[t.product.unit]}
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
