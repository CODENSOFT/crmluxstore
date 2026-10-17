"use client";

import { Suspense, useState } from "react";
import { apiPatch, apiPut } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useQueryState } from "@/lib/useQueryState";
import { useUser } from "@/app/_components/user";
import { roleLabel } from "@/lib/constants";
import { Card, CardHeader, PageHeader, Tabs, Field, Input, NumberInput, PasswordInput, Select, Textarea, Switch, Button, Skeleton, IconButton, Avatar } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { Buildings, Receipt, Truck, Stack, UserCircle, Lock, Plus, Trash, FloppyDisk } from "@/app/_components/icons";

function SaveBar({ busy, onSave, dirty }) {
  return (
    <div className="flex justify-end border-t border-line bg-surface-2/50 px-5 py-3.5">
      <Button variant="primary" icon={FloppyDisk} loading={busy} disabled={!dirty} onClick={onSave}>
        Salvează
      </Button>
    </div>
  );
}

function useSettingsForm({ s, onSaved }) {
  const toast = useToast();
  const { data: warehouses } = useApi("/api/warehouses");
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const set = (p) => {
    setF((x) => ({ ...x, ...p }));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const res = await apiPut("/api/settings", f);
      invalidate("/api/settings", "/api/dashboard");
      onSaved(res);
      setDirty(false);
      toast("Setările au fost salvate");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return { f, set, save, busy, dirty, warehouses };
}

function Section({ title, description, icon, children, footer }) {
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} />
      <div className="px-5 pb-5">{children}</div>
      {footer}
    </Card>
  );
}

