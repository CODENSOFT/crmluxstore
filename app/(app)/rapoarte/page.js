"use client";

import { useEffect, useState } from "react";
import {
  apiGet,
  money,
  formatDateTime,
  UNIT_LABELS,
} from "@/lib/client";
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
import { stageInfo } from "@/lib/orderStages";

function StatCard({ label, value, accent = "text-slate-800" }) {
  return (
    <Card className="p-4">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </Card>
  );
}

/* ---------------- Raport comenzi ---------------- */
function OrdersReport() {
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  function query() {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (status) p.set("status", status);
    return p.toString();
  }

  async function load() {
    setLoading(true);
    try {
      const q = query();
      setData(await apiGet(`/api/reports/orders${q ? `?${q}` : ""}`));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportCsv() {
    const q = query();
    window.location.href = `/api/reports/orders?format=csv${q ? `&${q}` : ""}`;
  }

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="De la data">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="Pana la data">
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Toate</option>
              <option value="pending">In asteptare</option>
              <option value="approved">Aprobate</option>
              <option value="rejected">Respinse</option>
            </Select>
          </Field>
          <Button onClick={load} disabled={loading}>
            {loading ? "Se incarca…" : "Aplica filtre"}
          </Button>
          <Button variant="success" onClick={exportCsv}>
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </Card>

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Comenzi" value={data.summary.count} />
            <StatCard
              label="Valoare totala"
              value={money(data.summary.totalValue)}
              accent="text-indigo-600"
            />
            <StatCard
              label="Valoare complete"
              value={money(data.summary.approvedValue)}
              accent="text-emerald-600"
            />
            <StatCard
              label="Asteapta aprobare"
              value={data.summary.byStatus.pending}
              accent="text-amber-600"
            />
          </div>

          <Card>
            {data.orders.length === 0 ? (
              <Empty>Nicio comanda pentru filtrele alese.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="px-4 py-3">Nr.</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Responsabil</th>
                      <th className="px-4 py-3">Produse</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.orders.map((o) => (
                      <tr key={o._id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {o.number}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">
                          {formatDateTime(o.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {o.responsible || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {o.itemsCount}
                        </td>
                        <td className="px-4 py-3">
                          <Badge color={stageInfo(o.status).color}>
                            {stageInfo(o.status).short}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {money(o.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------------- Raport stoc ---------------- */
function StockReport() {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState("");
  const [low, setLow] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  function query() {
    const p = new URLSearchParams();
    if (warehouse) p.set("warehouse", warehouse);
    if (low) p.set("low", "1");
    return p.toString();
  }

  async function load() {
    setLoading(true);
    try {
      const q = query();
      setData(await apiGet(`/api/reports/stock${q ? `?${q}` : ""}`));
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    apiGet("/api/warehouses").then(setWarehouses).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exportCsv() {
    const q = query();
    window.location.href = `/api/reports/stock?format=csv${q ? `&${q}` : ""}`;
  }

  const currency = data?.summary?.currency || "MDL";

  return (
    <div>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="Depozit">
            <Select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
            >
              <option value="">Toate depozitele</option>
              {warehouses.map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Filtru">
            <label className="flex h-[38px] items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={low}
                onChange={(e) => setLow(e.target.checked)}
                className="h-4 w-4"
              />
              Doar stoc scazut
            </label>
          </Field>
          <Button onClick={load} disabled={loading}>
            {loading ? "Se incarca…" : "Aplica filtre"}
          </Button>
          <Button variant="success" onClick={exportCsv}>
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </Card>

      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Produse" value={data.summary.productCount} />
            <StatCard
              label="Valoare stoc"
              value={money(data.summary.totalValue, currency)}
              accent="text-emerald-600"
            />
            <StatCard
              label="Produse stoc scazut"
              value={data.summary.lowStockCount}
              accent="text-amber-600"
            />
          </div>

          <Card>
            {data.rows.length === 0 ? (
              <Empty>Niciun produs pentru filtrele alese.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="px-4 py-3">Produs</th>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Depozit</th>
                      <th className="px-4 py-3 text-right">Cantitate</th>
                      <th className="px-4 py-3 text-right">Pret</th>
                      <th className="px-4 py-3 text-right">Valoare</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {r.product}
                          {r.low && (
                            <span className="ml-2 align-middle">
                              <Badge color={r.total === 0 ? "red" : "yellow"}>
                                {r.total === 0 ? "epuizat" : "scazut"}
                              </Badge>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {r.sku || "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {r.warehouse}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {r.quantity} {UNIT_LABELS[r.unit]}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          {money(r.price, currency)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-700">
                          {money(r.value, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState("orders");
  return (
    <div>
      <PageHeader
        title="Rapoarte"
        subtitle="Analizeaza comenzile si stocul. Exporta in CSV (se deschide in Excel)."
      />

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("orders")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "orders"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Icon name="receipt" className="h-4 w-4" />
          Comenzi
        </button>
        <button
          onClick={() => setTab("stock")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "stock"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Icon name="package" className="h-4 w-4" />
          Stoc
        </button>
      </div>

      {tab === "orders" ? <OrdersReport /> : <StockReport />}
    </div>
  );
}
