"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { useUser, can } from "@/app/_components/user";
import { useApi, qs, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { money, num, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Button, Select, Field, Textarea, Switch, EmptyState, Badge, Progress } from "@/app/_components/ui";
import { DataTable, Pagination, Toolbar } from "@/app/_components/table";
import { Modal, useToast } from "@/app/_components/overlay";
import { Plus, ClipboardText } from "@/app/_components/icons";

const STATUS = { draft: { label: "În desfășurare", tone: "warn" }, completed: { label: "Finalizată", tone: "ok" }, cancelled: { label: "Anulată", tone: "neutral" } };

function NewInventory({ open, onClose }) {
  const router = useRouter();
  const toast = useToast();
  const { data: warehouses } = useApi(open ? "/api/warehouses" : null);
  const { data: categories } = useApi(open ? "/api/categories" : null);
  const [warehouse, setWarehouse] = useState("");
  const [category, setCategory] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const inv = await apiPost("/api/inventory", { warehouse: warehouse || warehouses?.[0]?._id, category: category || undefined, onlyInStock, note });
      invalidate("/api/inventory");
      router.push(`/inventariere/${inv._id}`);
    } catch (e) {
      toast(e.message, "error");
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Inventariere nouă"
      description="Se generează lista produselor cu stocul din sistem. Introduceți apoi cantitățile numărate la raft."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            Începe inventarierea
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Depozit">
          <Select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            {(warehouses || []).map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Doar o categorie" hint="Opțional — pentru inventarieri parțiale, pe zone">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toate categoriile</option>
            {(categories || []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Switch checked={onlyInStock} onChange={setOnlyInStock} label="Doar produsele cu stoc în depozit" />
        <Field label="Notă">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Inner() {
  const user = useUser();
  const [f, setF] = useQueryState({ page: "1" });
  const [open, setOpen] = useState(false);
  const { data, loading, error, reload } = useApi(`/api/inventory${qs({ status: f.status, page: f.page, limit: 30 })}`);
  const columns = [
    { key: "number", header: "Inventariere", render: (d) => <div><div className="font-medium text-fg">{d.number}</div><div className="text-[12px] text-fg-3">{formatDateTime(d.createdAt)}</div></div> },
    { key: "warehouse", header: "Depozit", render: (d) => d.warehouse?.name || "—" },
    { key: "status", header: "Status", render: (d) => <Badge tone={STATUS[d.status]?.tone} dot>{STATUS[d.status]?.label}</Badge> },
    {
      key: "progress",
      header: "Numărate",
      render: (d) => (
        <div className="w-40">
          <div className="tnum mb-1 text-[12px] text-fg-3">
            {d.countedLines} / {d.linesCount}
          </div>
          <Progress value={d.countedLines} max={d.linesCount || 1} tone={d.status === "completed" ? "ok" : "accent"} />
        </div>
      ),
    },
    {
      key: "diff",
      header: "Diferență (cost)",
      align: "right",
      render: (d) => (d.summary ? <span className={`tnum font-medium ${d.summary.valueDiff < 0 ? "text-bad" : d.summary.valueDiff > 0 ? "text-ok" : "text-fg-2"}`}>{money(d.summary.valueDiff)}</span> : <span className="text-fg-4">—</span>),
    },
    { key: "by", header: "Responsabil", align: "right", render: (d) => <span className="text-[12.5px] text-fg-3">{d.createdBy?.name}{d.summary ? ` · ${num(d.summary.shortage)} lipsă / ${num(d.summary.surplus)} plus` : ""}</span> },
  ];
  return (
    <div className="animate-in">
      <PageHeader
        title="Inventariere"
        description="Numărarea fizică a stocului și corectarea automată a diferențelor, cu evidența plusurilor și lipsurilor."
        actions={can(user, "stock.inventory") && <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Inventariere nouă</Button>}
      />
      <Card className="overflow-hidden">
        <Toolbar>
          <Select value={f.status || ""} onChange={(e) => setF({ status: e.target.value })} className="w-[180px]">
            <option value="">Toate</option>
            <option value="draft">În desfășurare</option>
            <option value="completed">Finalizate</option>
            <option value="cancelled">Anulate</option>
          </Select>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} rowHref={(d) => `/inventariere/${d._id}`} empty={<EmptyState icon={ClipboardText} title="Nicio inventariere" description="Recomandat: lunar pentru chimie, trimestrial pentru piese." action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setOpen(true)}>Începe</Button>} />} />
        <Pagination page={Number(f.page) || 1} limit={30} total={data?.total || 0} onChange={(p) => setF({ page: p }, { resetPage: false })} />
      </Card>
      <NewInventory open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
