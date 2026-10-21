"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/client";
import { invalidate, useApi } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { CUSTOMER_SEGMENTS, CUSTOMER_SOURCES } from "@/lib/constants";
import { Button, Field, FormSection, Input, NumberInput, Select, Textarea, Segmented, Alert } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { Buildings, User, Warning, Bank, Truck, HandCoins, Note } from "@/app/_components/icons";

const EMPTY = {
  type: "individual",
  name: "",
  contactPerson: "",
  phone: "",
  phone2: "",
  email: "",
  idno: "",
  vatCode: "",
  iban: "",
  bank: "",
  legalAddress: "",
  city: "",
  address: "",
  segment: "retail",
  priceType: "retail",
  discount: "",
  paymentTermDays: "",
  source: "",
  tags: "",
  note: "",
  manager: "",
};

function initial(customer) {
  if (!customer) return EMPTY;
  return {
    ...EMPTY,
    ...Object.fromEntries(Object.entries(customer).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ""])),
    tags: (customer.tags || []).join(", "),
    manager: customer.manager?._id || customer.manager || "",
    discount: customer.discount ? String(customer.discount) : "",
    paymentTermDays: customer.paymentTermDays ? String(customer.paymentTermDays) : "",
  };
}

/** Pagina „Client nou” / „Editare client” */
export function CustomerForm({ customer }) {
  const toast = useToast();
  const router = useRouter();
  const backHref = customer ? `/clienti/${customer._id}` : "/clienti";
  const onClose = () => router.push(backHref);
  const user = useUser();
  const { data: users } = useApi(can(user, "customers.manage") ? "/api/users" : null);
  const [f, setF] = useState(() => initial(customer));
  const [saving, setSaving] = useState(false);
  const [dup, setDup] = useState(null);

  const set = (p) => setF((x) => ({ ...x, ...p }));
  const company = f.type === "company";

  async function save(force = false) {
    setSaving(true);
    try {
      const body = { ...f, discount: Number(f.discount) || 0, paymentTermDays: Number(f.paymentTermDays) || 0, force };
      const res = customer ? await apiPatch(`/api/customers/${customer._id}`, body) : await apiPost("/api/customers", body);
      toast(customer ? "Datele clientului au fost salvate" : `Clientul „${res.name}” a fost adăugat`);
      invalidate("/api/customers", "/api/search");
      router.push(`/clienti/${res._id}`);
    } catch (e) {
      if (e.status === 409 && e.body?.duplicate) {
        setDup(e.body.duplicate);
        toast(`Există deja clientul „${e.body.duplicate.name}”`, "error");
      } else toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormPage
      back={{ href: backHref, label: customer ? customer.name : "Clienți" }}
      title={customer ? "Editare client" : "Client nou"}
      description={customer ? `${customer.number || ""} · modificați datele și salvați.` : "Doar numele este obligatoriu. Telefonul ajută la găsirea rapidă a clientului și la legarea comenzilor de pe site și din Telegram."}
      missing={[!f.name.trim() && (company ? "Denumirea companiei" : "Nume și prenume")].filter(Boolean)}
      onSubmit={() => f.name.trim() && !saving && save(false)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" size="lg" loading={saving} disabled={!f.name.trim()} onClick={() => save(false)}>
            {customer ? "Salvează" : "Adaugă clientul"}
          </Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={company ? Buildings : User} title="Date principale" description="Tipul clientului stabilește prețurile implicite: companiile primesc prețuri angro.">
          <Segmented
            value={f.type}
            onChange={(v) =>
              set({
                type: v,
                ...(!customer ? { segment: v === "company" ? "carwash" : "retail", priceType: v === "company" ? "wholesale" : "retail" } : {}),
              })
            }
            options={[
              { value: "individual", label: "Persoană fizică", icon: User },
              { value: "company", label: "Persoană juridică", icon: Buildings },
            ]}
          />
          <Field label={company ? "Denumirea companiei" : "Nume și prenume"} required>
            <Input autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={company ? "SRL AquaWash Self-Service" : "Ion Popescu"} />
          </Field>
          {company && (
            <Field label="Persoană de contact">
              <Input value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} placeholder="Nume, funcție" />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Telefon">
              <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+373 6x xxx xxx" inputMode="tel" />
            </Field>
            <Field label="Telefon suplimentar">
              <Input value={f.phone2} onChange={(e) => set({ phone2: e.target.value })} inputMode="tel" />
            </Field>
            <Field label="Email" className="sm:col-span-2 xl:col-span-1">
              <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="nume@exemplu.md" />
            </Field>
          </div>
        </FormSection>

        {company && (
          <FormSection icon={Bank} title="Date fiscale și bancare" description="Necesare pentru facturi fiscale și plăți prin transfer.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="IDNO (cod fiscal)" hint="13 cifre">
                <Input value={f.idno} onChange={(e) => set({ idno: e.target.value.replace(/\s/g, "") })} inputMode="numeric" maxLength={13} />
              </Field>
              <Field label="Cod TVA">
                <Input value={f.vatCode} onChange={(e) => set({ vatCode: e.target.value })} />
              </Field>
              <Field label="IBAN" className="sm:col-span-2">
                <Input value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} placeholder="MD00 XX00 0000 0000 0000 0000" />
              </Field>
              <Field label="Banca">
                <Input value={f.bank} onChange={(e) => set({ bank: e.target.value })} placeholder="ex: MAIB" />
              </Field>
              <Field label="Adresa juridică">
                <Input value={f.legalAddress} onChange={(e) => set({ legalAddress: e.target.value })} />
              </Field>
            </div>
          </FormSection>
        )}

        <FormSection icon={Truck} title="Livrare" description="Adresa se completează automat în comenzile noi ale clientului.">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <Field label="Oraș / localitate">
              <Input value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Chișinău" />
            </Field>
            <Field label="Adresa de livrare">
              <Input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="str., nr., ap. / spălătoria" />
            </Field>
          </div>
        </FormSection>

        <FormSection icon={HandCoins} title="Condiții comerciale" description="Segmentul, tipul de preț, reducerea și termenul de plată se aplică automat la fiecare comandă.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Segment">
              <Select value={f.segment} onChange={(e) => set({ segment: e.target.value })}>
                {CUSTOMER_SEGMENTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tip preț">
              <Select value={f.priceType} onChange={(e) => set({ priceType: e.target.value })}>
                <option value="retail">Cu amănuntul</option>
                <option value="wholesale">Angro</option>
              </Select>
            </Field>
            <Field label="Reducere implicită" hint="Aplicată automat în comenzi">
              <NumberInput value={f.discount} onChange={(v) => set({ discount: v })} placeholder="0" suffix="%" />
            </Field>
            <Field label="Termen de plată" hint="0 = plată la livrare">
              <NumberInput value={f.paymentTermDays} onChange={(v) => set({ paymentTermDays: v })} placeholder="0" suffix="zile" />
            </Field>
            <Field label="Sursa clientului">
              <Select value={f.source} onChange={(e) => set({ source: e.target.value })}>
                <option value="">—</option>
                {CUSTOMER_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            {users && (
              <Field label="Manager responsabil">
                <Select value={f.manager} onChange={(e) => set({ manager: e.target.value })}>
                  <option value="">—</option>
                  {users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                </Select>
              </Field>
            )}
          </div>
          <Field label="Etichete" hint="Separate prin virgulă, ex: VIP, 3 posturi, Koch-Chemie">
            <Input value={f.tags} onChange={(e) => set({ tags: e.target.value })} />
          </Field>
        </FormSection>

        <FormSection icon={Note} title="Notițe" description="Vizibile doar în CRM, pentru echipă.">
          <Textarea rows={4} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Preferințe, echipamente instalate, programul de lucru…" />
        </FormSection>

        {dup && (
          <Alert tone="warn" icon={Warning} title={`Există deja clientul „${dup.name}” cu aceleași date de contact`}>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => save(true)}>
              Salvează totuși un client nou
            </Button>
          </Alert>
        )}
      </div>
    </FormPage>
  );
}
