"use client";

import { useState } from "react";
import Link from "next/link";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser } from "@/app/_components/user";
import { money, moneyShort, num } from "@/lib/format";
import { WAREHOUSE_TYPES } from "@/lib/constants";
import { Card, PageHeader, Button, Field, Input, Select, Textarea, Switch, Badge, EmptyState, Skeleton, cx } from "@/app/_components/ui";
import { Modal, Menu, useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, Warehouse, Storefront, Truck, DotsThree, PencilSimple, Trash, Star, MapPin, Globe } from "@/app/_components/icons";

const ICON = { warehouse: Warehouse, store: Storefront, vehicle: Truck };
const EMPTY = { name: "", code: "", type: "warehouse", address: "", note: "", syncToSite: true, isDefault: false, active: true };

function WarehouseForm(props) {
  return props.open ? <WarehouseFormBody {...props} /> : null;
}

function WarehouseFormBody({ open, onClose, wh, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => (wh ? { ...EMPTY, ...Object.fromEntries(Object.entries(wh).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ""])) } : EMPTY));
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      wh ? await apiPatch(`/api/warehouses/${wh._id}`, f) : await apiPost("/api/warehouses", f);
      toast(wh ? "Depozitul a fost actualizat" : "Depozitul a fost creat");
      invalidate("/api/warehouses", "/api/stock", "/api/settings");
      onSaved();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={wh ? "Editare depozit" : "Depozit nou"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" loading={busy} disabled={!f.name.trim()} onClick={save}>{wh ? "Salvează" : "Creează"}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label="Denumire" required><Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Magazin Lunca Bîcului" /></Field>
          <Field label="Cod" hint="pentru 1C"><Input value={f.code} onChange={(e) => set({ code: e.target.value })} placeholder="MAG-1" /></Field>
        </div>
        <Field label="Tip">
          <Select value={f.type} onChange={(e) => set({ type: e.target.value })}>
            {WAREHOUSE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        <Field label="Adresă"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
        <Field label="Notă"><Textarea rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        <Switch checked={f.syncToSite} onChange={(v) => set({ syncToSite: v })} label="Stocul apare pe site" description="Cantitatea din acest depozit se adună la stocul publicat pe luxstore.md." />
        <Switch checked={f.isDefault} onChange={(v) => set({ isDefault: v })} label="Depozit implicit" description="Propus automat în comenzi și recepții." />
        {wh && <Switch checked={f.active} onChange={(v) => set({ active: v })} label="Activ" />}
      </div>
    </Modal>
  );
}

export default function WarehousesPage() {
  const user = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = user.role === "admin";
  const { data, reload } = useApi("/api/warehouses?stats=1&all=1");
  const [form, setForm] = useState({ open: false, wh: null });

  const remove = async (w) => {
    if (!(await confirm({ title: `Ștergeți depozitul „${w.name}”?`, message: "Depozitul trebuie să fie gol. Dacă are istoric, va fi dezactivat.", tone: "danger", confirmLabel: "Șterge" }))) return;
    try {
      const r = await apiDelete(`/api/warehouses/${w._id}`);
      toast(r.deactivated ? "Depozitul are istoric — a fost dezactivat" : "Depozitul a fost șters");
      invalidate("/api/warehouses");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const makeDefault = async (w) => {
    try {
      await apiPatch(`/api/warehouses/${w._id}`, { isDefault: true });
      invalidate("/api/warehouses", "/api/settings");
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="Depozite"
        description="Locurile unde se ține marfa: depozitul central, magazinul, mașina de livrare."
        actions={isAdmin && <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, wh: null })}>Depozit nou</Button>}
      />
      {!data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : data.length === 0 ? (
        <Card><EmptyState icon={Warehouse} title="Niciun depozit" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((w) => {
            const IconC = ICON[w.type] || Warehouse;
            return (
              <Card key={w._id} className={cx("flex flex-col", w.active === false && "opacity-60")}>
                <div className="flex items-start gap-3 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <IconC size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-[15px] font-semibold text-fg">{w.name}</h3>
                      {w.isDefault && <Badge tone="accent">Implicit</Badge>}
                      {w.active === false && <Badge tone="bad">Inactiv</Badge>}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-fg-3">
                      {WAREHOUSE_TYPES.find((t) => t.key === w.type)?.label || "Depozit"}
                      {w.code ? ` · ${w.code}` : ""}
                    </div>
                    {w.address && <div className="mt-1 flex items-center gap-1 text-[12.5px] text-fg-3"><MapPin size={13} />{w.address}</div>}
                  </div>
                  {isAdmin && (
                    <Menu
                      trigger={<Button size="sm" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
                      items={[
                        { label: "Editează", icon: PencilSimple, onClick: () => setForm({ open: true, wh: w }) },
                        !w.isDefault && { label: "Setează ca implicit", icon: Star, onClick: () => makeDefault(w) },
                        { divider: true },
                        { label: "Șterge", icon: Trash, danger: true, onClick: () => remove(w) },
                      ]}
                    />
                  )}
                </div>
                <div className="mt-auto grid grid-cols-3 divide-x divide-line border-t border-line">
                  {[["Poziții", num(w.stats.positions)], ["Unități", num(w.stats.units)], ["Valoare", moneyShort(w.stats.value)]].map(([k, v]) => (
                    <div key={k} className="px-4 py-3">
                      <div className="text-[11.5px] text-fg-3">{k}</div>
                      <div className="tnum mt-0.5 text-[15px] font-semibold text-fg">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[12.5px]">
                  <span className="flex items-center gap-1.5 text-fg-3"><Globe size={14} />{w.syncToSite !== false ? "Stoc publicat pe site" : "Nu apare pe site"}</span>
                  <Link href={`/stoc?warehouse=${w._id}`} className="font-medium text-accent hover:underline">Vezi stocul</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {data && <p className="mt-4 text-[12.5px] text-fg-3">Valoare totală (preț de vânzare): <span className="tnum font-medium text-fg">{money(data.reduce((t, w) => t + w.stats.value, 0))}</span> · la cost: <span className="tnum font-medium text-fg">{money(data.reduce((t, w) => t + w.stats.cost, 0))}</span></p>}
      <WarehouseForm open={form.open} wh={form.wh} onClose={() => setForm({ open: false, wh: null })} onSaved={reload} />
    </div>
  );
}
