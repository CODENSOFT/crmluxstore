"use client";

import { Suspense, useState } from "react";
import { apiPost } from "@/lib/client";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, num, formatDateTime, relativeTime } from "@/lib/format";
import { WRITEOFF_REASONS, writeoffReasonLabel } from "@/lib/constants";
import { Card, PageHeader, Button, Select, SearchInput, Field, Input, EmptyState, Badge } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Drawer, useToast } from "@/app/_components/overlay";
import { Plus, TrashSimple } from "@/app/_components/icons";
import { DocLinesEditor, linesPayload, linesValid } from "../_stockdoc";

const TONE = { expired: "warn", damaged: "bad", defect: "bad", internal: "info", sample: "violet", lost: "bad", other: "neutral" };

function WriteoffForm(props) {
  return props.open ? <WriteoffFormBody {...props} /> : null;
}

function WriteoffFormBody({ open, onClose }) {
  const toast = useToast();
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const [whSel, setWarehouse] = useState("");
  const warehouse = whSel || (warehouses?.length ? String((warehouses.find((w) => w.isDefault) || warehouses[0])._id) : "");
  const [reasonCode, setReasonCode] = useState("damaged");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiPost("/api/writeoffs", { warehouse, reasonCode, reason, items: linesPayload(lines) });
      toast(`Casarea ${d.number} a fost înregistrată`);
      invalidate("/api/writeoffs", "/api/products", "/api/stock", "/api/dashboard");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Casare stoc"
      description="Scoaterea din stoc a produselor expirate, deteriorate sau folosite intern."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="danger" icon={TrashSimple} loading={saving} disabled={!warehouse || !linesValid(lines, { warehouse, checkStock: true, products })} onClick={save}>
            Casează produsele
          </Button>
        </>
      }
    >
      <div className="-mx-5 space-y-4">
        <div className="grid gap-3 px-5 sm:grid-cols-2">
          <Field label="Depozit">
            <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
              {(warehouses || []).map((w) => (
                <option key={w._id} value={w._id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Motiv">
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              {WRITEOFF_REASONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Detalii" className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex: canistră fisurată la descărcare" />
          </Field>
        </div>
        <DocLinesEditor lines={lines} setLines={setLines} products={products} warehouse={warehouse} checkStock />
      </div>
    </Drawer>
  );
}

function Inner() {
  const [f, setF] = useQueryState({ page: "1" });
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApi(`/api/writeoffs${qs({ q: f.q, reason: f.reason, warehouse: f.warehouse, page: f.page, limit: 30 })}`);
  const columns = [
    { key: "number", header: "Document", render: (d) => <div><div className="font-medium text-fg">{d.number || "—"}</div><div className="text-[12px] text-fg-3">{formatDateTime(d.createdAt)}</div></div> },
    { key: "reason", header: "Motiv", render: (d) => <div><Badge tone={TONE[d.reasonCode] || "neutral"}>{d.reasonCode ? writeoffReasonLabel(d.reasonCode) : "—"}</Badge>{d.reason && <div className="mt-1 max-w-[260px] truncate text-[12px] text-fg-3">{d.reason}</div>}</div> },
    { key: "items", header: "Produse", render: (d) => <div className="max-w-[340px] truncate text-[12.5px] text-fg-3">{d.items.map((l) => `${l.productName || l.product?.name} × ${num(l.quantity)}`).join(", ")}</div> },
    { key: "warehouse", header: "Depozit", className: "hidden md:table-cell", headClassName: "hidden md:table-cell", render: (d) => d.warehouse?.name || "—" },
    { key: "cost", header: "Pierdere (cost)", align: "right", render: (d) => <span className="tnum font-medium text-fg">{d.totalCost ? money(d.totalCost) : "—"}</span> },
    { key: "by", header: "De", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name || "—"} · {relativeTime(d.createdAt)}</span> },
  ];
  return (
    <div className="animate-in">
      <PageHeader
        title="Casări"
        description="Produse scoase din stoc: expirate, deteriorate, defecte, consum intern sau mostre."
        actions={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Casare nouă</Button>}
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Număr sau produs…" className="w-full sm:w-64" />
          <Select value={f.reason || ""} onChange={(e) => setF({ reason: e.target.value })} className="w-[200px]">
            <option value="">Toate motivele</option>
            {WRITEOFF_REASONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} empty={<EmptyState icon={TrashSimple} title="Nicio casare" description="Nu există casări înregistrate." />} />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
      <WriteoffForm open={open} onClose={() => { setOpen(false); reload(); }} />
    </div>
  );
}

export default function WriteoffsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