function AdminSettings({ tab, s, onSaved }) {
  const { f, set, save, busy, dirty, warehouses } = useSettingsForm({ s, onSaved });
  if (tab === "companie")
    return (
      <Section title="Datele companiei" description="Apar pe facturi, avize și celelalte documente tipărite." icon={Buildings} footer={<SaveBar busy={busy} dirty={dirty} onSave={save} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Denumire comercială"><Input value={f.companyName || ""} onChange={(e) => set({ companyName: e.target.value })} /></Field>
          <Field label="Denumire juridică" hint="ex: „Lux Store” SRL"><Input value={f.legalName || ""} onChange={(e) => set({ legalName: e.target.value })} /></Field>
          <Field label="IDNO"><Input value={f.idno || ""} onChange={(e) => set({ idno: e.target.value })} maxLength={13} /></Field>
          <Field label="Cod TVA"><Input value={f.vatCode || ""} onChange={(e) => set({ vatCode: e.target.value })} /></Field>
          <Field label="IBAN"><Input value={f.iban || ""} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} /></Field>
          <Field label="Banca"><Input value={f.bank || ""} onChange={(e) => set({ bank: e.target.value })} /></Field>
          <Field label="Cod bancă (BIC)"><Input value={f.bankCode || ""} onChange={(e) => set({ bankCode: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={f.phone || ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Adresă" className="sm:col-span-2"><Input value={f.address || ""} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Email"><Input value={f.email || ""} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Website"><Input value={f.website || ""} onChange={(e) => set({ website: e.target.value })} /></Field>
          <Field label="Text pe factură" className="sm:col-span-2"><Textarea rows={2} value={f.invoiceTerms || ""} onChange={(e) => set({ invoiceTerms: e.target.value })} /></Field>
        </div>
      </Section>
    );
  if (tab === "vanzari")
    return (
      <Section title="Vânzări și TVA" icon={Receipt} footer={<SaveBar busy={busy} dirty={dirty} onSave={save} />}>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Monedă"><Input value={f.currency || "MDL"} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} maxLength={3} /></Field>
            <Field label="Cota TVA standard"><NumberInput value={f.vatRate ?? 20} onChange={(v) => set({ vatRate: v })} suffix="%" /></Field>
          </div>
          <Switch checked={f.vatPayer !== false} onChange={(v) => set({ vatPayer: v })} label="Plătitor de TVA" description="Facturile afișează TVA-ul separat." />
          <Switch checked={f.pricesIncludeVat !== false} onChange={(v) => set({ pricesIncludeVat: v })} label="Prețurile includ TVA" description="Cum sunt afișate pe site și în magazin (recomandat)." />
          <Switch checked={!!f.requireApproval} onChange={(v) => set({ requireApproval: v })} label="Comenzile managerilor necesită aprobarea administratorului" description="Stocul se rezervă abia după aprobare. Dezactivat: comenzile managerilor intră direct în pregătire." />
        </div>
      </Section>
    );
  if (tab === "livrare") {
    const methods = f.deliveryMethods || [];
    const upd = (i, p) => set({ deliveryMethods: methods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
    return (
      <Section title="Metode de livrare" description="Costurile se propun automat în comenzi (se pot modifica pe fiecare comandă)." icon={Truck} footer={<SaveBar busy={busy} dirty={dirty} onSave={save} />}>
        <div className="space-y-2">
          {methods.map((m, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_auto_36px] items-center gap-2">
              <Input value={m.label} onChange={(e) => upd(i, { label: e.target.value })} />
              <NumberInput value={m.cost} onChange={(v) => upd(i, { cost: v })} suffix="MDL" />
              <Switch checked={m.active !== false} onChange={(v) => upd(i, { active: v })} />
              <IconButton icon={Trash} label="Elimină" variant="danger-ghost" onClick={() => set({ deliveryMethods: methods.filter((_, j) => j !== i) })} disabled={m.key === "pickup"} />
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ deliveryMethods: [...methods, { key: "", label: "Metodă nouă", cost: 0, active: true }] })}>
            Adaugă metodă
          </Button>
        </div>
      </Section>
    );
  }
  if (tab === "stoc")
    return (
      <Section title="Stoc" icon={Stack} footer={<SaveBar busy={busy} dirty={dirty} onSave={save} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prag implicit de stoc minim" hint="Folosit pentru produsele fără prag propriu"><NumberInput value={f.lowStockThreshold ?? 5} onChange={(v) => set({ lowStockThreshold: v })} /></Field>
          <Field label="Depozit implicit" hint="Propus în comenzi și recepții">
            <Select value={f.defaultWarehouse || ""} onChange={(e) => set({ defaultWarehouse: e.target.value })}>
              {(warehouses || []).map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
            </Select>
          </Field>
          <Field label="Adresa publică a CRM-ului" hint="Pentru linkurile din integrări (gol = automat)" className="sm:col-span-2"><Input value={f.publicUrl || ""} onChange={(e) => set({ publicUrl: e.target.value })} placeholder="https://crmluxstore.vercel.app" /></Field>
        </div>
      </Section>
    );
  return null;
}

function Profile() {
  const { data: me, mutate } = useApi("/api/profile");
  if (!me) return <Skeleton className="h-64" />;
  return <ProfileForm me={me} mutate={mutate} />;
}

function ProfileForm({ me, mutate }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ name: me.name, email: me.email, phone: me.phone || "" }));
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(null);
  const saveProfile = async () => {
    setBusy("p");
    try {
      mutate(await apiPatch("/api/profile", f));
      toast("Profilul a fost salvat");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  const savePw = async () => {
    if (pw.newPassword !== pw.confirm) return toast("Parolele noi nu coincid", "error");
    setBusy("w");
    try {
      await apiPatch("/api/profile", pw);
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      toast("Parola a fost schimbată");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-4">
      <Section title="Profilul meu" icon={UserCircle} footer={<div className="flex justify-end border-t border-line bg-surface-2/50 px-5 py-3.5"><Button variant="primary" loading={busy === "p"} onClick={saveProfile}>Salvează profilul</Button></div>}>
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={f.name} size={44} />
          <div>
            <div className="text-[15px] font-semibold text-fg">{me.name}</div>
            <div className="text-[12.5px] text-fg-3">{roleLabel(me.role)}</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nume"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email (login)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
      </Section>
      <Section title="Schimbare parolă" icon={Lock} footer={<div className="flex justify-end border-t border-line bg-surface-2/50 px-5 py-3.5"><Button variant="primary" loading={busy === "w"} disabled={!pw.currentPassword || pw.newPassword.length < 6} onClick={savePw}>Schimbă parola</Button></div>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Parola actuală"><PasswordInput value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="Parola nouă" hint="Minim 6 caractere"><PasswordInput value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Field label="Repetați parola nouă"><PasswordInput value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
        </div>
      </Section>
    </div>
  );
}

function Inner() {
  const user = useUser();
  const isAdmin = user.role === "admin";
  const [q, setQ] = useQueryState({ tab: isAdmin ? "companie" : "profil" });
  const { data: s, mutate } = useApi(isAdmin ? "/api/settings" : null);
  const tabs = isAdmin
    ? [
        { key: "companie", label: "Companie" },
        { key: "vanzari", label: "Vânzări și TVA" },
        { key: "livrare", label: "Livrare" },
        { key: "stoc", label: "Stoc" },
        { key: "profil", label: "Profilul meu" },
      ]
    : [{ key: "profil", label: "Profilul meu" }];
  return (
    <div className="animate-in">
      <PageHeader title="Setări" description={isAdmin ? "Datele companiei, TVA, livrare, stoc și contul personal." : "Datele contului și parola."} />
      <Tabs className="mb-5" value={q.tab} onChange={(t) => setQ({ tab: t })} tabs={tabs} />
      <div className="max-w-4xl">
        {q.tab === "profil" ? <Profile /> : !s ? <Skeleton className="h-80" /> : <AdminSettings key={`${q.tab}-${s.updatedAt}`} tab={q.tab} s={s} onSaved={mutate} />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
