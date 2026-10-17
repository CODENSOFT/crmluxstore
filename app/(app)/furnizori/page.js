"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser } from "@/app/_components/user";
import { money, formatDate, relativeTime, num } from "@/lib/format";
import { Card, PageHeader, Button, Field, Input, NumberInput, Textarea, SearchInput, EmptyState, Badge, Avatar, DetailList, Skeleton, Switch } from "@/app/_components/ui";
import { DataTable, Toolbar } from "@/app/_components/table";
import { Drawer, useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, Truck, PencilSimple, Trash, Phone, EnvelopeSimple, Globe } from "@/app/_components/icons";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", website: "", address: "", country: "", idno: "", iban: "", paymentTermDays: "", brands: "", note: "", active: true };

function SupplierForm(props) {
  return props.open ? <SupplierFormBody {...props} /> : null;
}

function SupplierFormBody({ open, onClose, supplier, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() =>
    supplier
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(supplier).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ""])), brands: (supplier.brands || []).join(", "), paymentTermDays: supplier.paymentTermDays ? String(supplier.paymentTermDays) : "" }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f, paymentTermDays: Number(f.paymentTermDays) || 0 };
      const res = supplier ? await apiPatch(`/api/suppliers/${supplier._id}`, body) : await apiPost("/api/suppliers", body);
      toast(supplier ? "Furnizorul a fost actualizat" : `Furnizorul „${res.name}” a fost adăugat`);
      invalidate("/api/suppliers");
      onSaved?.(res);
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={supplier ? "Editare furnizor" : "Furnizor nou"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={save}>{supplier ? "Salvează" : "Adaugă"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Denumire" required>
          <Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex: Koch-Chemie Distribuție" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Persoană de contact"><Input value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Website"><Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>
          <Field label="Țara"><Input value={f.country} onChange={(e) => set({ country: e.target.value })} placeholder="Moldova, România, Germania…" /></Field>
          <Field label="Termen de plată"><NumberInput value={f.paymentTermDays} onChange={(v) => set({ paymentTermDays: v })} suffix="zile" placeholder="0" /></Field>
          <Field label="IDNO / cod fiscal"><Input value={f.idno} onChange={(e) => set({ idno: e.target.value })} /></Field>
          <Field label="IBAN"><Input value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Adresă"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Mărci livrate" hint="Separate prin virgulă"><Input value={f.brands} onChange={(e) => set({ brands: e.target.value })} placeholder="Koch-Chemie, FOX LINE" /></Field>
        <Field label="Notițe"><Textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Condiții, termene de livrare, comandă minimă…" /></Field>
        {supplier && <Switch checked={f.active} onChange={(v) => set({ active: v })} label="Furnizor activ" />}
      </div>
    </Drawer>
  );
}

