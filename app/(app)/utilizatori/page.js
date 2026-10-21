"use client";

import { useState } from "react";
import { apiDelete, apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, isOwner } from "@/app/_components/user";
import { moneyShort, relativeTime, formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/constants";
import { Card, PageHeader, Button, Field, FormSection, Input, PasswordInput, Checkbox, Badge, Avatar, EmptyState, Select, cx } from "@/app/_components/ui";
import { DataTable } from "@/app/_components/table";
import { Drawer, Menu, useConfirm, useToast } from "@/app/_components/overlay";
import { Plus, UserGear, DotsThree, PencilSimple, Trash, Prohibit, CheckCircle, Key, ShieldCheck, UserCircle } from "@/app/_components/icons";
import { PERMISSIONS, permissionLabel } from "@/lib/permissions";

function UserForm(props) {
  return props.open ? <UserFormBody {...props} /> : null;
}

// Ce poate face orice angajat, fara drepturi suplimentare
const BASE_RIGHTS = [
  "Vede și lucrează comenzile proprii și comenzile noi de pe site",
  "Creează comenzi (trec la aprobare, dacă e activată în Setări) și înregistrează plăți",
  "Vede și actualizează sarcinile proprii",
  "Vede produsele, stocul și registrul de mișcări",
  "Înregistrează recepții de marfă (stocul nou venit)",
  "Adaugă clienți și furnizori noi",
];

// Seturi rapide de drepturi pentru posturile tipice din magazin
const PRESETS = [
  { key: "sales", label: "Vânzări", perms: [] },
  { key: "warehouse", label: "Depozit", perms: ["stock.transfer", "stock.writeoff", "stock.inventory", "suppliers.manage"] },
  { key: "lead", label: "Șef vânzări", perms: ["orders.all", "orders.approve", "customers.manage", "tasks.manage", "reports.view"] },
];

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

function UserFormBody({ open, onClose, u, onSaved }) {
  const toast = useToast();
  const me = useUser();
  const owner = isOwner(me);
  const [f, setF] = useState(() => ({
    name: u?.name || "",
    email: u?.email || "",
    phone: u?.phone || "",
    position: u?.position || "",
    role: u?.role || "manager",
    password: "",
    permissions: u?.permissions || [],
    lang: u?.lang || "ro",
  }));
  const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const togglePerm = (key, on) => set({ permissions: on ? [...new Set([...f.permissions, key])] : f.permissions.filter((k) => k !== key) });
  const preset = PRESETS.find((p) => p.perms.length === f.permissions.length && p.perms.every((k) => f.permissions.includes(k)));
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
  const employee = f.role === "manager";
  // Rolul se alege doar de administratorul principal; contul principal are rol fix
  const roleOptions = u?.role === "owner"
    ? [{ key: "owner", title: "Administrator principal", text: "Acces complet + gestionează administratorii, setările și integrările. Rolul nu se poate schimba." }]
    : u?.role === "admin" && !owner
    ? [{ key: "admin", title: "Administrator", text: "Rolul administratorilor se schimbă doar de administratorul principal." }]
    : [
        { key: "manager", title: "Angajat", text: "Munca de zi cu zi: comenzile și sarcinile proprii, recepții. Nu poate șterge nimic." },
        ...(owner ? [{ key: "admin", title: "Administrator", text: "Acces complet la lucru: aprobări, ștergere, catalog, stoc, angajați." }] : []),
      ];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={u ? `Editare: ${u.name}` : "Utilizator nou"}
      description={u ? u.email : "Transmiteți colegului emailul și parola. O poate schimba din profilul său."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" loading={busy} disabled={!f.name?.trim() || !f.email?.trim() || (!u && (f.password || "").length < 6)} onClick={save}>
            {u ? "Salvează" : "Creează contul"}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={UserCircle} title="Cont" description="Date de autentificare și contact. Emailul este numele de utilizator.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nume" required><Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Email (login)" required><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Telefon"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Funcție"><Input value={f.position} onChange={(e) => set({ position: e.target.value })} placeholder="ex: Vânzări B2B, Depozit" /></Field>
            <Field label="Limba interfeței">
              <Select value={f.lang} onChange={(e) => set({ lang: e.target.value })} data-no-translate>
                <option value="ro">Română</option>
                <option value="ru">Русский</option>
              </Select>
            </Field>
            <Field label={u ? "Parolă nouă" : "Parolă"} required={!u} hint={u ? "Lăsați gol pentru a păstra parola actuală" : "Minim 6 caractere"} className="sm:col-span-2">
              <PasswordInput value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={ShieldCheck} title="Rol" description={owner ? "Administratorul are acces complet. Angajatul lucrează doar cu ce îi este permis." : "Administratorii pot fi creați doar de administratorul principal."}>
          <div className="grid gap-3 sm:grid-cols-2">
            {roleOptions.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => set({ role: r.key })}
                className={cx(
                  "rounded-xl border p-4 text-left transition-colors",
                  f.role === r.key ? "border-accent bg-accent-soft/60 ring-1 ring-accent" : "border-line hover:border-line-strong hover:bg-surface-2"
                )}
              >
                <div className="flex items-center gap-2 text-[14px] font-semibold text-fg">
                  {r.key !== "manager" ? <ShieldCheck size={17} weight="duotone" className="text-accent" /> : <UserCircle size={17} weight="duotone" className="text-accent" />}
                  {r.title}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-3">{r.text}</p>
              </button>
            ))}
          </div>
        </FormSection>

        {employee && (
          <>
            <FormSection icon={CheckCircle} title="Ce poate face orice angajat" description="Drepturile de bază, fără setări suplimentare.">
              <ul className="grid gap-2 sm:grid-cols-2">
                {BASE_RIGHTS.map((t) => (
                  <li key={t} className="flex items-start gap-2 rounded-lg bg-surface-2/70 px-3 py-2 text-[13px] text-fg-2">
                    <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-ok" />
                    {t}
                  </li>
                ))}
              </ul>
            </FormSection>

            <FormSection
              icon={Key}
              title="Drepturi suplimentare"
              description="Bifați doar ce are nevoie colegul în plus. Se aplică imediat, fără reautentificare."
              aside={
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set({ permissions: p.perms })}
                      className={cx(
                        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                        preset?.key === p.key ? "border-accent bg-accent-soft text-accent" : "border-line text-fg-2 hover:border-line-strong"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="space-y-5">
                {GROUPS.map((g) => (
                  <div key={g}>
                    <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-fg-4">{g}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                        <div key={p.key} className={cx("rounded-xl border px-3.5 py-3 transition-colors", f.permissions.includes(p.key) ? "border-accent/50 bg-accent-soft/40" : "border-line", p.key === "delete" && f.permissions.includes(p.key) && "border-bad/50 bg-bad-soft/40")}>
                          <Checkbox checked={f.permissions.includes(p.key)} onChange={(v) => togglePerm(p.key, v)} label={p.label} description={p.description} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </FormSection>
          </>
        )}
      </div>
    </Drawer>
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
    { key: "role", header: "Rol", render: (u) => <Badge tone={u.role === "owner" ? "accent" : u.role === "admin" ? "violet" : "neutral"}>{roleLabel(u.role)}</Badge> },
    {
      key: "perms",
      header: "Drepturi",
      className: "hidden md:table-cell",
      headClassName: "hidden md:table-cell",
      render: (u) =>
        u.role !== "manager" ? (
          <span className="text-[12.5px] text-fg-3">{u.role === "owner" ? "Acces complet + administratori, setări" : "Acces complet"}</span>
        ) : u.permissions?.length ? (
          <span className="text-[12.5px] text-fg-2" title={u.permissions.map(permissionLabel).join(", ")}>
            De bază + {u.permissions.length} {u.permissions.length === 1 ? "drept" : "drepturi"}
            {u.permissions.includes("delete") && <Badge tone="bad" className="ml-1.5">poate șterge</Badge>}
          </span>
        ) : (
          <span className="text-[12.5px] text-fg-3">Doar de bază</span>
        ),
    },
    { key: "status", header: "Acces", render: (u) => <Badge tone={u.active ? "ok" : "bad"} dot>{u.active ? "Activ" : "Dezactivat"}</Badge> },
    { key: "month", header: "Vânzări luna aceasta", align: "right", render: (u) => <span className="tnum">{u.month?.orders || 0} cmd. · <span className="font-medium text-fg">{moneyShort(u.month?.revenue)}</span></span> },
    { key: "login", header: "Ultima autentificare", align: "right", className: "hidden lg:table-cell", headClassName: "hidden lg:table-cell", render: (u) => <span className="text-[12.5px] text-fg-3" title={formatDateTime(u.lastLoginAt)}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "niciodată"}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (u) => (
        (isOwner(me) || u.role === "manager" || String(u._id) === me.id) && (
        <div data-stop>
          <Menu
            trigger={<Button size="xs" variant="ghost" icon={DotsThree} aria-label="Acțiuni" />}
            items={[
              { label: "Editează și drepturi", icon: PencilSimple, onClick: () => setForm({ open: true, u }) },
              { label: "Schimbă parola", icon: Key, onClick: () => setForm({ open: true, u }) },
              String(u._id) !== me.id && u.role !== "owner" && { label: u.active ? "Dezactivează accesul" : "Reactivează accesul", icon: u.active ? Prohibit : CheckCircle, onClick: () => toggleActive(u) },
              String(u._id) !== me.id && u.role !== "owner" && { divider: true },
              String(u._id) !== me.id && u.role !== "owner" && { label: "Șterge contul", icon: Trash, danger: true, onClick: () => remove(u) },
            ]}
          />
        </div>
        )
      ),
    },
  ];

  return (
    <div className="animate-in">
      <PageHeader title="Utilizatori" description="Echipa Lux Store: conturi, roluri și drepturile fiecărui angajat." actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, u: null })}>Utilizator nou</Button>} />
      <Card className="overflow-hidden">
        <DataTable columns={columns} rows={data} loading={loading} onRowClick={(u) => (isOwner(me) || u.role === "manager" || String(u._id) === me.id) && setForm({ open: true, u })} empty={<EmptyState icon={UserGear} title="Niciun utilizator" />} />
      </Card>
      <UserForm open={form.open} u={form.u} onClose={() => setForm({ open: false, u: null })} onSaved={reload} />
    </div>
  );
}
