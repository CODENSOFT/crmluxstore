"use client";

// Furnizor: pagina de adaugare / editare si pagina de detalii
import { useState } from "react";
import Link from "@/app/_components/link";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { useUser, can } from "@/app/_components/user";
import { money, formatDate, relativeTime, num } from "@/lib/format";
import { Card, PageHeader, Button, ButtonLink, Field, FormSection, Input, NumberInput, Textarea, DetailList, Skeleton, Switch, Stat, ErrorState } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { Truck, PencilSimple, Phone, EnvelopeSimple, Globe, Bank, HandCoins, Note, TrayArrowDown } from "@/app/_components/icons";

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", website: "", address: "", country: "", idno: "", iban: "", paymentTermDays: "", brands: "", note: "", active: true };

/** Pagina „Furnizor nou” / „Editare furnizor”. next = unde revenim dupa salvare (ex: /receptie/nou) */
export function SupplierForm({ supplier, next }) {
  const toast = useToast();
  const router = useRouter();
  const backHref = next || (supplier ? `/furnizori/${supplier._id}` : "/furnizori");
  const onClose = () => router.push(backHref);
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
      router.push(next ? `${next}${next.includes("?") ? "&" : "?"}supplier=${res._id}` : `/furnizori/${res._id}`);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormPage
      back={{ href: backHref, label: next ? "Înapoi la recepție" : supplier ? supplier.name : "Furnizori" }}
      title={supplier ? "Editare furnizor" : "Furnizor nou"}
      description={supplier ? "Modificați datele și salvați." : "Doar denumirea este obligatorie. Restul datelor le puteți completa oricând."}
      missing={[!f.name.trim() && "Denumire"].filter(Boolean)}
      onSubmit={() => f.name.trim() && !busy && save()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Renunță</Button>
          <Button variant="primary" size="lg" loading={busy} disabled={!f.name.trim()} onClick={save}>{supplier ? "Salvează" : "Adaugă furnizorul"}</Button>
        </>
      }
    >
      <div className="space-y-8">
        <FormSection icon={Truck} title="Furnizor" description="Denumirea și persoana cu care comunicați pentru comenzi.">
          <Field label="Denumire" required>
            <Input focusFirst value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="ex: Koch-Chemie Distribuție" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Persoană de contact"><Input value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></Field>
            <Field label="Telefon"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" /></Field>
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Website"><Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>
            <Field label="Țara"><Input value={f.country} onChange={(e) => set({ country: e.target.value })} placeholder="Moldova, România, Germania…" /></Field>
            <Field label="Adresă"><Input value={f.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          </div>
        </FormSection>
        <FormSection icon={Bank} title="Date fiscale" description="Pentru recepții cu factură și plăți prin transfer.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="IDNO / cod fiscal"><Input value={f.idno} onChange={(e) => set({ idno: e.target.value })} /></Field>
            <Field label="IBAN"><Input value={f.iban} onChange={(e) => set({ iban: e.target.value.toUpperCase() })} /></Field>
          </div>
        </FormSection>
        <FormSection icon={HandCoins} title="Condiții" description="Termenul de plată și mărcile pe care le livrează.">
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Field label="Termen de plată"><NumberInput value={f.paymentTermDays} onChange={(v) => set({ paymentTermDays: v })} suffix="zile" placeholder="0" /></Field>
            <Field label="Mărci livrate" hint="Separate prin virgulă"><Input value={f.brands} onChange={(e) => set({ brands: e.target.value })} placeholder="Koch-Chemie, FOX LINE" /></Field>
          </div>
        </FormSection>
        <FormSection icon={Note} title="Notițe" description="Condiții de livrare, comandă minimă, contacte suplimentare.">
          <Textarea rows={4} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Condiții, termene de livrare, comandă minimă…" />
          {supplier && <Switch checked={f.active} onChange={(v) => set({ active: v })} label="Furnizor activ" description="Furnizorii inactivi nu apar la recepții noi." />}
        </FormSection>
      </div>
    </FormPage>
  );
}

/** Pagina furnizorului: statistici, contact, recepții */
export function SupplierView({ id }) {
  const user = useUser();
  const { data: s, error, reload } = useApi(`/api/suppliers/${id}`, { keepPrevious: false });
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="animate-in">
      <PageHeader
        back={{ href: "/furnizori", label: "Furnizori" }}
        title={s?.name || "Furnizor"}
        description={s ? [s.country, s.contactPerson].filter(Boolean).join(" · ") || null : null}
        actions={s && (
          <>
            <ButtonLink href={`/receptie/nou?supplier=${s._id}`} icon={TrayArrowDown}>Recepție de la el</ButtonLink>
            {can(user, "suppliers.manage") && <ButtonLink href={`/furnizori/${s._id}/editare`} variant="primary" icon={PencilSimple}>Editează</ButtonLink>}
          </>
        )}
      />
      {!s ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={TrayArrowDown} label="Recepții" value={num(s.arrivals?.length || 0)} sub="ultimele 100 de documente" />
            <Stat icon={HandCoins} label="Total achiziții" value={money((s.arrivals || []).reduce((t, a) => t + (a.total || 0), 0))} sub={s.paymentTermDays ? `termen de plată ${s.paymentTermDays} zile` : "plată la livrare"} />
            <Stat icon={Truck} label="Ultima recepție" value={s.arrivals?.[0] ? relativeTime(s.arrivals[0].createdAt) : "—"} sub={s.arrivals?.[0] ? formatDate(s.arrivals[0].createdAt) : "încă nu există"} />
          </div>
          <Card className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
          <FormSection icon={Phone} title="Contact" description="Date pentru comenzi și reclamații.">
            <div className="flex flex-wrap gap-2">
              {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px] text-fg-2 transition-colors hover:border-accent hover:text-accent"><Phone size={16} />{s.phone}</a>}
              {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px] text-fg-2 transition-colors hover:border-accent hover:text-accent"><EnvelopeSimple size={16} />{s.email}</a>}
              {s.website && <a href={s.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px] text-fg-2 transition-colors hover:border-accent hover:text-accent"><Globe size={16} />{s.website.replace(/^https?:\/\//, "")}</a>}
              {!s.phone && !s.email && !s.website && <p className="text-[13px] text-fg-3">Nu sunt completate date de contact.</p>}
            </div>
            <DetailList cols={2} items={[["Persoană de contact", s.contactPerson], ["Adresă", s.address], ["IDNO", s.idno], ["IBAN", s.iban], ["Mărci", (s.brands || []).join(", ")]]} />
            {s.note && <p className="whitespace-pre-line rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-fg-2">{s.note}</p>}
          </FormSection>
          <FormSection icon={TrayArrowDown} title="Recepții" description="Documentele de intrare a mărfii de la acest furnizor.">
            {s.arrivals?.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
                {s.arrivals.map((a) => (
                  <li key={a._id}>
                    <Link href={`/receptie/${a._id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="font-medium text-fg">{a.number || "Recepție"}</span>
                        <span className="ml-2 text-fg-3">{formatDate(a.createdAt)} · {a.warehouse?.name}{a.supplierInvoice ? ` · fact. ${a.supplierInvoice}` : ""}</span>
                      </span>
                      <span className="tnum shrink-0 font-semibold text-fg">{money(a.total || 0)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-fg-3">Nicio recepție încă.</p>
            )}
          </FormSection>
          </Card>
        </div>
      )}
    </div>
  );
}

