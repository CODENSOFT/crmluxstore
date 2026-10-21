"use client";

// Transfer intre depozite — pagina de creare
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client";
import { useApi, invalidate } from "@/lib/useApi";
import { Button, Select, Field, FormSection, Textarea, Alert } from "@/app/_components/ui";
import { useToast } from "@/app/_components/overlay";
import { FormPage } from "@/app/_components/formpage";
import { ArrowsLeftRight, ArrowRight, Warning, Package, Note } from "@/app/_components/icons";
import { DocLinesEditor, linesPayload, linesValid } from "../_stockdoc";

/** Pagina „Transfer nou” */
export function TransferForm() {
  const toast = useToast();
  const router = useRouter();
  const onClose = () => router.push("/transfer");
  const { data: products } = useApi("/api/products?light=1");
  const { data: warehouses } = useApi("/api/warehouses");
  const [fromSel, setFrom] = useState("");
  const [toSel, setTo] = useState("");
  const from = fromSel || (warehouses?.[0] ? String(warehouses[0]._id) : "");
  const to = toSel || (warehouses?.[1] ? String(warehouses[1]._id) : "");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiPost("/api/transfers", { fromWarehouse: from, toWarehouse: to, note, items: linesPayload(lines) });
      toast(`Transferul ${d.number} a fost efectuat`);
      invalidate("/api/transfers", "/api/products", "/api/stock");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const valid = from && to && from !== to && linesValid(lines, { warehouse: from, checkStock: true, products });
  return (
    <FormPage
      back={{ href: "/transfer", label: "Transferuri" }}
      missing={[!lines.length && "produsele de mutat", from && to && from === to && "depozite diferite"].filter(Boolean)}
      title="Transfer nou"
      description="Mută marfa dintr-un depozit în altul (ex: din depozit în magazin)."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button variant="primary" size="lg" icon={ArrowsLeftRight} loading={saving} disabled={!valid} onClick={save}>
            Efectuează transferul
          </Button>
        </>
      }
    >
      {warehouses && warehouses.length < 2 ? (
        <Alert tone="warn" icon={Warning} title="Aveți un singur depozit">
          Adăugați încă un depozit (ex: „Magazin Lunca Bîcului”) din pagina Depozite.
        </Alert>
      ) : (
        <div className="space-y-8">
          <FormSection icon={ArrowsLeftRight} title="Traseu" description="Stocul scade în depozitul sursă și crește în cel de destinație, într-o singură operațiune.">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
            <Field label="Din depozitul">
              <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                {(warehouses || []).map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <ArrowRight size={18} className="mb-2.5 text-fg-3" />
            <Field label="În depozitul">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                {(warehouses || []).map((w) => (
                  <option key={w._id} value={w._id} disabled={w._id === from}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          </FormSection>
          <FormSection icon={Package} title="Produse" description="Căutați sau scanați produsele. Se verifică stocul din depozitul sursă.">
            <div className="overflow-hidden rounded-xl border border-line">
              <DocLinesEditor lines={lines} setLines={setLines} products={products} warehouse={from} checkStock />
            </div>
          </FormSection>
          <FormSection icon={Note} title="Notă" description="Opțional — motivul transferului.">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex: reaprovizionare raft magazin" />
          </FormSection>
        </div>
      )}
    </FormPage>
  );
}

