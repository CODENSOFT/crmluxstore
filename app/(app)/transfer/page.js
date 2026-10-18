"use client";

import { Suspense, useState } from "react";
import { apiPost } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { num, formatDateTime, relativeTime } from "@/lib/format";
import { Card, PageHeader, Button, Select, SearchInput, Field, Textarea, EmptyState, Alert } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Drawer, useToast } from "@/app/_components/overlay";
import { Plus, ArrowsLeftRight, ArrowRight, Warning } from "@/app/_components/icons";
import { DocLinesEditor, linesPayload, linesValid } from "../_stockdoc";

function TransferForm(props) {
  return props.open ? <TransferFormBody {...props} /> : null;
}

function TransferFormBody({ open, onClose }) {
  const toast = useToast();
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const [fromSel, setFrom] = useState("");
  const [toSel, setTo] = useState("");
  const from = fromSel || (warehouses?.[0] ? String(warehouses[0]._id) : "");
  const to = toSel || (warehouses?.[1] ? String(warehouses[1]._id) : "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiPost("/api/transfers", { fromWarehouse: from, toWarehouse: to, note, items: linesPayload(lines) });
      toast(`Transferul ${d.number} a fost efectuat`);
      invalidate("/api/transfers", "/api/products", "/api/stock");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const valid = from && to && from !== to && linesValid(lines, { warehouse: from, checkStock: true, products });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Transfer între depozite"
      description="Mută marfa dintr-un depozit în altul (ex: din depozit în magazin)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" icon={ArrowsLeftRight} loading={saving} disabled={!valid} onClick={save}>
            Efectuează transferul
          </Button>
        </>
      }
    >
      {warehouses && warehouses.length < 2 ? (
        <Alert tone="warn" icon={Warning} title="Aveți un singur depozit">
          Adăugați încă un depozit (ex: „Magazin Lunca Bîcului”) din pagina Depozite.
        </Alert>
      ) : (
        <div className="-mx-5 space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3 px-5">
            <Field label="Din depozitul">
              <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {(warehouses || []).map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ArrowRight size={18} className="mb-2.5 text-fg-3" />
            <Field label="În depozitul">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {(warehouses || []).map((w) => (
                  <option key={w._id} value={w._id} disabled={w._id === from}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DocLinesEditor lines={lines} setLines={setLines} products={products} warehouse={from} checkStock />
          <div className="px-5">
            <Field label="Notă">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: reaprovizionare raft magazin" />
            </Field>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Inner() {
  const [f, setF] = useQueryState({ page: "1" });
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApi(`/api/transfers${qs({ q: f.q, warehouse: f.warehouse, page: f.page, limit: 30 })}`);
  const { data: warehouses } = useApi("/api/warehouses");
  const columns = [
    { key: "number", header: "Transfer", render: (d) => <div><div className="font-medium text-fg">{d.number || "—"}</div><div className="text-[12px] text-fg-3">{formatDateTime(d.createdAt)}</div></div> },
    {
      key: "route",
      header: "Traseu",
      render: (d) => (
        <span className="inline-flex items-center gap-1.5 text-fg-2">
          {d.fromWarehouse?.name} <ArrowRight size={13} className="text-fg-4" /> {d.toWarehouse?.name}
        </span>
      ),
    },
    { key: "items", header: "Produse", render: (d) => <div className="max-w-[360px] truncate text-[12.5px] text-fg-3">{d.items.map((l) => `${l.productName || l.product?.name} × ${num(l.quantity)}`).join(", ")}</div> },
    { key: "by", header: "Efectuat de", align: "right", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name || "—"} · {relativeTime(d.createdAt)}</span> },
  ];
  return (
    <div className="animate-in">
      <PageHeader
        title="Transferuri"
        description="Mutarea mărfii între depozite, magazin și mașina de livrare."
        actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Transfer nou</Button>}
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr sau produs…" className="w-full sm:w-64" />
          <Select value={f.warehouse || ""} onChange={(e) => setF({ warehouse: e.target.value })} className="w-[180px]">
            <option value="">Toate depozitele</option>
            {(warehouses || []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon={ArrowsLeftRight} title="Niciun transfer" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>Transfer nou</Button>} />} />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
      <TransferForm open={open} onClose={() => { setOpen(false); reload(); }} />
    </div>
  );
}

export default function TransfersPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