function SupplierDetail({ id, onClose, onEdit }) {
  const { data: s } = useApi(id ? `/api/suppliers/${id}` : null, { keepPrevious: false });
  return (
    <Drawer open={!!id} onClose={onClose} title={s?.name || "Furnizor"} description={s?.country} width="max-w-2xl" headerAction={s && <Button size="sm" icon={PencilSimple} onClick={() => onEdit(s)}>Editează</Button>}>
      {!s ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-fg-2 hover:text-accent"><Phone size={15} />{s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 text-fg-2 hover:text-accent"><EnvelopeSimple size={15} />{s.email}</a>}
            {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-fg-2 hover:text-accent"><Globe size={15} />{s.website.replace(/^https?:\/\//, "")}</a>}
          </div>
          <DetailList cols={2} items={[["Persoană de contact", s.contactPerson], ["IDNO", s.idno], ["IBAN", s.iban], ["Adresă", s.address], ["Termen de plată", s.paymentTermDays ? `${s.paymentTermDays} zile` : null], ["Mărci", (s.brands || []).join(", ")]]} />
          {s.note && <p className="whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-fg-2">{s.note}</p>}
          <div>
            <h4 className="mb-2 text-[13px] font-semibold text-fg">Recepții de la acest furnizor</h4>
            {s.arrivals?.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {s.arrivals.map((a) => (
                  <li key={a._id}>
                    <Link href={`/receptie/${a._id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-2">
                      <span>
                        <span className="font-medium text-fg">{a.number || "Recepție"}</span>
                        <span className="ml-2 text-fg-3">{formatDate(a.createdAt)} · {a.warehouse?.name}{a.supplierInvoice ? ` · fact. ${a.supplierInvoice}` : ""}</span>
                      </span>
                      <span className="tnum font-medium text-fg">{money(a.total || 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">Nicio recepție încă.</p>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Inner() {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useQueryState({});
  const [formState, setForm] = useState({ open: false, supplier: null });
  // ?nou=1 (ex: din Receptie) deschide direct formularul
  const form = f.nou === "1" ? { open: true, supplier: null } : formState;
  const { data, loading, error, reload } = useApi(`/api/suppliers${f.q ? `?q=${encodeURIComponent(f.q)}` : ""}`);

  const remove = async (s) => {
    if (!(await confirm({ title: `Ștergeți furnizorul „${s.name}”?`, message: "Dacă are recepții, va fi doar dezactivat.", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      const r = await apiDelete(`/api/suppliers/${s._id}`);
      toast(r.deactivated ? "Furnizorul are recepții — a fost dezactivat" : "Furnizorul a fost șters");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Furnizor",
      render: (s) => (
        <div className="flex min-w-[200px] items-center gap-3">
          <Avatar name={s.name} size={32} />
          <div className="min-w-0">
            <div className="truncate font-medium text-fg">{s.name}</div>
            <div className="truncate text-[12px] text-fg-3">{[s.contactPerson, s.country].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        </div>
      ),
    },
    { key: "contact", header: "Contact", className: "hidden md:table-cell", headClassName: "hidden md:table-cell", render: (s) => <div className="text-[12.5px]"><div className="text-fg-2">{s.phone || "—"}</div>{s.email && <div className="text-fg-3">{s.email}</div>}</div> },
    { key: "brands", header: "Mărci", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (s) => <div className="flex flex-wrap gap-1">{(s.brands || []).slice(0, 4).map((b) => <Badge key={b}>{b}</Badge>)}</div> },
    { key: "arrivals", header: "Recepții", align: "right", render: (s) => <span className="tnum">{s.stats.arrivals}</span> },
    { key: "total", header: "Total achiziții", align: "right", render: (s) => <span className="tnum font-medium text-fg">{money(s.stats.total)}</span> },
    { key: "last", header: "Ultima", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (s) => <span className="text-[12.5px] text-fg-3">{s.stats.lastArrivalAt ? relativeTime(s.stats.lastArrivalAt) : "—"}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex justify-end gap-1" data-stop>
          <Button size="xs" variant="ghost" icon={PencilSimple} onClick={() => setForm({ open: true, supplier: s })} aria-label="Editează" />
          {user.role === "admin" && <Button size="xs" variant="danger-ghost" icon={Trash} onClick={() => remove(s)} aria-label="Șterge" />}
        </div>
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader title="Furnizori" description="De la cine aducem marfa: contacte, condiții și istoricul recepțiilor." actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, supplier: null })}>Furnizor nou</Button>} />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchInput value={f.q} onChange={(v) => setF({ q: v })} placeholder="Caută furnizor…" className="w-full sm:w-64" />
          {data && <span className="ml-auto text-[12.5px] text-fg-3">{num(data.length)} furnizori · achiziții totale <span className="tnum font-medium text-fg">{money(data.reduce((t, s) => t + s.stats.total, 0))}</span></span>}
        </Toolbar>
        <DataTable columns={columns} rows={data} loading={loading} error={error} onRetry={reload} onRowClick={(s) => setF({ open: s._id })} empty={<EmptyState icon={Truck} title="Niciun furnizor" action={<Button size="sm" variant="primary" icon={Plus} onClick={() => setForm({ open: true, supplier: null })}>Adaugă furnizor</Button>} />} />
      </Card>
      <SupplierForm open={form.open} supplier={form.supplier} onClose={() => { setForm({ open: false, supplier: null }); if (f.nou) setF({ nou: "" }); }} onSaved={() => reload()} />
      <SupplierDetail id={f.open} onClose={() => setF({ open: "" })} onEdit={(s) => { setF({ open: "" }); setForm({ open: true, supplier: s }); }} />
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
