"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser } from "@/app/_components/user";
import { moneyShort, relativeTime, formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/constants";
import { Card, PageHeader, Button, Field, Input, PasswordInput, Select, Badge, Avatar, EmptyState, Alert } from "@/app/_components/ui";
import { DataTable } from "@/app/_components/table";
import { Modal, Menu, useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, UserGear, DotsThree, PencilSimple, Trash, Prohibit, CheckCircle, Key, Info } from "@/app/_components/icons";

function UserForm(props) {
  return props.open ? <UserFormBody {...props} /> : null;
}

function UserFormBody({ open, onClose, u, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ name: u?.name || "", email: u?.email || "", phone: u?.phone || "", position: u?.position || "", role: u?.role || "manager", password: "" }));
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...f };
      if (u && !body.password) delete body.password;
      u ? await apiPatch(`/api/users/${u._id}`, body) : await apiPost("/api/users", body);
      toast(u ? "Utilizatorul a fost actualizat" : `Contul pentru ${f.name} a fost creat`);
      invalidate("/api/users");
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
      title={u ? "Editare utilizator" : "Utilizator nou"}
      description={u ? u.email : "Transmiteți colegului emailul și parola. O poate schimba din profilul său."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" loading={busy} disabled={!f.name?.trim() || !f.email?.trim() || (!u && (f.password || "").length < 6)} onClick={save}>{u ? "Salvează" : "Creează contul"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nume" required className="sm:col-span-2"><Input autoFocus value={f.name || ""} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Email (login)" required><Input type="email" value={f.email || ""} onChange={(e) => set({ email: e.target.value })} /></Field>
        <Field label="Telefon"><Input value={f.phone || ""} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Funcție"><Input value={f.position || ""} onChange={(e) => set({ position: e.target.value })} placeholder="ex: Vânzări B2B" /></Field>
        <Field label="Rol">
          <Select value={f.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="manager">Manager</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <Field label={u ? "Parolă nouă" : "Parolă"} required={!u} hint={u ? "Lăsați gol pentru a păstra parola" : "Minim 6 caractere"} className="sm:col-span-2">
          <PasswordInput value={f.password || ""} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
        </Field>
      </div>
      <Alert className="mt-4" tone="info" icon={Info}>
        <b>Manager</b>: vede comenzile și sarcinile proprii, creează comenzi (cu aprobare), recepții, transferuri. <b>Administrator</b>: acces complet, aprobări, setări, integrări.
      </Alert>
    </Modal>
  );
}

export default function UsersPage() {
  const me = useUser();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useApi("/api/users?stats=1");
  const [form, setForm] = useState({ open: false, u: null });

  const toggleActive = async (u) => {
    try {
      await apiPatch(`/api/users/${u._id}`, { active: !u.active });
      toast(u.active ? `${u.name} nu mai are acces` : `${u.name} are din nou acces`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  const remove = async (u) => {
    if (!(await confirm({ title: `Ștergeți contul lui ${u.name}?`, message: "Recomandat: dezactivați contul — istoricul comenzilor rămâne legat de nume.", tone: "danger", confirmLabel: "Șterge contul" }))) return;
    try {
      await apiDelete(`/api/users/${u._id}`);
      reload();
    } catch (e) {
      toast(e.message, "error");
    }
  };

  const columns = [
    {
      key: "name",
      header: "Utilizator",
      render: (u) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <Avatar name={u.name} size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-fg">
              {u.name}
              {String(u._id) === me.id && <Badge>Tu</Badge>}
            </div>
            <div className="truncate text-[12px] text-fg-3">{u.email}{u.position ? ` · ${u.position}` : ""}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Rol", render: (u) => <Badge tone={u.role === "admin" ? "violet" : "neutral"}>{roleLabel(u.role)}</Badge> },
    { key: "status", header: "Acces", render: (u) => <Badge tone={u.active ? "ok" : "bad"} dot>{u.active ? "Activ" : "Dezactivat"}</Badge> },
    { key: "month", header: "Vânzări luna aceasta", align: "right", render: (u) => <span className="tnum">{u.month?.orders || 0} cmd. · <span className="font-medium text-fg">{moneyShort(u.month?.revenue)}</span></span> },
    { key: "login", header: "Ultima autentificare", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (u) => <span className="text-[12.5px] text-fg-3" title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "niciodată"}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (u) => (
        <div data-stop>
          <Menu
            trigger={<Button size="xs" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
            items={[
              { label: "Editează", icon: PencilSimple, onClick: () => setForm({ open: true, u }) },
              { label: "Schimbă parola", icon: Key, onClick: () => setForm({ open: true, u }) },
              String(u._id) !== me.id && { label: u.active ? "Dezactivează accesul" : "Reactivează accesul", icon: u.active ? Prohibit : CheckCircle, onClick: () => toggleActive(u) },
              String(u._id) !== me.id && { divider: true },
              String(u._id) !== me.id && { label: "Șterge contul", icon: Trash, danger: true, onClick: () => remove(u) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader title="Utilizatori" description="Echipa Lux Store: conturi, roluri și accesul la CRM." actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, u: null })}>Utilizator nou</Button>} />
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={data} loading={loading} onRowClick={(u) => setForm({ open: true, u })} empty={<EmptyState icon={UserGear} title="Niciun utilizator" />} />
      </Card>
      <UserForm open={form.open} u={form.u} onClose={() => setForm({ open: false, u: null })} onSaved={reload} />
    </div>
  );
}
