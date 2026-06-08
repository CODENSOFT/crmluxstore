"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  money,
  formatDateTime,
  UNIT_LABELS,
} from "@/lib/client";
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
import {
  ORDER_STAGES,
  stageInfo,
  stageIndex,
  nextStage,
} from "@/lib/orderStages";

function stockOf(product, warehouseId) {
  if (!product || !warehouseId) return null;
  const e = (product.stock || []).find(
    (s) => String(s.warehouse?._id || s.warehouse) === String(warehouseId)
  );
  return e ? e.quantity : 0;
}

// Vizualizare stadii comanda (stepper orizontal)
function StageStepper({ status }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
        <Icon name="x" className="h-4 w-4" strokeWidth={2} />
        Comanda a fost respinsa
      </div>
    );
  }
  const current = Math.max(0, stageIndex(status));
  return (
    <div className="flex">
      {ORDER_STAGES.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="relative flex flex-1 flex-col items-center">
            {i > 0 && (
              <span
                className={`absolute top-3.5 left-[-50%] right-1/2 h-0.5 ${
                  i <= current ? "bg-indigo-500" : "bg-slate-200"
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? "bg-indigo-600 text-white ring-4 ring-indigo-100"
                  : done
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? (
                <Icon name="checkCircle" className="h-4 w-4" strokeWidth={2.2} />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`mt-1.5 px-1 text-center text-[11px] leading-tight ${
                active ? "font-semibold text-slate-800" : "text-slate-400"
              }`}
            >
              {s.short}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Se incarca…</div>}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const user = useUser();
  const isAdmin = user?.role === "admin";
  const toast = useToast();
  const params = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [history, setHistory] = useState([]);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(params.get("status") || "");

  // formular comanda
  const [lines, setLines] = useState([
    { product: "", warehouse: "", quantity: "" },
  ]);
  const [responsible, setResponsible] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    try {
      const url = filter ? `/api/orders?status=${filter}` : "/api/orders";
      const [o, p, w, u] = await Promise.all([
        apiGet(url),
        apiGet("/api/products?light=1"),
        apiGet("/api/warehouses"),
        apiGet("/api/users"),
      ]);
      setOrders(o);
      setProducts(p);
      setWarehouses(w);
      setUsers(u.filter((x) => x.active));
    } catch (e) {
      toast(e.message, "error");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Deschide automat comanda indicata in URL (?order=ID) — ex: dintr-o notificare
  const orderParam = params.get("order");
  useEffect(() => {
    if (!orderParam) return;
    apiGet(`/api/orders/${orderParam}`)
      .then(setDetail)
      .catch((e) => toast(e.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderParam]);

  // Incarca istoricul cand se deschide o comanda
  const detailId = detail?._id;
  useEffect(() => {
    if (detailId) loadHistory(detailId);
    else setHistory([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p._id, p])),
    [products]
  );

  const total = lines.reduce((sum, l) => {
    const p = productById[l.product];
    const q = Number(l.quantity) || 0;
    return sum + (p ? p.price * q : 0);
  }, 0);

  function setLine(i, patch) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, { product: "", warehouse: "", quantity: "" }]);
  }
  function removeLine(i) {
    setLines((ls) => (ls.length === 1 ? ls : ls.filter((_, idx) => idx !== i)));
  }

  function openCreate() {
    setEditId(null);
    setLines([{ product: "", warehouse: "", quantity: "" }]);
    setResponsible(isAdmin ? "" : user.id);
    setCustomerName("");
    setNote("");
    setOpen(true);
  }

  function openEdit(order) {
    setEditId(order._id);
    setLines(
      order.items.map((it) => ({
        product: it.product?._id || it.product,
        warehouse: it.warehouse?._id || it.warehouse,
        quantity: String(it.quantity),
      }))
    );
    setResponsible(order.responsible?._id || order.responsible || "");
    setCustomerName(order.customerName || "");
    setNote(order.note || "");
    setDetail(null); // inchide cardul de detalii — ramane doar editarea
    setOpen(true);
  }

  // Inchide formularul; daca editam o comanda, revenim la cardul ei de detalii
  async function cancelForm() {
    const editing = editId;
    setOpen(false);
    if (editing) {
      try {
        setDetail(await apiGet(`/api/orders/${editing}`));
      } catch {
        /* ignoram */
      }
    }
  }

  async function submit(e) {
    e.preventDefault();
    const items = lines
      .filter((l) => l.product && l.warehouse && Number(l.quantity) > 0)
      .map((l) => ({
        product: l.product,
        warehouse: l.warehouse,
        quantity: Number(l.quantity),
      }));
    if (items.length === 0) {
      toast("Adaugati cel putin un produs valid", "error");
      return;
    }
    setLoading(true);
    try {
      if (editId) {
        const updated = await apiPatch(`/api/orders/${editId}`, {
          edit: {
            items,
            responsible: isAdmin ? responsible || undefined : undefined,
            customerName,
            note,
          },
        });
        toast(
          isAdmin
            ? "Comanda modificata"
            : "Modificare trimisa spre aprobarea adminului"
        );
        setOpen(false);
        setDetail(updated); // revenim la cardul comenzii, actualizat
        load();
      } else {
        await apiPost("/api/orders", {
          items,
          responsible: isAdmin ? responsible || undefined : undefined,
          customerName,
          note,
        });
        toast(
          isAdmin
            ? "Comanda creata si aprobata"
            : "Comanda creata — asteapta aprobarea adminului"
        );
        setOpen(false);
        load();
      }
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Deschide cardul de detalii cu datele complete (proaspete din server)
  async function openDetail(id) {
    try {
      setDetail(await apiGet(`/api/orders/${id}`));
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Incarca istoricul comenzii deschise
  async function loadHistory(id) {
    try {
      setHistory(await apiGet(`/api/orders/${id}/history`));
    } catch {
      setHistory([]);
    }
  }

  async function editDecision(id, action) {
    try {
      const updated = await apiPatch(`/api/orders/${id}`, { action });
      toast(
        action === "approve_edit"
          ? "Modificare aprobata si aplicata"
          : "Modificare respinsa"
      );
      setDetail(updated);
      loadHistory(id);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function decide(id, action) {
    try {
      await apiPatch(`/api/orders/${id}`, { action });
      toast(action === "approve" ? "Comanda aprobata" : "Comanda respinsa");
      setDetail(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function setStage(id, stage) {
    try {
      const updated = await apiPatch(`/api/orders/${id}`, { stage });
      toast(`Stadiu actualizat: ${stageInfo(stage).label}`);
      setDetail(updated);
      loadHistory(id);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  async function remove(id) {
    if (!confirm("Stergeti comanda? Stocul aplicat va fi returnat.")) return;
    try {
      await apiDelete(`/api/orders/${id}`);
      toast("Comanda stearsa");
      setDetail(null);
      load();
    } catch (e) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Comenzi"
        subtitle={
          isAdmin
            ? "Toate comenzile. Aprobati sau respingeti comenzile managerilor."
            : "Comenzile create de tine sau de care esti responsabil."
        }
        action={
          <Button onClick={openCreate}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2} />
            Comanda noua
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["", "Toate"],
          ["pending_approval", "Asteapta aprobare"],
          ["processing", "In procesare"],
          ["ready", "Gata"],
          ["invoicing", "Facturare"],
          ["completed", "Complete"],
          ["rejected", "Respinse"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === v
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <Card>
        {orders.length === 0 ? (
          <Empty>Nu exista comenzi.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Nr.</th>
                  <th className="px-4 py-3">Responsabil</th>
                  <th className="px-4 py-3">Produse</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr
                    key={o._id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => openDetail(o._id)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {o.number}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.responsible?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {o.items.length} produse
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700">
                      {money(o.total)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={stageInfo(o.status).color}>
                        {stageInfo(o.status).short}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      <Icon
                        name="chevronRight"
                        className="ml-auto h-4 w-4"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal creare / editare comanda */}
      <Modal
        open={open}
        onClose={cancelForm}
        title={editId ? "Editeaza comanda" : "Comanda noua"}
        width="max-w-3xl"
        footer={
          <>
            <Button variant="secondary" onClick={cancelForm}>
              Anuleaza
            </Button>
            <Button onClick={submit} disabled={loading}>
              {loading
                ? "Se salveaza…"
                : editId
                  ? isAdmin
                    ? "Salveaza modificarile"
                    : "Trimite spre aprobare"
                  : "Creeaza comanda"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Responsabil comanda">
              {isAdmin ? (
                <Select
                  value={responsible}
                  onChange={(e) => setResponsible(e.target.value)}
                >
                  <option value="">— eu ({user.name}) —</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.role === "admin" ? "admin" : "manager"})
                    </option>
                  ))}
                </Select>
              ) : (
                <Input value={user.name} disabled />
              )}
            </Field>
            <Field label="Client (optional)">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Numele clientului"
              />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Produse in comanda
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2} />
                Adauga produs
              </Button>
            </div>

            <div className="space-y-2">
              {lines.map((l, i) => {
                const p = productById[l.product];
                const available = stockOf(p, l.warehouse);
                const lineTotal = p ? p.price * (Number(l.quantity) || 0) : 0;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Select
                          value={l.product}
                          onChange={(e) =>
                            setLine(i, { product: e.target.value })
                          }
                        >
                          <option value="">— produs —</option>
                          {products.map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.name} ({money(p.price)}/{UNIT_LABELS[p.unit]})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Select
                          value={l.warehouse}
                          onChange={(e) =>
                            setLine(i, { warehouse: e.target.value })
                          }
                        >
                          <option value="">— depozit —</option>
                          {warehouses.map((w) => (
                            <option key={w._id} value={w._id}>
                              {w.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Cant."
                          value={l.quantity}
                          onChange={(e) =>
                            setLine(i, { quantity: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between sm:col-span-2">
                        <span className="text-sm font-semibold text-slate-700">
                          {money(lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Icon name="x" className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                    {l.product && l.warehouse && (
                      <div
                        className={`mt-1 text-xs ${
                          available < (Number(l.quantity) || 0)
                            ? "text-rose-500"
                            : "text-slate-400"
                        }`}
                      >
                        Stoc disponibil in depozit: {available} {p && UNIT_LABELS[p.unit]}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Field label="Nota">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Observatii (optional)"
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3">
            <span className="font-medium text-slate-700">Total comanda</span>
            <span className="text-xl font-bold text-indigo-700">
              {money(total)}
            </span>
          </div>

          {!isAdmin && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Icon name="info" className="mt-px h-4 w-4 shrink-0" />
              {editId
                ? "Modificarea va fi trimisa spre aprobarea administratorului. Comanda ramane neschimbata pana la aprobare."
                : "Comanda va fi trimisa spre aprobare administratorului. Stocul se scade dupa aprobare."}
            </p>
          )}
        </form>
      </Modal>

      {/* Modal detaliu comanda */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `Comanda ${detail.number}` : ""}
        width="max-w-2xl"
        footer={
          detail && (
            <div className="flex w-full items-center justify-between">
              <div className="flex gap-1">
                {!["rejected", "completed"].includes(detail.status) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(detail)}
                  >
                    <Icon name="edit" className="h-4 w-4" />
                    Editeaza
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/factura/${detail._id}`, "_blank")}
                >
                  <Icon name="printer" className="h-4 w-4" />
                  Factura
                </Button>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => remove(detail._id)}>
                    <Icon name="trash" className="h-4 w-4" />
                    Sterge
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {isAdmin &&
                  (detail.status === "pending_approval" ||
                    detail.status === "new") && (
                    <>
                      <Button
                        variant="danger"
                        onClick={() => decide(detail._id, "reject")}
                      >
                        Respinge
                      </Button>
                      <Button
                        variant="success"
                        onClick={() => decide(detail._id, "approve")}
                      >
                        Aproba
                      </Button>
                    </>
                  )}
                {["processing", "ready", "invoicing"].includes(detail.status) &&
                  nextStage(detail.status) && (
                    <Button
                      variant="primary"
                      onClick={() => setStage(detail._id, nextStage(detail.status))}
                    >
                      Avanseaza la {stageInfo(nextStage(detail.status)).label}
                      <Icon name="arrowRight" className="h-4 w-4" />
                    </Button>
                  )}
                <Button variant="secondary" onClick={() => setDetail(null)}>
                  Inchide
                </Button>
              </div>
            </div>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            {/* Stadiul comenzii */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-4">
              <StageStepper status={detail.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <span className="text-xs text-slate-400">Responsabil</span>
                <div className="font-medium text-slate-700">
                  {detail.responsible?.name || "—"}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400">Creata de</span>
                <div className="font-medium text-slate-700">
                  {detail.createdBy?.name || "—"}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400">Aprobata de</span>
                <div className="font-medium text-slate-700">
                  {detail.approvedBy?.name || "—"}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400">Client</span>
                <div className="font-medium text-slate-700">
                  {detail.customerName || "—"}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">Produs</th>
                    <th className="px-3 py-2">Depozit</th>
                    <th className="px-3 py-2">Cant.</th>
                    <th className="px-3 py-2">Pret</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.items.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">
                        {it.productName}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {it.warehouse?.name || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {it.quantity} {UNIT_LABELS[it.unit]}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {money(it.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-700">
                        {money(it.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.note && (
              <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                {detail.note}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-4 py-3">
              <span className="font-medium text-slate-700">Total</span>
              <span className="text-xl font-bold text-indigo-700">
                {money(detail.total)}
              </span>
            </div>

            {/* Modificare propusa de un manager — in asteptarea aprobarii */}
            {detail.pendingEdit && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <Icon name="edit" className="h-4 w-4" />
                  Modificare propusa de{" "}
                  {detail.pendingEdit.requestedByName || "manager"}
                </div>
                <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-amber-100 text-left text-xs uppercase text-slate-500">
                        <th className="px-3 py-2">Produs</th>
                        <th className="px-3 py-2">Depozit</th>
                        <th className="px-3 py-2">Cant.</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.pendingEdit.items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-700">
                            {it.productName}
                          </td>
                          <td className="px-3 py-2 text-slate-500">
                            {it.warehouse?.name || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {it.quantity} {UNIT_LABELS[it.unit]}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700">
                            {money(it.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-slate-500">
                    Total actual:{" "}
                    <span className="font-medium text-slate-600">
                      {money(detail.total)}
                    </span>
                  </span>
                  <span className="font-semibold text-amber-800">
                    Total propus: {money(detail.pendingEdit.total)}
                  </span>
                </div>
                {(detail.pendingEdit.customerName !== detail.customerName ||
                  detail.pendingEdit.note !== detail.note) && (
                  <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                    {detail.pendingEdit.customerName !== detail.customerName && (
                      <div>
                        Client: „{detail.customerName || "—"}" → „
                        {detail.pendingEdit.customerName || "—"}"
                      </div>
                    )}
                    {detail.pendingEdit.note !== detail.note && (
                      <div>
                        Nota: „{detail.note || "—"}" → „
                        {detail.pendingEdit.note || "—"}"
                      </div>
                    )}
                  </div>
                )}
                {isAdmin && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => editDecision(detail._id, "reject_edit")}
                    >
                      Respinge modificarea
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => editDecision(detail._id, "approve_edit")}
                    >
                      Aproba modificarea
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Istoricul comenzii */}
            {history.length > 0 && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Icon name="history" className="h-4 w-4 text-slate-500" />
                  Istoric comanda
                </div>
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h._id} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                      <div className="flex-1">
                        <span className="font-medium text-slate-700">
                          {h.userName}
                        </span>{" "}
                        <span className="text-slate-500">{h.label}</span>
                        {h.details && (
                          <span className="text-slate-400"> · {h.details}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-slate-400">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
