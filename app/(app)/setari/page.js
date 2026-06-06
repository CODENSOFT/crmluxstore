"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPut, apiPatch } from "@/lib/client";
import {
  Button,
  Card,
  Field,
  Input,
  PasswordInput,
  PageHeader,
  useToast,
} from "@/app/_components/ui";
import { Icon } from "@/app/_components/icons";
import { useUser } from "@/app/_components/user";

export default function SettingsPage() {
  const me = useUser();
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({
    companyName: "",
    currency: "MDL",
    lowStockThreshold: 5,
  });
  const [saving, setSaving] = useState(false);

  // Cont / profil
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    apiGet("/api/settings")
      .then((s) =>
        setForm({
          companyName: s.companyName || "",
          currency: s.currency || "MDL",
          lowStockThreshold: s.lowStockThreshold ?? 5,
        })
      )
      .catch((e) => toast(e.message, "error"));
    apiGet("/api/profile")
      .then((p) =>
        setProfile({ name: p.name || "", email: p.email || "", phone: p.phone || "" })
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (me?.role !== "admin") {
    return (
      <Card className="p-8 text-center text-slate-500">
        Acces permis doar administratorului.
      </Card>
    );
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPut("/api/settings", {
        ...form,
        lowStockThreshold: Number(form.lowStockThreshold),
      });
      toast("Setari salvate");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    if (pwd.next && pwd.next !== pwd.confirm) {
      toast("Parolele noi nu coincid", "error");
      return;
    }
    setSavingProfile(true);
    try {
      const payload = {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
      };
      if (pwd.next) {
        payload.currentPassword = pwd.current;
        payload.newPassword = pwd.next;
      }
      await apiPatch("/api/profile", payload);
      toast("Profil actualizat");
      setPwd({ current: "", next: "", confirm: "" });
      router.refresh(); // actualizeaza numele afisat in interfata
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Setari" subtitle="Contul tau si configurarile CRM-ului." />

      {/* Cont / profil */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Icon name="user" className="h-5 w-5" />
          </span>
          <h2 className="font-semibold text-slate-800">Contul meu</h2>
        </div>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nume">
              <Input
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </Field>
            <Field label="Telefon">
              <Input
                value={profile.phone}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Email">
            <Input
              type="email"
              value={profile.email}
              onChange={(e) =>
                setProfile({ ...profile, email: e.target.value })
              }
            />
          </Field>

          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-500">
              Schimba parola (lasa gol daca nu vrei sa o schimbi)
            </p>
            <div className="space-y-3">
              <Field label="Parola actuala">
                <PasswordInput
                  value={pwd.current}
                  onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Parola noua">
                  <PasswordInput
                    value={pwd.next}
                    onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                  />
                </Field>
                <Field label="Confirma parola">
                  <PasswordInput
                    value={pwd.confirm}
                    onChange={(e) =>
                      setPwd({ ...pwd, confirm: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? "Se salveaza…" : "Salveaza contul"}
          </Button>
        </form>
      </Card>

      {/* Setari companie */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon name="settings" className="h-5 w-5" />
          </span>
          <h2 className="font-semibold text-slate-800">Setari companie</h2>
        </div>
        <form onSubmit={save} className="space-y-4">
          <Field label="Denumire companie">
            <Input
              value={form.companyName}
              onChange={(e) =>
                setForm({ ...form, companyName: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Moneda" hint="ex: MDL, RON, EUR, USD">
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
              />
            </Field>
            <Field
              label="Prag stoc scazut"
              hint="Avertizare sub aceasta cantitate"
            >
              <Input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, lowStockThreshold: e.target.value })
                }
              />
            </Field>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Se salveaza…" : "Salveaza setarile"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
